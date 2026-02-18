import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PLANS: Record<string, { price_id: string; product_id: string; mode: string }> = {
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  );

  try {
    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data } = await supabaseClient.auth.getUser(token);
    const user = data.user;
    if (!user?.email) throw new Error("Not authenticated");

    const { plan } = await req.json();
    const planConfig = PLANS[plan];
    if (!planConfig) throw new Error("Invalid plan");

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", { apiVersion: "2025-08-27.basil" });

    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    let customerId: string | undefined;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
    }

    const origin = req.headers.get("origin") || "https://freecreate-ai-web.lovable.app";

    const sessionParams: any = {
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      line_items: [{ price: planConfig.price_id, quantity: 1 }],
      mode: planConfig.mode as "subscription" | "payment",
      success_url: `${origin}/dashboard?checkout=success`,
      cancel_url: `${origin}/upgrade?checkout=cancelled`,
      // Full metadata contract required by webhook fulfillment
      metadata: {
        user_id: user.id,
        plan_id: plan,
        price_id: planConfig.price_id,
      },
      client_reference_id: user.id,
    };

    const session = await stripe.checkout.sessions.create(sessionParams);

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
