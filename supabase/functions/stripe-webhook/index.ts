import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const log = (step: string, details?: unknown) =>
  console.log(JSON.stringify({ fn: "stripe-webhook", step, ...(details ? { details } : {}) }));

const getPriceToPlan = (): Record<string, string> => {
  const map: Record<string, string> = {};
  const pro = Deno.env.get("STRIPE_PRICE_PRO");
  const bundle = Deno.env.get("STRIPE_PRICE_BUNDLE");
  if (pro) map[pro] = "pro";
  if (bundle) map[bundle] = "bundle";
  return map;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeKey) {
    console.error(JSON.stringify({ fn: "stripe-webhook", step: "MISSING_SECRET", key: "STRIPE_SECRET_KEY" }));
    return new Response("Server misconfiguration", { status: 500 });
  }

  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  const rawBody = await req.text();
  const signature = req.headers.get("stripe-signature");

  let event: Stripe.Event;
  try {
    if (webhookSecret && signature) {
      // CRITICAL: Use constructEventAsync with SubtleCryptoProvider for Deno compatibility
      event = await stripe.webhooks.constructEventAsync(
        rawBody,
        signature,
        webhookSecret,
        undefined,
        Stripe.createSubtleCryptoProvider()
      );
      log("SIGNATURE_VERIFIED");
    } else {
      log("WARNING_NO_SIGNATURE_VERIFICATION");
      event = JSON.parse(rawBody) as Stripe.Event;
    }
  } catch (err) {
    log("SIGNATURE_FAILED", { error: (err as Error).message });
    return new Response(JSON.stringify({ error: "Signature verification failed" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  log("EVENT_RECEIVED", { id: event.id, type: event.type });

  // Guard: ensure event has proper Stripe structure
  if (!event?.data?.object) {
    log("INVALID_EVENT_STRUCTURE", { id: event?.id, type: event?.type });
    return new Response(JSON.stringify({ error: "Invalid event structure" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Idempotency check
  const { data: existingEvent } = await supabase
    .from("stripe_events")
    .select("id, status")
    .eq("event_id", event.id)
    .maybeSingle();

  if (existingEvent) {
    log("IDEMPOTENT_SKIP", { event_id: event.id });
    return new Response(JSON.stringify({ received: true, skipped: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const obj = event.data.object as any;
  const customerId = obj.customer as string | undefined;

  // Claim idempotency slot
  const { error: insertError } = await supabase.from("stripe_events").insert({
    event_id: event.id,
    type: event.type,
    status: "processing",
    customer_id: customerId ?? null,
  });

  if (insertError?.code === "23505") {
    log("RACE_CONDITION_SKIP", { event_id: event.id });
    return new Response(JSON.stringify({ received: true, skipped: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    switch (event.type) {
      // ── checkout.session.completed ──────────────────────────────────────
      case "checkout.session.completed": {
        const session = obj as Stripe.Checkout.Session;
        const userId = session.metadata?.user_id ?? session.client_reference_id;
        const planId = session.metadata?.plan_id;

        log("CHECKOUT_COMPLETED", { userId, planId, customerId, mode: session.mode, sessionId: session.id });

        if (!userId || !planId) {
          log("MISSING_METADATA", { userId, planId });
          await supabase.from("stripe_events").update({
            status: "error",
            error: "Missing user_id or plan_id in metadata",
            user_id: userId ?? null,
          }).eq("event_id", event.id);
          return new Response(JSON.stringify({ received: true }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Store stripe_customer_id on profiles for all plans
        if (customerId) {
          await supabase.from("profiles").update({
            stripe_customer_id: customerId,
          }).eq("user_id", userId);
        }

        if (planId === "bundle") {
          // ── BUNDLE: one-time payment ──
          const { error: subErr } = await supabase.from("subscriptions").update({
            plan: "bundle",
            status: "active",
            stripe_customer_id: customerId ?? null,
            stripe_subscription_id: null,
            current_period_end: null,
          }).eq("user_id", userId);
          if (subErr) log("BUNDLE_SUB_UPDATE_ERROR", { error: subErr.message });

          const { error: profErr } = await supabase.from("profiles").update({
            lifetime_access: true,
            stripe_customer_id: customerId ?? null,
          }).eq("user_id", userId);
          if (profErr) log("BUNDLE_PROFILE_UPDATE_ERROR", { error: profErr.message });

          // Insert purchase record
          const { error: purchErr } = await supabase.from("purchases").insert({
            user_id: userId,
            stripe_customer_id: customerId ?? null,
            stripe_checkout_session_id: session.id,
            stripe_payment_intent_id: (session.payment_intent as string) ?? null,
            price_id: Deno.env.get("STRIPE_PRICE_BUNDLE") ?? null,
            amount: session.amount_total ?? 4900,
            currency: session.currency ?? "eur",
            status: "completed",
          });
          if (purchErr && purchErr.code !== "23505") {
            log("PURCHASE_INSERT_ERROR", { error: purchErr.message });
          }

          log("BUNDLE_ACTIVATED", { userId, customerId });

        } else if (planId === "pro") {
          // ── PRO: subscription ──
          let periodEnd: string | null = null;
          let stripeSubId: string | null = (session.subscription as string) ?? null;

          if (session.subscription) {
            try {
              const sub = await stripe.subscriptions.retrieve(session.subscription as string);
              const ts = (sub as any).current_period_end;
              periodEnd = ts ? new Date(ts * 1000).toISOString() : null;
              stripeSubId = sub.id;
            } catch (e) {
              log("SUB_RETRIEVE_ERROR", { error: (e as Error).message });
            }
          }

          const { error: subErr } = await supabase.from("subscriptions").update({
            plan: "pro",
            status: "active",
            stripe_customer_id: customerId ?? null,
            stripe_subscription_id: stripeSubId,
            current_period_end: periodEnd,
          }).eq("user_id", userId);
          if (subErr) log("PRO_SUB_UPDATE_ERROR", { error: subErr.message });

          log("PRO_ACTIVATED", { userId, periodEnd });
        }

        await supabase.from("stripe_events").update({ user_id: userId }).eq("event_id", event.id);
        break;
      }

      // ── customer.subscription.created / updated ────────────────────────
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = obj as Stripe.Subscription;
        const priceId = sub.items.data[0]?.price?.id;
        const PRICE_TO_PLAN = getPriceToPlan();
        const planId = priceId ? (PRICE_TO_PLAN[priceId] ?? "pro") : "pro";
        const ts = (sub as any).current_period_end;
        const periodEnd = ts ? new Date(ts * 1000).toISOString() : null;

        log(event.type, { customerId, planId, priceId, subId: sub.id });

        const { data: subRow } = await supabase
          .from("subscriptions")
          .select("user_id, plan")
          .eq("stripe_customer_id", customerId ?? "")
          .maybeSingle();

        const userId = subRow?.user_id ?? obj.metadata?.user_id;

        if (userId) {
          if (subRow?.plan === "bundle") {
            log("SKIP_BUNDLE_USER", { userId });
            break;
          }
          await supabase.from("subscriptions").update({
            plan: planId as any,
            status: sub.status === "active" ? "active" : (sub.status as any),
            stripe_subscription_id: sub.id,
            current_period_end: periodEnd,
          }).eq("user_id", userId);
          log("SUB_UPDATED", { userId, planId, status: sub.status });
        } else {
          log("NO_USER_FOR_SUB_EVENT", { customerId });
        }
        break;
      }

      // ── customer.subscription.deleted ───────────────────────────────────
      case "customer.subscription.deleted": {
        const { data: subRow } = await supabase
          .from("subscriptions")
          .select("user_id, plan")
          .eq("stripe_customer_id", customerId ?? "")
          .maybeSingle();

        if (subRow?.user_id) {
          if (subRow.plan === "bundle") {
            log("SKIP_BUNDLE_DELETE", { userId: subRow.user_id });
            break;
          }
          await supabase.from("subscriptions").update({
            plan: "free",
            status: "canceled",
            stripe_subscription_id: null,
            current_period_end: null,
          }).eq("user_id", subRow.user_id);
          log("DOWNGRADED_TO_FREE", { userId: subRow.user_id });
        }
        break;
      }

      // ── invoice.paid ────────────────────────────────────────────────────
      case "invoice.paid": {
        const invoice = obj as Stripe.Invoice;
        const subId = (invoice as any).subscription as string | undefined;
        if (subId) {
          const ts = (invoice as any).period_end;
          const endDate = ts ? new Date(ts * 1000).toISOString() : null;
          await supabase.from("subscriptions").update({
            status: "active",
            current_period_end: endDate,
          }).eq("stripe_subscription_id", subId);
          log("INVOICE_PAID", { subId, endDate });
        }
        break;
      }

      // ── invoice.payment_failed ──────────────────────────────────────────
      case "invoice.payment_failed": {
        const invoice = obj as Stripe.Invoice;
        const subId = (invoice as any).subscription as string | undefined;
        if (subId) {
          await supabase.from("subscriptions").update({
            status: "past_due",
          }).eq("stripe_subscription_id", subId);
          log("INVOICE_FAILED", { subId });
        }
        break;
      }

      default:
        log("UNHANDLED_EVENT", { type: event.type });
    }

    await supabase.from("stripe_events").update({ status: "success" }).eq("event_id", event.id);
    log("EVENT_PROCESSED", { event_id: event.id });

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = (error as Error).message;
    console.error(JSON.stringify({ fn: "stripe-webhook", step: "HANDLER_ERROR", error: msg }));
    await supabase.from("stripe_events").update({ status: "error", error: msg }).eq("event_id", event.id);
    return new Response(JSON.stringify({ received: true, error: msg }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
