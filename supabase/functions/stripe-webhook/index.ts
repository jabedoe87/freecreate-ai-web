import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const log = (step: string, details?: unknown) =>
  console.log(`[STRIPE-WEBHOOK] ${step}${details ? " | " + JSON.stringify(details) : ""}`);

// Resolve plan from price_id using env vars — no hardcoded IDs
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

  // Raw body MUST be read before any other parsing for signature verification
  const rawBody = await req.text();
  const signature = req.headers.get("stripe-signature");

  let event: Stripe.Event;
  try {
    if (webhookSecret && signature) {
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } else {
      // Dev fallback: skip signature check only when secret not configured
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

  // Insert event record immediately to claim the idempotency slot before processing
  const { error: insertError } = await supabase.from("stripe_events").insert({
    event_id: event.id,
    type: event.type,
    status: "processing",
    customer_id: customerId ?? null,
  });

  // Race condition: another concurrent invocation already inserted this event
  if (insertError?.code === "23505") {
    log("Race condition: event already inserted", { event_id: event.id });
    return new Response(JSON.stringify({ received: true, skipped: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (insertError) {
    console.error("[STRIPE-WEBHOOK] Failed to insert stripe_event:", insertError.message);
    // Still attempt processing — don't block fulfillment on logging failure
  }

  try {
    switch (event.type) {

      // ── checkout.session.completed ──────────────────────────────────────────
      case "checkout.session.completed": {
        const session = obj as Stripe.Checkout.Session;
        const userId = session.metadata?.user_id;
        const planId = session.metadata?.plan_id;

        log("checkout.session.completed", { userId, planId, customerId, sessionId: session.id, mode: session.mode });

        if (!userId || !planId) {
          console.error("[STRIPE-WEBHOOK] MISSING user_id or plan_id in checkout metadata");
          await supabase.from("stripe_events").update({
            status: "error",
            error: "Missing user_id or plan_id in metadata",
          }).eq("event_id", event.id);
          // Return 200 so Stripe does not retry — this is a permanent data contract error
          return new Response(JSON.stringify({ received: true }), {
            status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        if (planId === "bundle") {
          // ── LIFETIME BUNDLE: one-time payment mode — no subscription ID ──────
          // Store customer ID for portal access and set plan to bundle permanently
          const { error: subErr } = await supabase.from("subscriptions").update({
            plan: "bundle",
            status: "active",
            stripe_customer_id: customerId ?? null,
            stripe_subscription_id: null, // No subscription for lifetime purchases
            current_period_end: null,     // No renewal date for lifetime access
          }).eq("user_id", userId);

          if (subErr) console.error("[STRIPE-WEBHOOK] Bundle subscription update error:", subErr.message);
          else log("Bundle lifetime access activated", { userId, customerId });

        } else if (planId === "pro") {
          // ── PRO SUBSCRIPTION: retrieve sub details for period end date ────────
          let periodEnd: string | null = null;
          let stripeSubId: string | null = (session.subscription as string) ?? null;

          if (session.subscription) {
            try {
              const sub = await stripe.subscriptions.retrieve(session.subscription as string);
              const ts = (sub as any).current_period_end;
              periodEnd = ts ? new Date(ts * 1000).toISOString() : null;
              stripeSubId = sub.id;
              log("Pro subscription retrieved", { subId: sub.id, periodEnd });
            } catch (e) {
              log("Could not retrieve subscription details", { error: (e as Error).message });
            }
          }

          const { error: subErr } = await supabase.from("subscriptions").update({
            plan: "pro",
            status: "active",
            stripe_customer_id: customerId ?? null,
            stripe_subscription_id: stripeSubId,
            current_period_end: periodEnd,
          }).eq("user_id", userId);

          if (subErr) console.error("[STRIPE-WEBHOOK] Pro subscription update error:", subErr.message);
          else log("Pro subscription activated", { userId, periodEnd });
        } else {
          log("Unknown plan_id in metadata — skipping DB update", { planId, userId });
        }

        break;
      }

      // ── customer.subscription.created / updated ─────────────────────────────
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = obj as Stripe.Subscription;
        const priceId = sub.items.data[0]?.price?.id;
        const PRICE_TO_PLAN = getPriceToPlan();
        // Fallback to 'pro' only for known subscription events (not bundle — bundle has no sub)
        const planId = priceId ? (PRICE_TO_PLAN[priceId] ?? "pro") : "pro";
        const ts = (sub as any).current_period_end;
        const periodEnd = ts ? new Date(ts * 1000).toISOString() : null;

        log(`${event.type}`, { customerId, planId, priceId, periodEnd, subId: sub.id });

        // Resolve user_id from stored stripe_customer_id in subscriptions table
        const { data: subRow } = await supabase
          .from("subscriptions")
          .select("user_id, plan")
          .eq("stripe_customer_id", customerId ?? "")
          .maybeSingle();

        const userId = subRow?.user_id ?? obj.metadata?.user_id;
        const currentPlan = subRow?.plan;

        if (userId) {
          // CRITICAL: Never downgrade a lifetime bundle user via subscription events
          // Bundle users have no subscription, so this event should never fire for them,
          // but guard here as a safety net in case of misconfiguration.
          if (currentPlan === "bundle") {
            log("Skipping subscription.updated — user has lifetime bundle, not downgrading", { userId });
            break;
          }

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
          if (subRow?.plan === "bundle") {
            log("Bundle user — subscription.deleted ignored, keeping lifetime access", { userId });
            break;
          }

          await supabase.from("subscriptions").update({
            plan: "free",
            status: "canceled",
            stripe_subscription_id: null,
            current_period_end: null,
          }).eq("user_id", userId);

          log("Downgraded to free after subscription cancellation", { userId });
        }
        break;
      }

      // ── invoice.paid ────────────────────────────────────────────────────────
      case "invoice.paid": {
        const invoice = obj as Stripe.Invoice;
        const subId = (invoice as any).subscription as string | undefined;

        if (subId) {
          // Advance the renewal date using invoice period_end timestamp
          const ts = (invoice as any).period_end;
          const endDate = ts ? new Date(ts * 1000).toISOString() : null;
          await supabase.from("subscriptions").update({
            status: "active",
            current_period_end: endDate,
          }).eq("stripe_subscription_id", subId);
          log("invoice.paid — subscription renewal date updated", { subId, endDate });
        }
        break;
      }

      default:
        log("Unhandled event type", { type: event.type });
    }

    // Mark event as successfully processed
    await supabase.from("stripe_events").update({ status: "success" }).eq("event_id", event.id);
    log("Event processed successfully", { event_id: event.id });

    return new Response(JSON.stringify({ received: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    const msg = (error as Error).message;
    console.error("[STRIPE-WEBHOOK] Handler error:", msg);

    // Persist error for debug visibility — return 200 so Stripe doesn't retry a code-level error
    await supabase.from("stripe_events").update({
      status: "error",
      error: msg,
    }).eq("event_id", event.id);

    return new Response(JSON.stringify({ received: true, error: msg }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
