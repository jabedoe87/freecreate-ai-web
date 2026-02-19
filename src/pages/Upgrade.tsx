import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Check, Crown, Zap, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useState, useEffect } from "react";

// Price IDs are resolved server-side from secrets — no frontend env vars needed

const plans = [
  {
    id: "free",
    name: "Free",
    price: "€0",
    period: "forever",
    icon: Sparkles,
    features: ["5 prompts/month", "Basic templates", "Community access"],
    cta: "Current Plan",
  },
  {
    id: "pro",
    name: "Pro",
    price: "€19",
    period: "/month",
    icon: Zap,
    features: ["Unlimited prompts", "All premium templates", "Priority speed", "Advanced tools", "Email support"],
    cta: "Upgrade to Pro",
    highlight: true,
  },
  {
    id: "bundle",
    name: "Bundle",
    price: "€49",
    period: "one-time",
    icon: Crown,
    features: ["Everything in Pro", "Lifetime access", "Automation packs", "Business templates", "Priority support", "Future updates included"],
    cta: "Get Bundle — Limited",
    badge: "BEST VALUE",
  },
];

const Upgrade = () => {
  const { plan, refreshSubscription } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get("checkout") === "success") {
      toast.success("Payment successful! Activating your plan...");
      refreshSubscription();
    }
  }, [searchParams]);

  const handleUpgrade = async (planId: string) => {
    if (planId === "free") return;
    // Allow bundle purchase even if user is already pro
    if (planId === plan && planId !== "bundle") return;
    setLoadingPlan(planId);

    try {
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: { plan: planId },
      });

      // supabase-js wraps non-2xx as an error with context in data
      if (error) {
        // If the edge function returned a JSON body, it's in `data`
        const code = data?.code ?? "UNKNOWN";
        const msg = data?.message ?? error.message ?? "Checkout failed";
        console.error("[Upgrade] checkout error", { code, msg, data });
        toast.error(`${code}: ${msg}`);
        return;
      }

      if (data?.url) {
        window.location.href = data.url;
      } else {
        toast.error("No checkout URL returned");
      }
    } catch (err: any) {
      console.error("[Upgrade] unexpected error", err);
      toast.error(err.message || "Failed to start checkout");
    } finally {
      setLoadingPlan(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-5xl mx-auto flex items-center px-6 py-4">
          <button onClick={() => navigate("/dashboard")} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />
            <span className="text-lg font-bold text-gradient">FreeCreate AI</span>
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-16">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-foreground mb-3">Unlock Your Full Creative Power</h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Choose the plan that fits your workflow. Upgrade instantly, cancel anytime.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map((p) => {
            const Icon = p.icon;
            const isCurrent = p.id === plan;
            const isLoading = loadingPlan === p.id;
            return (
              <div
                key={p.id}
                className={`relative bg-card border rounded-2xl p-6 space-y-6 transition-all ${
                  p.highlight ? "border-primary glow-border scale-[1.02]" : "border-border"
                }`}
              >
                {p.badge && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-bold px-3 py-1 rounded-full">
                    {p.badge}
                  </span>
                )}
                <div className="space-y-2">
                  <Icon className={`w-8 h-8 ${p.highlight ? "text-primary" : "text-muted-foreground"}`} />
                  <h3 className="text-xl font-bold text-foreground">{p.name}</h3>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-bold text-foreground">{p.price}</span>
                    <span className="text-muted-foreground text-sm">{p.period}</span>
                  </div>
                </div>
                <ul className="space-y-3">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Check className="w-4 h-4 text-primary shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Button
                  className="w-full"
                  variant={p.highlight ? "default" : "outline"}
                  // Bundle is always purchasable (upgrade from free OR pro); free CTA is never clickable
                  disabled={(isCurrent && p.id !== "bundle") || p.id === "free" || isLoading}
                  onClick={() => handleUpgrade(p.id)}
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  {isCurrent && p.id !== "bundle" ? "Current Plan" : p.cta}
                </Button>
              </div>
            );
          })}
        </div>

        <div className="text-center mt-12 space-y-2">
          <p className="text-sm text-muted-foreground">🔒 Secure checkout powered by Stripe</p>
          <p className="text-xs text-muted-foreground">Bundle offer is limited. Price increases after launch.</p>
        </div>
      </main>
    </div>
  );
};

export default Upgrade;
