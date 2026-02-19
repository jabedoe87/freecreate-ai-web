import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  const log: Record<string, unknown> = { step: "REQUEST_RECEIVED", method: req.method };
  try {
    // Step 1: Log request basics
    log.origin = req.headers.get("origin") ?? "(none)";
    log.hasAuth = !!req.headers.get("Authorization");
    console.log(JSON.stringify(log));

    // Step 2: Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      console.error(JSON.stringify({ step: "NO_AUTH", reason: "Missing Bearer token" }));
      return json({ ok: false, step: "NO_AUTH", error: "Authorization header missing" }, 401);
    }

    const token = authHeader.replace("Bearer ", "");
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    console.log(JSON.stringify({ step: "SUPABASE_CLIENT_INIT", hasUrl: !!supabaseUrl, hasAnon: !!supabaseAnonKey }));

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData?.user) {
      console.error(JSON.stringify({ step: "AUTH_FAILED", error: authError?.message ?? "No user" }));
      return json({ ok: false, step: "AUTH_FAILED", error: authError?.message ?? "Invalid token" }, 401);
    }

    const user = authData.user;
    console.log(JSON.stringify({ step: "AUTH_SUCCESS", userId: user.id, email: user.email }));

    // Step 3: Parse body
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch (e) {
      console.error(JSON.stringify({ step: "BODY_PARSE_FAILED", error: (e as Error).message }));
      return json({ ok: false, step: "BAD_INPUT", error: "Invalid JSON body" }, 400);
    }

    const plan = (body.plan ?? body.plan_id) as string | undefined;
    console.log(JSON.stringify({ step: "INPUT_VALIDATION", plan }));

    if (!plan || !["pro", "bundle"].includes(plan)) {
      return json({ ok: false, step: "BAD_INPUT", error: `Invalid plan: ${plan}` }, 400);
    }

    // Step 4: Stripe init
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      console.error(JSON.stringify({ step: "STRIPE_KEY_MISSING" }));
      return json({ ok: false, step: "SERVER_CONFIG", error: "STRIPE_SECRET_KEY missing" }, 500);
    }
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    console.log(JSON.stringify({ step: "STRIPE_CLIENT_CREATED" }));

    // Step 5: Resolve price
    const priceId = plan === "pro"
      ? Deno.env.get("STRIPE_PRICE_PRO") ?? ""
      : Deno.env.get("STRIPE_PRICE_BUNDLE") ?? "";

    console.log(JSON.stringify({ step: "PRICE_ID_RESOLVED", plan, priceId }));

    if (!priceId) {
      return json({ ok: false, step: "SERVER_CONFIG", error: `Price env var empty for ${plan}` }, 500);
    }

    // Step 6: Create checkout session
    const origin = req.headers.get("origin") || "https://freecreate-ai-web.lovable.app";
    const mode = plan === "pro" ? "subscription" : "payment";

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: mode as "subscription" | "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { user_id: user.id, plan_id: plan },
      client_reference_id: user.id,
      customer_email: user.email ?? undefined,
      success_url: `${origin}/dashboard?checkout=success`,
      cancel_url: `${origin}/upgrade`,
    };

    console.log(JSON.stringify({ step: "STRIPE_SESSION_CREATE_ATTEMPT", mode, priceId }));

    const session = await stripe.checkout.sessions.create(sessionParams);
    console.log(JSON.stringify({ step: "STRIPE_SESSION_CREATED", sessionId: session.id, url: session.url }));

    return json({ ok: true, step: "checkout_created", url: session.url }, 200);

  } catch (error: unknown) {
    const msg = (error as Error).message ?? "Unknown error";
    const stack = (error as Error).stack ?? "";
    console.error(JSON.stringify({ step: "UNEXPECTED_ERROR", error: msg, stack }));
    return json({ ok: false, step: "UNEXPECTED_ERROR", error: msg }, 500);
  }
});
