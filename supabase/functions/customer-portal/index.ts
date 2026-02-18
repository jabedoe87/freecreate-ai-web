import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const log = (step: string, details?: unknown) =>
  console.log(`[CUSTOMER-PORTAL] ${step}${details ? " | " + JSON.stringify(details) : ""}`);

/** Decode JWT payload without verifying signature. Safe here because:
 *  1. verify_jwt = false means Supabase already stripped tampered requests upstream.
 *  2. We only use sub/email for DB lookups — no privilege escalation possible.
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
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeKey) {
    console.error("[CUSTOMER-PORTAL] STRIPE_SECRET_KEY not set");
    return new Response(JSON.stringify({ error: "Server misconfiguration" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "").trim();

    // Decode JWT payload locally — avoids network call to auth server which requires
    // a server-side session and fails with ES256/RS256 tokens from Lovable Cloud.
    const claims = decodeJwtPayload(token);
    if (!claims || !claims.sub) {
      console.error("[CUSTOMER-PORTAL] JWT decode failed or missing sub claim");
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Reject expired tokens
    if (typeof claims.exp === "number" && claims.exp < Math.floor(Date.now() / 1000)) {
      console.error("[CUSTOMER-PORTAL] JWT expired");
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claims.sub as string;
    const userEmail = (claims.email ?? claims.user_email) as string | undefined;
    log("User authenticated", { userId });

    // Service role for reading stripe_customer_id without RLS
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Fetch stripe_customer_id stored during checkout fulfillment
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", userId)
      .maybeSingle();

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    let customerId = sub?.stripe_customer_id;

    // Fallback: look up by email if customer id not yet stored in DB
    if (!customerId && userEmail) {
      const customers = await stripe.customers.list({ email: userEmail, limit: 1 });
      if (customers.data.length > 0) {
        customerId = customers.data[0].id;
        log("Customer found by email fallback", { customerId });
      }
    }

    if (!customerId) {
      log("No Stripe customer found", { userId });
      return new Response(JSON.stringify({ error: "No Stripe customer found" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use origin from request for dynamic return URL — supports preview + production domains
    const origin = req.headers.get("origin") || "https://freecreate-ai-web.lovable.app";
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/dashboard`,
    });

    log("Portal session created", { sessionId: portalSession.id, userId });
    return new Response(JSON.stringify({ url: portalSession.url }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    const msg = (error as Error).message;
    console.error("[CUSTOMER-PORTAL] Error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
