import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useUsage } from "@/hooks/useUsage";
import { Button } from "@/components/ui/button";
import { useNavigate, useSearchParams } from "react-router-dom";
import { LogOut, Sparkles, Crown, Plus, BookOpen, Layout, RefreshCw } from "lucide-react";
import PlanStatusCard from "@/components/PlanStatusCard";
import UpgradeLimitModal from "@/components/UpgradeLimitModal";
import { toast } from "sonner";

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

  const currentPlan = planLabels[plan] || planLabels.free;
  const PlanIcon = currentPlan.icon;

  // Detect post-checkout redirect and refresh subscription state
  useEffect(() => {
    if (searchParams.get("checkout") === "success") {
      // Remove param from URL so refresh doesn't re-trigger
      setSearchParams({}, { replace: true });
      handleRefreshBilling(true);
    }
  }, []);

  const handleRefreshBilling = async (silent = false) => {
    setRefreshing(true);
    try {
      await refreshSubscription();
      if (!silent) toast.success("Billing status refreshed");
    } catch {
      if (!silent) toast.error("Could not refresh billing status");
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

        {/* Plan status card + refresh billing button */}
        <div className="mb-8 space-y-3">
          <PlanStatusCard />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleRefreshBilling(false)}
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
                // Gate at dashboard level for instant feedback
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
