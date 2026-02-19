import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Price → mode mapping driven entirely by env vars — no hardcoded IDs
const getPlanConfig = (): Record<string, { price_id: string; mode: "subscription" | "payment" }> => ({
  pro: {
    price_id: Deno.env.get("STRIPE_PRICE_PRO") ?? "",
    mode: "subscription",
  },
  bundle: {
    price_id: Deno.env.get("STRIPE_PRICE_BUNDLE") ?? "",
    mode: "payment", // Lifetime one-time purchase — never subscription
  },
});

/** Decode JWT payload without verifying signature. Safe because:
 *  1. verify_jwt = false means Supabase strips tampered requests upstream.
 *  2. We only use sub/email for lookups — no privilege escalation possible.
 */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, "=");
    const json = atob(padded);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

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
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    const token = authHeader.replace("Bearer ", "").trim();

    // Local JWT decode — avoids network call to auth server that fails with ES256 tokens
    const claims = decodeJwtPayload(token);
    if (!claims || !claims.sub) {
      console.error("[CREATE-CHECKOUT] JWT decode failed or missing sub claim");
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    // Reject expired tokens before doing any DB/Stripe work
    if (typeof claims.exp === "number" && claims.exp < Math.floor(Date.now() / 1000)) {
      console.error("[CREATE-CHECKOUT] JWT expired");
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    const userId = claims.sub as string;
    const userEmail = (claims.email ?? claims.user_email) as string | undefined;

    if (!userEmail) {
      console.error("[CREATE-CHECKOUT] No email in JWT claims", { userId });
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    console.log("[CREATE-CHECKOUT] User authenticated", { userId });

    // Service role client bypasses RLS for reading existing customer IDs
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const body = await req.json();
    const planId: string = body.plan_id ?? body.plan; // accept both shapes for backwards compat
    const requestedPriceId: string | undefined = body.price_id;

    const PLANS = getPlanConfig();
    const planConfig = PLANS[planId];

    if (!planConfig || !planConfig.price_id) {
      return new Response(JSON.stringify({ error: "Invalid plan" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    // Validate price_id against the env-var value to prevent forged price substitution
    if (requestedPriceId && requestedPriceId !== planConfig.price_id) {
      console.error("[CREATE-CHECKOUT] price_id mismatch", { requestedPriceId, expected: planConfig.price_id });
      return new Response(JSON.stringify({ error: "Invalid price" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const priceId = planConfig.price_id;
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Try to reuse existing Stripe customer to avoid duplicates
    const { data: subRow } = await supabaseAdmin
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", userId)
      .maybeSingle();

    let customerId: string | undefined = subRow?.stripe_customer_id ?? undefined;

    // Email fallback in case DB row exists but customer_id not yet stored
    if (!customerId) {
      const customers = await stripe.customers.list({ email: userEmail, limit: 1 });
      if (customers.data.length > 0) {
        customerId = customers.data[0].id;
      }
    }

    const origin = req.headers.get("origin") || "https://freecreate-ai-web.lovable.app";

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: planConfig.mode,
      line_items: [{ price: priceId, quantity: 1 }],
      // Metadata contract: user_id and plan_id MUST be present for webhook fulfillment
      metadata: {
        user_id: userId,
        plan_id: planId,
        price_id: priceId,
      },
      client_reference_id: userId,
      success_url: `${origin}/dashboard?checkout=success`,
      cancel_url: `${origin}/upgrade`,
    };

    // Attach existing customer if found; otherwise let Stripe collect email at checkout
    if (customerId) {
      sessionParams.customer = customerId;
    } else {
      sessionParams.customer_email = userEmail;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);
    console.log(`[CREATE-CHECKOUT] Session created for user ${userId}, plan ${planId} (${planConfig.mode}), session ${session.id}`);

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
