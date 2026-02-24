import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useUsage } from "@/hooks/useUsage";
import { Button } from "@/components/ui/button";
import { useNavigate, useSearchParams } from "react-router-dom";
import { LogOut, Sparkles, Crown, Plus, BookOpen, Layout, RefreshCw } from "lucide-react";
import PlanStatusCard from "@/components/PlanStatusCard";
import UpgradeLimitModal from "@/components/UpgradeLimitModal";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const planLabels: Record<string, { label: string; icon: typeof Sparkles }> = {
  free: { label: "Free Plan", icon: Sparkles },
  pro: { label: "Pro Plan", icon: Crown },
  bundle: { label: "Bundle Plan", icon: Crown },
};

const Dashboard = () => {
  const { user, profile, plan, signOut, refreshSubscription } = useAuth();
  const { canGenerate } = useUsage();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // Key used to force PlanStatusCard to remount and refetch after billing refresh
  const [planCardKey, setPlanCardKey] = useState(0);

  const currentPlan = planLabels[plan] || planLabels.free;
  const PlanIcon = currentPlan.icon;

  // Detect post-checkout redirect and refresh session + subscription state immediately
  useEffect(() => {
    if (searchParams.get("checkout") === "success") {
      // Remove param so refresh doesn't re-trigger on back-navigation
      setSearchParams({}, { replace: true });
      handlePostCheckoutRefresh();
    }
  }, []);

  const handlePostCheckoutRefresh = async () => {
    setRefreshing(true);
    try {
      await supabase.auth.refreshSession();
      // Poll using check-subscription which verifies against Stripe AND updates DB,
      // rather than refresh-entitlement which only reads DB (webhook may be delayed)
      const maxAttempts = 10;
      const pollInterval = 2000;

      for (let i = 0; i < maxAttempts; i++) {
        // check-subscription queries Stripe directly, finds active sub/bundle, and writes to DB
        const { data: checkData } = await supabase.functions.invoke("check-subscription");
        if (checkData?.plan && checkData.plan !== "free") {
          // Now refresh the auth context so the UI updates globally
          await refreshSubscription();
          setPlanCardKey((k) => k + 1);
          toast.success("Payment confirmed! Your plan has been activated.");
          return;
        }
        await new Promise((r) => setTimeout(r, pollInterval));
      }
      // Final attempt: refresh from DB in case webhook landed
      await refreshSubscription();
      setPlanCardKey((k) => k + 1);
      toast.success("Payment received! Your plan will activate shortly.");
    } catch (err) {
      console.error("[Dashboard] Post-checkout refresh error:", err);
      toast.error("Could not refresh billing status — please reload the page.");
    } finally {
      setRefreshing(false);
    }
  };

  const handleRefreshBilling = async () => {
    setRefreshing(true);
    try {
      await supabase.auth.refreshSession();
      // Use check-subscription to verify against Stripe and update DB
      await supabase.functions.invoke("check-subscription");
      await refreshSubscription();
      setPlanCardKey((k) => k + 1);
      toast.success("Billing status refreshed");
    } catch (err) {
      console.error("[Dashboard] Manual billing refresh error:", err);
      toast.error("Could not refresh billing status");
    } finally {
      setRefreshing(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-4">
          <span className="text-lg font-bold text-gradient">FreeCreate AI</span>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <PlanIcon className="w-4 h-4 text-primary" />
              <span>{currentPlan.label}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-12">
        <div className="space-y-2 mb-8">
          <h1 className="text-3xl font-bold text-foreground">
            Welcome{profile?.display_name ? `, ${profile.display_name}` : ""}!
          </h1>
          <p className="text-muted-foreground">Your AI-powered creative workspace.</p>
        </div>

        {/* Plan status card always fetches live data — key forces remount on billing refresh */}
        <div className="mb-8 space-y-3">
          <PlanStatusCard key={planCardKey} />
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefreshBilling}
            disabled={refreshing}
            className="text-muted-foreground"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Refreshing…" : "Refresh Billing Status"}
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-card border border-border rounded-xl p-6 space-y-3 hover:glow-border transition-all">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <Plus className="w-5 h-5 text-primary" /> Create Prompt
            </h3>
            <p className="text-sm text-muted-foreground">Start generating with AI prompt tools.</p>
            <Button
              className="w-full"
              onClick={() => {
                // Gate at dashboard level for immediate user feedback before navigation
                if (!canGenerate && plan === "free") {
                  setShowUpgradeModal(true);
                  return;
                }
                navigate("/create-prompt");
              }}
            >
              Create New
            </Button>
          </div>

          <div className="bg-card border border-border rounded-xl p-6 space-y-3 hover:glow-border transition-all">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-primary" /> My Library
            </h3>
            <p className="text-sm text-muted-foreground">View and manage your saved prompts.</p>
            <Button variant="outline" className="w-full" onClick={() => navigate("/my-prompts")}>
              View Library
            </Button>
          </div>

          <div className="bg-card border border-border rounded-xl p-6 space-y-3 hover:glow-border transition-all">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <Layout className="w-5 h-5 text-primary" /> Templates
            </h3>
            <p className="text-sm text-muted-foreground">Browse premium AI prompt templates.</p>
            <Button variant="outline" className="w-full" onClick={() => navigate("/templates")}>
              Browse
            </Button>
          </div>
        </div>

        <div className="mt-6">
          <div className="bg-card border border-border rounded-xl p-6 space-y-3 hover:glow-border transition-all">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <Crown className="w-5 h-5 text-primary" /> {plan === "free" ? "Upgrade" : "Manage Plan"}
            </h3>
            <p className="text-sm text-muted-foreground">
              {plan === "free" ? "Unlock unlimited prompts and premium features." : "View your subscription details."}
            </p>
            <Button variant="secondary" className="w-full" onClick={() => navigate("/upgrade")}>
              {plan === "free" ? "View Plans" : "Manage Subscription"}
            </Button>
          </div>
        </div>

        <div className="mt-8 bg-card border border-border rounded-xl p-6">
          <h3 className="font-semibold text-foreground mb-3">Account Info</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Email:</span>{" "}
              <span className="text-foreground">{user?.email}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Plan:</span>{" "}
              <span className="text-foreground capitalize">{plan}</span>
            </div>
          </div>
        </div>
      </main>

      {/* Upgrade limit modal mounted at dashboard level */}
      <UpgradeLimitModal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        onUpgrade={() => {
          setShowUpgradeModal(false);
          navigate("/upgrade");
        }}
      />
    </div>
  );
};

export default Dashboard;
