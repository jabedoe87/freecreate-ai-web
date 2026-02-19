import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Decode JWT payload without verification (verify_jwt=false in config.toml). */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, "=");
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

serve(async (req) => {
  // ── CORS preflight ──
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  const origin = req.headers.get("origin") ?? "(none)";
  const hasAuth = !!req.headers.get("Authorization");
  console.log(`[CREATE-CHECKOUT] ${req.method} origin=${origin} hasAuth=${hasAuth}`);

  try {
    // ── Env validation ──
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) return jsonResponse({ ok: false, code: "SERVER_CONFIG", message: "STRIPE_SECRET_KEY missing" }, 500);

    const PRICE_MAP: Record<string, { envKey: string; mode: "subscription" | "payment"; name: string; amount: number; interval?: "month" }> = {
      pro:    { envKey: "STRIPE_PRICE_PRO",    mode: "subscription", name: "Pro Plan",  amount: 1900, interval: "month" },
      bundle: { envKey: "STRIPE_PRICE_BUNDLE",  mode: "payment",      name: "Bundle",    amount: 4900 },
    };

    // ── Auth ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      console.error("[CREATE-CHECKOUT] Missing or malformed Authorization header");
      return jsonResponse({ ok: false, code: "NO_AUTH", message: "Authorization header missing" }, 401);
    }

    const token = authHeader.replace("Bearer ", "").trim();
    const claims = decodeJwtPayload(token);
    if (!claims?.sub) {
      console.error("[CREATE-CHECKOUT] JWT decode failed");
      return jsonResponse({ ok: false, code: "NO_AUTH", message: "Invalid token" }, 401);
    }
    if (typeof claims.exp === "number" && claims.exp < Math.floor(Date.now() / 1000)) {
      console.error("[CREATE-CHECKOUT] JWT expired");
      return jsonResponse({ ok: false, code: "NO_AUTH", message: "Token expired" }, 401);
    }

    const userId = claims.sub as string;
    const userEmail = (claims.email ?? claims.user_email) as string | undefined;
    if (!userEmail) {
      console.error("[CREATE-CHECKOUT] No email in JWT");
      return jsonResponse({ ok: false, code: "NO_AUTH", message: "No email in token" }, 401);
    }
    console.log(`[CREATE-CHECKOUT] user=${userId} email=${userEmail}`);

    // ── Parse body ──
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ ok: false, code: "BAD_INPUT", message: "Invalid JSON body" }, 400);
    }

    const planId = (body.plan_id ?? body.plan) as string | undefined;
    if (!planId || !PRICE_MAP[planId]) {
      console.error(`[CREATE-CHECKOUT] Invalid plan: ${planId}`);
      return jsonResponse({ ok: false, code: "BAD_INPUT", message: `Invalid plan. Must be one of: ${Object.keys(PRICE_MAP).join(", ")}` }, 400);
    }
    const planCfg = PRICE_MAP[planId];
    console.log(`[CREATE-CHECKOUT] plan=${planId} mode=${planCfg.mode}`);

    // ── Resolve price ID from env ──
    let priceId = Deno.env.get(planCfg.envKey) ?? "";
    if (!priceId) {
      console.error(`[CREATE-CHECKOUT] ${planCfg.envKey} env var is empty`);
      return jsonResponse({ ok: false, code: "SERVER_CONFIG", message: `${planCfg.envKey} not configured` }, 500);
    }

    // ── Init Stripe ──
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // ── Validate price exists in Stripe ──
    try {
      const price = await stripe.prices.retrieve(priceId);
      console.log(`[CREATE-CHECKOUT] Price ${priceId} verified (active=${price.active})`);
      if (!price.active) {
        console.error(`[CREATE-CHECKOUT] Price ${priceId} is inactive`);
        return jsonResponse({ ok: false, code: "STRIPE_ERROR", message: "Price is inactive in Stripe" }, 500);
      }
    } catch (err: unknown) {
      const stripeErr = err as { code?: string; message?: string };
      if (stripeErr.code === "resource_missing") {
        console.error(`[CREATE-CHECKOUT] Price ${priceId} not found in Stripe — attempting self-heal`);
        try {
          const product = await stripe.products.create({ name: planCfg.name });
          const newPriceParams: Stripe.PriceCreateParams = {
            unit_amount: planCfg.amount,
            currency: "eur",
            product: product.id,
          };
          if (planCfg.interval) {
            newPriceParams.recurring = { interval: planCfg.interval };
          }
          const newPrice = await stripe.prices.create(newPriceParams);
          console.log(`[CREATE-CHECKOUT] Self-healed: created price ${newPrice.id} for ${planId}`);
          return jsonResponse({
            ok: false,
            code: "PRICE_MISSING_CREATED",
            message: `Price was missing. Created new price ${newPrice.id}. Update ${planCfg.envKey} secret to this value.`,
            newPriceId: newPrice.id,
          }, 500);
        } catch (healErr: unknown) {
          console.error("[CREATE-CHECKOUT] Self-heal failed:", (healErr as Error).message);
          return jsonResponse({ ok: false, code: "STRIPE_ERROR", message: "Price missing and auto-create failed" }, 500);
        }
      }
      console.error(`[CREATE-CHECKOUT] Stripe price retrieve error:`, stripeErr.message);
      return jsonResponse({ ok: false, code: "STRIPE_ERROR", message: stripeErr.message ?? "Stripe error" }, 500);
    }

    // ── Resolve or create Stripe customer ──
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    const { data: subRow } = await supabaseAdmin
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", userId)
      .maybeSingle();

    let customerId: string | undefined = subRow?.stripe_customer_id ?? undefined;
    if (!customerId) {
      const customers = await stripe.customers.list({ email: userEmail, limit: 1 });
      if (customers.data.length > 0) customerId = customers.data[0].id;
    }

    // ── Create checkout session ──
    const appOrigin = req.headers.get("origin") || "https://freecreate-ai-web.lovable.app";

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: planCfg.mode,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { user_id: userId, plan_id: planId, price_id: priceId },
      client_reference_id: userId,
      success_url: `${appOrigin}/dashboard?checkout=success`,
      cancel_url: `${appOrigin}/upgrade`,
    };

    if (customerId) {
      sessionParams.customer = customerId;
    } else {
      sessionParams.customer_email = userEmail;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);
    console.log(`[CREATE-CHECKOUT] ✅ Session ${session.id} created for ${planId} (${planCfg.mode})`);

    return jsonResponse({ ok: true, url: session.url }, 200);
  } catch (error: unknown) {
    const msg = (error as Error).message ?? "Unknown error";
    console.error("[CREATE-CHECKOUT] Uncaught error:", msg);
    return jsonResponse({ ok: false, code: "INTERNAL_ERROR", message: msg }, 500);
  }
});
