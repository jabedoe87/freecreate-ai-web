import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PRODUCT_TO_PLAN: Record<string, string> = {
  prod_TzekEm3i5ZcS6e: "pro",
  prod_TzekhtWD8qlVi8: "bundle",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(userError.message);
    const user = userData.user;
    if (!user?.email) throw new Error("Not authenticated");

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", { apiVersion: "2025-08-27.basil" });
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });

    if (customers.data.length === 0) {
      return new Response(JSON.stringify({ subscribed: false, plan: "free" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const customerId = customers.data[0].id;

    // Check active subscriptions (Pro)
    const subs = await stripe.subscriptions.list({ customer: customerId, status: "active", limit: 1 });
    if (subs.data.length > 0) {
      const sub = subs.data[0];
      const productId = sub.items.data[0].price.product as string;
      const plan = PRODUCT_TO_PLAN[productId] || "pro";
      const periodEnd = (sub as any).current_period_end ?? sub.items?.data?.[0]?.current_period_end;
      const endDate = periodEnd ? new Date(periodEnd * 1000).toISOString() : null;

      // Sync to DB
      await supabaseClient.from("subscriptions").update({
        plan, status: "active", stripe_customer_id: customerId,
        stripe_subscription_id: sub.id, current_period_end: endDate,
      }).eq("user_id", user.id);

      return new Response(JSON.stringify({ subscribed: true, plan, subscription_end: endDate }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check one-time payments (Bundle)
    const payments = await stripe.paymentIntents.list({ customer: customerId, limit: 100 });
    for (const pi of payments.data) {
      if (pi.status === "succeeded" && pi.metadata?.plan === "bundle") {
        await supabaseClient.from("subscriptions").update({
          plan: "bundle", status: "active", stripe_customer_id: customerId,
        }).eq("user_id", user.id);

        return new Response(JSON.stringify({ subscribed: true, plan: "bundle" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Check checkout sessions for bundle
    const sessions = await stripe.checkout.sessions.list({ customer: customerId, limit: 100 });
    for (const session of sessions.data) {
      if (session.payment_status === "paid" && session.metadata?.plan === "bundle") {
        await supabaseClient.from("subscriptions").update({
          plan: "bundle", status: "active", stripe_customer_id: customerId,
        }).eq("user_id", user.id);

        return new Response(JSON.stringify({ subscribed: true, plan: "bundle" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // No active Stripe sub found — check current DB plan before downgrading
    // Never downgrade bundle (lifetime) or pro that may not yet be in Stripe list
    const { data: currentSub } = await supabaseClient
      .from("subscriptions")
      .select("plan")
      .eq("user_id", user.id)
      .maybeSingle();

    // Only mark as free if the DB already agrees — avoids overwriting webhook-set plans
    if (!currentSub?.plan || currentSub.plan === "free") {
      await supabaseClient.from("subscriptions").update({
        plan: "free", status: "active", stripe_customer_id: customerId,
      }).eq("user_id", user.id);
    }

    return new Response(JSON.stringify({ subscribed: false, plan: currentSub?.plan || "free" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
