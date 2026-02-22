import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const log = (step: string, details?: unknown) =>
  console.log(`[CHECK-SUBSCRIPTION] ${step}${details ? " | " + JSON.stringify(details) : ""}`);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    log("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) throw new Error("No authorization header");

    const token = authHeader.replace("Bearer ", "");
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    // Use getClaims for ES256 compatibility (Lovable Cloud)
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      throw new Error(`Authentication error: ${claimsError?.message ?? "No claims"}`);
    }

    const userId = claimsData.claims.sub as string;
    const userEmail = claimsData.claims.email as string | undefined;
    log("User authenticated", { userId, email: userEmail });

    // Service role client for DB writes
    const supabase = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    if (!userEmail) {
      throw new Error("No email in token claims");
    }

    const customers = await stripe.customers.list({ email: userEmail, limit: 1 });

    if (customers.data.length === 0) {
      log("No customer found");
      return new Response(JSON.stringify({ subscribed: false, plan: "free" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const customerId = customers.data[0].id;
    log("Found Stripe customer", { customerId });

    // Check active subscriptions (Pro)
    const subs = await stripe.subscriptions.list({ customer: customerId, status: "active", limit: 1 });
    if (subs.data.length > 0) {
      const sub = subs.data[0];
      const ts = (sub as any).current_period_end;
      const endDate = ts ? new Date(ts * 1000).toISOString() : null;

      // Sync to DB
      await supabase.from("subscriptions").update({
        plan: "pro", status: "active", stripe_customer_id: customerId,
        stripe_subscription_id: sub.id, current_period_end: endDate,
      }).eq("user_id", userId);

      log("Active subscription found", { subId: sub.id });
      return new Response(JSON.stringify({ subscribed: true, plan: "pro", subscription_end: endDate }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check one-time payments (Bundle) - check checkout sessions with plan_id metadata
    const sessions = await stripe.checkout.sessions.list({ customer: customerId, limit: 100 });
    for (const session of sessions.data) {
      if (session.payment_status === "paid" && session.metadata?.plan_id === "bundle") {
        await supabase.from("subscriptions").update({
          plan: "bundle", status: "active", stripe_customer_id: customerId,
        }).eq("user_id", userId);

        await supabase.from("profiles").update({
          lifetime_access: true, stripe_customer_id: customerId,
        }).eq("user_id", userId);

        log("Bundle found via checkout session");
        return new Response(JSON.stringify({ subscribed: true, plan: "bundle" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // No active Stripe sub found — check DB before downgrading
    const { data: currentSub } = await supabase
      .from("subscriptions")
      .select("plan")
      .eq("user_id", userId)
      .maybeSingle();

    // Never downgrade bundle or pro that webhook already set
    if (!currentSub?.plan || currentSub.plan === "free") {
      await supabase.from("subscriptions").update({
        plan: "free", status: "active", stripe_customer_id: customerId,
      }).eq("user_id", userId);
    }

    log("No active subscription", { dbPlan: currentSub?.plan });
    return new Response(JSON.stringify({ subscribed: false, plan: currentSub?.plan || "free" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = (error as Error).message;
    log("ERROR", { message: msg });
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
