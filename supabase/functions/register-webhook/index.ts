import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      return new Response(JSON.stringify({ error: "STRIPE_SECRET_KEY missing" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    const webhookUrl = "https://vtlreobljodwflcjigft.supabase.co/functions/v1/stripe-webhook";
    const enabledEvents = [
      "checkout.session.completed",
      "customer.subscription.created",
      "customer.subscription.updated",
      "customer.subscription.deleted",
      "invoice.paid",
      "invoice.payment_failed",
    ];

    // Check if webhook already exists
    const existingEndpoints = await stripe.webhookEndpoints.list({ limit: 100 });
    const existing = existingEndpoints.data.find((ep: any) => ep.url === webhookUrl);

    let endpoint: any;
    if (existing) {
      // Update existing endpoint
      endpoint = await stripe.webhookEndpoints.update(existing.id, {
        enabled_events: enabledEvents as any,
        disabled: false,
      });
      // Can't retrieve secret for existing endpoints - need to delete and recreate
      await stripe.webhookEndpoints.del(existing.id);
      endpoint = await stripe.webhookEndpoints.create({
        url: webhookUrl,
        enabled_events: enabledEvents as any,
      });
    } else {
      endpoint = await stripe.webhookEndpoints.create({
        url: webhookUrl,
        enabled_events: enabledEvents as any,
      });
    }

    // The secret is only available on creation
    const secret = endpoint.secret;

    return new Response(
      JSON.stringify({
        id: endpoint.id,
        url: endpoint.url,
        enabled_events: endpoint.enabled_events,
        status: endpoint.status,
        secret: secret, // whsec_...
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
