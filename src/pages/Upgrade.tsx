import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Check, Crown, Zap, Sparkles } from "lucide-react";
import { toast } from "sonner";

const plans = [
  {
    id: "free",
    name: "Free",
    price: "€0",
    period: "forever",
    icon: Sparkles,
    features: ["5 prompts/month", "Basic templates", "Community access"],
    cta: "Current Plan",
    disabled: true,
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
    highlight: false,
    badge: "BEST VALUE",
  },
];

const Upgrade = () => {
  const { plan } = useAuth();
  const navigate = useNavigate();

  const handleUpgrade = async (planId: string) => {
    if (planId === plan) return;
    // Stripe checkout will be wired here
    toast.info("Stripe checkout coming soon! Your account will be upgraded once payment is integrated.");
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
                  disabled={isCurrent || p.disabled}
                  onClick={() => handleUpgrade(p.id)}
                >
                  {isCurrent ? "Current Plan" : p.cta}
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
