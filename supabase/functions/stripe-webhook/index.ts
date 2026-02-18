import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const log = (step: string, details?: unknown) =>
  console.log(`[STRIPE-WEBHOOK] ${step}${details ? " - " + JSON.stringify(details) : ""}`);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  let event: Stripe.Event;
  try {
    if (webhookSecret && sig) {
      event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
    } else {
      // Allow unsigned events in dev (no webhook secret configured)
      event = JSON.parse(body) as Stripe.Event;
      log("WARNING: No webhook secret configured, skipping signature verification");
    }
  } catch (err) {
    log("Signature verification failed", { error: (err as Error).message });
    return new Response(JSON.stringify({ error: "Invalid signature" }), { status: 400, headers: corsHeaders });
  }

  log("Event received", { id: event.id, type: event.type });

  // Idempotency check — insert event_id first
  const { error: insertError } = await supabase.from("stripe_events").insert({
    event_id: event.id,
    type: event.type,
    status: "pending",
  });

  if (insertError?.code === "23505") {
    // Unique violation = already processed
    log("Event already processed, skipping", { event_id: event.id });
    return new Response(JSON.stringify({ received: true, skipped: true }), { status: 200, headers: corsHeaders });
  }

  try {
    const obj = event.data.object as any;
    const customerId = obj.customer as string | undefined;

    switch (event.type) {
      case "checkout.session.completed": {
        const session = obj as Stripe.Checkout.Session;
        const userId = session.metadata?.user_id;
        const plan = (session.metadata?.plan_id || session.metadata?.plan) as string;
        const priceId = session.metadata?.price_id;

        log("checkout.session.completed", { userId, plan, priceId });

        if (userId && plan) {
          // Update subscription in DB
          await supabase.from("subscriptions").update({
            plan: plan as any,
            status: "active",
            stripe_customer_id: customerId ?? null,
            stripe_subscription_id: (session.subscription as string) ?? null,
          }).eq("user_id", userId);
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = obj as Stripe.Subscription;
        const periodEnd = (sub as any).current_period_end;
        const endDate = periodEnd ? new Date(periodEnd * 1000).toISOString() : null;

        // Resolve user_id from stripe_customer_id
        const { data: subRow } = await supabase
          .from("subscriptions")
          .select("user_id")
          .eq("stripe_customer_id", customerId ?? "")
          .maybeSingle();

        const userId = subRow?.user_id;
        const productId = sub.items.data[0]?.price?.product as string | undefined;

        const PRODUCT_TO_PLAN: Record<string, string> = {
          prod_TzekEm3i5ZcS6e: "pro",
          prod_TzekhtWD8qlVi8: "bundle",
        };
        const plan = productId ? (PRODUCT_TO_PLAN[productId] || "pro") : "pro";

        log(`${event.type}`, { userId, plan, endDate });

        if (userId) {
          await supabase.from("subscriptions").update({
            plan: plan as any,
            status: sub.status === "active" ? "active" : (sub.status as any),
            stripe_subscription_id: sub.id,
            current_period_end: endDate,
          }).eq("user_id", userId);
        }
        break;
      }

      case "customer.subscription.deleted": {
        const sub = obj as Stripe.Subscription;

        const { data: subRow } = await supabase
          .from("subscriptions")
          .select("user_id, plan")
          .eq("stripe_customer_id", customerId ?? "")
          .maybeSingle();

        const userId = subRow?.user_id;

        log("customer.subscription.deleted", { userId });

        if (userId && subRow?.plan !== "bundle") {
          // Downgrade to free unless lifetime bundle
          await supabase.from("subscriptions").update({
            plan: "free",
            status: "canceled",
            stripe_subscription_id: null,
            current_period_end: null,
          }).eq("user_id", userId);
        }
        break;
      }

      case "invoice.paid": {
        const invoice = obj as Stripe.Invoice;
        const subId = invoice.subscription as string | undefined;

        if (subId) {
          const periodEnd = (invoice as any).period_end;
          const endDate = periodEnd ? new Date(periodEnd * 1000).toISOString() : null;
          await supabase.from("subscriptions").update({
            status: "active",
            current_period_end: endDate,
          }).eq("stripe_subscription_id", subId);
          log("invoice.paid", { subId, endDate });
        }
        break;
      }

      default:
        log("Unhandled event type", { type: event.type });
    }

    // Mark event as success
    await supabase.from("stripe_events").update({
      status: "success",
      customer_id: customerId ?? null,
    }).eq("event_id", event.id);

    return new Response(JSON.stringify({ received: true }), { status: 200, headers: corsHeaders });
  } catch (error) {
    const msg = (error as Error).message;
    log("Handler error", { message: msg });
    await supabase.from("stripe_events").update({ status: "error", error: msg }).eq("event_id", event.id);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: corsHeaders });
  }
});
