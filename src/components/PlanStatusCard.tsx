import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePortal } from "@/hooks/usePortal";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Crown, Sparkles, Infinity, ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface PlanData {
  plan: string;
  generationsThisMonth: number;
  limit: number;
  status: string;
  currentPeriodEnd: string | null;
}

const PLAN_LIMITS: Record<string, number> = { free: 5, pro: 999999, bundle: 999999 };

const PlanStatusCard = () => {
  const { user, plan } = useAuth();
  const { openPortal, loading: portalLoading } = usePortal();
  const navigate = useNavigate();
  const [data, setData] = useState<PlanData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      try {
        const currentMonth = new Date().toISOString().slice(0, 7);

        const [usageRes, subRes] = await Promise.all([
          supabase
            .from("usage_tracking")
            .select("count")
            .eq("user_id", user.id)
            .eq("action", "generation")
            .eq("month", currentMonth)
            .maybeSingle(),
          supabase
            .from("subscriptions")
            .select("plan, status, current_period_end")
            .eq("user_id", user.id)
            .maybeSingle(),
        ]);

        const currentPlan = subRes.data?.plan || plan || "free";
        setData({
          plan: currentPlan,
          generationsThisMonth: usageRes.data?.count || 0,
          limit: PLAN_LIMITS[currentPlan] || 5,
          status: subRes.data?.status || "active",
          currentPeriodEnd: subRes.data?.current_period_end || null,
        });
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [user, plan]);

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl p-5 space-y-3">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-8 w-28" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-card border border-destructive/30 rounded-xl p-5">
        <p className="text-sm text-destructive">Could not load plan info</p>
      </div>
    );
  }

  if (!data) return null;

  const { generationsThisMonth, limit, status, currentPeriodEnd } = data;
  const pct = Math.min(100, (generationsThisMonth / Math.max(limit, 1)) * 100);

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  };

  // FREE PLAN
  if (plan === "free") {
    return (
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-muted-foreground" />
          <span className="font-semibold text-foreground">Free Plan</span>
        </div>
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{generationsThisMonth} / {limit} generations</span>
            <span>{limit - generationsThisMonth} left</span>
          </div>
          {/* Progress bar */}
          <div className="h-2 rounded-full bg-secondary overflow-hidden">
            <div
              className="h-full bg-primary transition-all rounded-full"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        <Button size="sm" className="w-full" onClick={() => navigate("/upgrade")}>
          Upgrade for unlimited access
        </Button>
      </div>
    );
  }

  // BUNDLE PLAN
  if (plan === "bundle") {
    return (
      <div className="bg-card border border-primary/40 rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Crown className="w-5 h-5 text-primary" />
          <span className="font-semibold text-foreground">Lifetime Bundle ✦</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Infinity className="w-4 h-4 text-primary" />
          <span>Unlimited access — forever</span>
        </div>
      </div>
    );
  }

  // PRO PLAN
  return (
    <div className="bg-card border border-primary/30 rounded-xl p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Crown className="w-5 h-5 text-primary" />
        <span className="font-semibold text-foreground">Pro Plan ⭐</span>
        <span className={`ml-auto text-xs px-2 py-0.5 rounded-full ${status === "active" ? "bg-green-500/10 text-green-500" : "bg-yellow-500/10 text-yellow-500"}`}>
          {status}
        </span>
      </div>
      {currentPeriodEnd && (
        <p className="text-xs text-muted-foreground">
          Renews: {formatDate(currentPeriodEnd)}
        </p>
      )}
      <Button
        variant="outline"
        size="sm"
        className="w-full"
        onClick={openPortal}
        disabled={portalLoading}
      >
        <ExternalLink className="w-3 h-3 mr-2" />
        {portalLoading ? "Opening..." : "Manage Subscription"}
      </Button>
    </div>
  );
};

export default PlanStatusCard;
