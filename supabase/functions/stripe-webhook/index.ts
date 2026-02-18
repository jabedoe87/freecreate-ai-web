import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const log = (step: string, details?: unknown) =>
  console.log(`[STRIPE-WEBHOOK] ${step}${details ? " | " + JSON.stringify(details) : ""}`);

// Known price → plan mapping (must match Stripe dashboard price IDs exactly)
const PRICE_TO_PLAN: Record<string, string> = {
  "price_1T1fRGDHxEfwTYTRHsy1ncWk": "pro",
  "price_1T1fRODHxEfwTYTRSpZ7Zr1W": "bundle",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeKey) {
    console.error("[STRIPE-WEBHOOK] STRIPE_SECRET_KEY is not set");
    return new Response("Server misconfiguration", { status: 500 });
  }

  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

  // Service role bypasses RLS — required for all webhook DB writes
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  // Raw body must be read before any other parsing for signature verification
  const rawBody = await req.text();
  const signature = req.headers.get("stripe-signature");

  let event: Stripe.Event;
  try {
    if (webhookSecret && signature) {
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } else {
      // Dev fallback: skip signature verification if secret not configured
      log("WARNING: No webhook secret, skipping signature verification");
      event = JSON.parse(rawBody) as Stripe.Event;
    }
  } catch (err) {
    log("Signature verification failed", { error: (err as Error).message });
    return new Response("Signature verification failed", { status: 400 });
  }

  log("Event received", { id: event.id, type: event.type });

  // Idempotency: check if event was already processed before doing any work
  const { data: existingEvent } = await supabase
    .from("stripe_events")
    .select("id, status")
    .eq("event_id", event.id)
    .maybeSingle();

  if (existingEvent) {
    log("Event already processed, skipping", { event_id: event.id, status: existingEvent.status });
    return new Response(JSON.stringify({ received: true, skipped: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const obj = event.data.object as any;
  const customerId = obj.customer as string | undefined;

  // Insert event record immediately to claim idempotency slot
  const { error: insertError } = await supabase.from("stripe_events").insert({
    event_id: event.id,
    type: event.type,
    status: "processing",
    customer_id: customerId ?? null,
  });

  // Race condition: another invocation already inserted this event
  if (insertError?.code === "23505") {
    log("Race condition: event already inserted", { event_id: event.id });
    return new Response(JSON.stringify({ received: true, skipped: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (insertError) {
    console.error("[STRIPE-WEBHOOK] Failed to insert stripe_event:", insertError.message);
    // Still attempt to process — don't block on logging failure
  }

  try {
    switch (event.type) {

      // ── checkout.session.completed ──────────────────────────────────────────
      case "checkout.session.completed": {
        const session = obj as Stripe.Checkout.Session;
        const userId = session.metadata?.user_id;
        const planId = session.metadata?.plan_id;

        log("checkout.session.completed", { userId, planId, customerId, sessionId: session.id });

        if (!userId || !planId) {
          console.error("[STRIPE-WEBHOOK] MISSING user_id or plan_id in checkout metadata");
          await supabase.from("stripe_events").update({
            status: "error",
            error: "Missing user_id or plan_id in metadata",
          }).eq("event_id", event.id);
          // Return 200 so Stripe does not retry — this is a data contract error
          return new Response(JSON.stringify({ received: true }), {
            status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Fetch full subscription details to get current_period_end timestamp
        let periodEnd: string | null = null;
        let stripeSubId: string | null = (session.subscription as string) ?? null;

        if (session.subscription) {
          try {
            const sub = await stripe.subscriptions.retrieve(session.subscription as string);
            const ts = (sub as any).current_period_end;
            periodEnd = ts ? new Date(ts * 1000).toISOString() : null;
            stripeSubId = sub.id;
            log("Subscription retrieved", { subId: sub.id, periodEnd });
          } catch (e) {
            log("Could not retrieve subscription details", { error: (e as Error).message });
          }
        }

        // Update profile — stripe_customer_id is needed for portal + future webhook lookups
        const { error: profileErr } = await supabase
          .from("profiles")
          .update({ stripe_customer_id: customerId ?? null })
          .eq("user_id", userId);
        if (profileErr) console.error("[STRIPE-WEBHOOK] Profile update error:", profileErr.message);
        else log("Profile stripe_customer_id updated", { userId, customerId });

        // Upsert subscription row — conflict on user_id to handle re-subscriptions
        const { error: subErr } = await supabase.from("subscriptions").update({
          plan: planId as any,
          status: "active",
          stripe_customer_id: customerId ?? null,
          stripe_subscription_id: stripeSubId,
          current_period_end: periodEnd,
        }).eq("user_id", userId);
        if (subErr) console.error("[STRIPE-WEBHOOK] Subscription update error:", subErr.message);
        else log("Subscription updated to active", { userId, planId, periodEnd });

        break;
      }

      // ── customer.subscription.created / updated ─────────────────────────────
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = obj as Stripe.Subscription;
        const priceId = sub.items.data[0]?.price?.id;
        // Resolve plan from price id — fallback to 'pro' if the price is unknown
        const planId = priceId ? (PRICE_TO_PLAN[priceId] ?? "pro") : "pro";
        const ts = (sub as any).current_period_end;
        const periodEnd = ts ? new Date(ts * 1000).toISOString() : null;

        log(`${event.type}`, { customerId, planId, priceId, periodEnd, subId: sub.id });

        // Resolve user_id from stored stripe_customer_id
        const { data: subRow } = await supabase
          .from("subscriptions")
          .select("user_id")
          .eq("stripe_customer_id", customerId ?? "")
          .maybeSingle();

        // If no DB row yet, try metadata fallback (rare edge case on subscription.created)
        const userId = subRow?.user_id ?? obj.metadata?.user_id;

        if (userId) {
          await supabase.from("subscriptions").update({
            plan: planId as any,
            status: sub.status === "active" ? "active" : (sub.status as any),
            stripe_subscription_id: sub.id,
            current_period_end: periodEnd,
          }).eq("user_id", userId);
          log("Subscription row updated", { userId, planId, status: sub.status });
        } else {
          log("Could not resolve user_id for subscription event", { customerId });
        }
        break;
      }

      // ── customer.subscription.deleted ───────────────────────────────────────
      case "customer.subscription.deleted": {
        const sub = obj as Stripe.Subscription;

        const { data: subRow } = await supabase
          .from("subscriptions")
          .select("user_id, plan")
          .eq("stripe_customer_id", customerId ?? "")
          .maybeSingle();

        const userId = subRow?.user_id;
        log("customer.subscription.deleted", { userId, currentPlan: subRow?.plan });

        if (userId) {
          // Bundle is a lifetime purchase — never downgrade it on subscription deletion
          if (subRow?.plan !== "bundle") {
            await supabase.from("subscriptions").update({
              plan: "free",
              status: "canceled",
              stripe_subscription_id: null,
              current_period_end: null,
            }).eq("user_id", userId);
            log("Downgraded to free", { userId });
          } else {
            // Keep bundle plan but update status
            await supabase.from("subscriptions").update({ status: "canceled" }).eq("user_id", userId);
            log("Bundle kept, marked canceled", { userId });
          }
        }
        break;
      }

      // ── invoice.paid ────────────────────────────────────────────────────────
      case "invoice.paid": {
        const invoice = obj as Stripe.Invoice;
        const subId = (invoice as any).subscription as string | undefined;

        if (subId) {
          // Use invoice period_end to push the renewal date forward
          const ts = (invoice as any).period_end;
          const endDate = ts ? new Date(ts * 1000).toISOString() : null;
          await supabase.from("subscriptions").update({
            status: "active",
            current_period_end: endDate,
          }).eq("stripe_subscription_id", subId);
          log("invoice.paid — subscription renewed", { subId, endDate });
        }
        break;
      }

      default:
        log("Unhandled event type", { type: event.type });
    }

    // Mark event as successfully processed
    await supabase.from("stripe_events").update({
      status: "success",
    }).eq("event_id", event.id);

    log("Event processed successfully", { event_id: event.id });

    return new Response(JSON.stringify({ received: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    const msg = (error as Error).message;
    console.error("[STRIPE-WEBHOOK] Handler error:", msg);

    // Persist error for debug page visibility
    await supabase.from("stripe_events").update({
      status: "error",
      error: msg,
    }).eq("event_id", event.id);

    // Return 200 to Stripe — retrying won't fix a code-level error
    return new Response(JSON.stringify({ received: true, error: msg }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
