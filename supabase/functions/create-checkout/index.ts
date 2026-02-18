import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Canonical plan config — price IDs must match Stripe dashboard
const PLANS: Record<string, { price_id: string; product_id: string; mode: "subscription" | "payment" }> = {
  pro: {
    price_id: "price_1T1fRGDHxEfwTYTRHsy1ncWk",
    product_id: "prod_TzekEm3i5ZcS6e",
    mode: "subscription",
  },
  bundle: {
    price_id: "price_1T1fRODHxEfwTYTRSpZ7Zr1W",
    product_id: "prod_TzekhtWD8qlVi8",
    mode: "payment",
  },
};

const VALID_PRICE_IDS = new Set(Object.values(PLANS).map((p) => p.price_id));

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeKey) {
    console.error("[CREATE-CHECKOUT] STRIPE_SECRET_KEY is not set");
    return new Response(JSON.stringify({ error: "Server misconfiguration" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    const token = authHeader.replace("Bearer ", "");

    // Use getClaims() for local JWT validation — works with ES256 (Lovable Cloud) without
    // making a network call to /user which requires a server-side session (causes 403).
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    // Service role client for DB reads that bypass RLS
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const { data: claimsData, error: claimsError } = await supabaseClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      console.error("[CREATE-CHECKOUT] getClaims failed:", claimsError?.message);
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    const userId: string = claimsData.claims.sub;
    const userEmail: string | undefined = claimsData.claims.email as string | undefined;

    if (!userEmail) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    const user = { id: userId, email: userEmail };

    const body = await req.json();
    const planId: string = body.plan;
    const planConfig = PLANS[planId];

    if (!planConfig || !VALID_PRICE_IDS.has(planConfig.price_id)) {
      return new Response(JSON.stringify({ error: "Invalid price" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Try to reuse existing Stripe customer
    const { data: subRow } = await supabaseAdmin
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    let customerId: string | undefined = subRow?.stripe_customer_id ?? undefined;

    if (!customerId) {
      const customers = await stripe.customers.list({ email: user.email!, limit: 1 });
      if (customers.data.length > 0) {
        customerId = customers.data[0].id;
      }
    }

    const origin = req.headers.get("origin") || "https://freecreate-ai-web.lovable.app";

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: planConfig.mode,
      line_items: [{ price: planConfig.price_id, quantity: 1 }],
      success_url: `${origin}/dashboard?checkout=success`,
      cancel_url: `${origin}/upgrade?checkout=cancelled`,
      metadata: {
        user_id: user.id,
        plan_id: planId,
        price_id: planConfig.price_id,
      },
      client_reference_id: user.id,
    };

    if (customerId) {
      sessionParams.customer = customerId;
    } else {
      sessionParams.customer_email = user.email!;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);
    console.log(`[CREATE-CHECKOUT] Session created for user ${user.id}, plan ${planId}, session ${session.id}`);

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    console.error("[CREATE-CHECKOUT] Error:", (error as Error).message);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
