import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const ALLOWED_ORIGINS = [
  "https://freecreate-ai-web.vercel.app",
  "https://freecreate-ai-web.lovable.app",
  "https://id-preview--4afd299d-0541-43bb-8bc9-40b03b775383.lovable.app",
  "http://localhost:8080",
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  };
}

function json(body: Record<string, unknown>, headers: Record<string, string>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

const log = (step: string, details?: unknown) =>
  console.log(JSON.stringify({ fn: "create-checkout", step, ...(details ? { details } : {}) }));

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  try {
    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ ok: false, error: "Authorization header missing" }, corsHeaders, 401);
    }

    const token = authHeader.replace("Bearer ", "");
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return json({ ok: false, error: claimsError?.message ?? "Invalid token" }, corsHeaders, 401);
    }

    const userId = claimsData.claims.sub as string;
    const userEmail = claimsData.claims.email as string | undefined;
    log("AUTH_SUCCESS", { userId, email: userEmail });

    // Parse body — accept both `plan` and `type` keys
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return json({ ok: false, error: "Invalid JSON body" }, corsHeaders, 400);
    }

    const plan = ((body.plan ?? body.type ?? body.plan_id) as string | undefined)?.toLowerCase();
    log("INPUT", { plan });

    if (!plan || !["pro", "bundle"].includes(plan)) {
      return json({ ok: false, error: `Invalid plan: ${plan}` }, corsHeaders, 400);
    }

    // Stripe init
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      return json({ ok: false, error: "Stripe configuration error" }, corsHeaders, 500);
    }
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Resolve price
    let priceId = plan === "pro"
      ? Deno.env.get("STRIPE_PRICE_PRO") ?? ""
      : Deno.env.get("STRIPE_PRICE_BUNDLE") ?? "";

    log("PRICE_RESOLVED", { plan, priceId });

    if (!priceId) {
      return json({ ok: false, error: `Price configuration missing for ${plan}` }, corsHeaders, 500);
    }

    // Verify price exists; self-heal if missing
    try {
      await stripe.prices.retrieve(priceId);
      log("PRICE_VERIFIED", { priceId });
    } catch (priceErr: unknown) {
      const msg = (priceErr as Error).message ?? "";
      if (msg.includes("No such price")) {
        log("SELF_HEALING", { plan, oldPriceId: priceId });
        const productName = plan === "pro" ? "FreeCreate Pro" : "FreeCreate Bundle";
        const product = await stripe.products.create({ name: productName });
        const priceParams: Stripe.PriceCreateParams = {
          product: product.id,
          currency: "eur",
          unit_amount: plan === "pro" ? 1900 : 4900,
        };
        if (plan === "pro") {
          priceParams.recurring = { interval: "month" };
        }
        const newPrice = await stripe.prices.create(priceParams);
        priceId = newPrice.id;
        log("PRICE_CREATED", { newPriceId: priceId });
      } else {
        return json({ ok: false, error: "Price verification failed" }, corsHeaders, 500);
      }
    }

    // Metadata included in both session and subscription_data
    const metadata = { user_id: userId, plan_id: plan, purchase_type: plan.toUpperCase() };

    const origin = req.headers.get("origin") || "https://freecreate-ai-web.lovable.app";
    const mode = plan === "pro" ? "subscription" : "payment";

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: mode as "subscription" | "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      metadata,
      client_reference_id: userId,
      customer_email: userEmail ?? undefined,
      success_url: `${origin}/dashboard?checkout=success`,
      cancel_url: `${origin}/upgrade`,
    };

    // For subscriptions, also attach metadata to the subscription object itself
    if (plan === "pro") {
      sessionParams.subscription_data = { metadata };
    }

    log("SESSION_CREATE", { mode, priceId });

    const session = await stripe.checkout.sessions.create(sessionParams);
    log("SESSION_CREATED", { sessionId: session.id, url: session.url });

    return json({ ok: true, url: session.url }, corsHeaders, 200);
  } catch (error: unknown) {
    const msg = (error as Error).message ?? "Unknown error";
    console.error(JSON.stringify({ fn: "create-checkout", step: "ERROR", error: msg }));
    return json({ ok: false, error: "Checkout creation failed" }, getCorsHeaders(req), 500);
  }
});
