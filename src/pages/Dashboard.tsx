import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { LogOut, Sparkles, Crown } from "lucide-react";

const planLabels: Record<string, { label: string; icon: typeof Sparkles }> = {
  free: { label: "Free Plan", icon: Sparkles },
  pro: { label: "Pro Plan", icon: Crown },
  bundle: { label: "Bundle Plan", icon: Crown },
};

const Dashboard = () => {
  const { user, profile, plan, signOut } = useAuth();
  const navigate = useNavigate();

  const currentPlan = planLabels[plan] || planLabels.free;
  const PlanIcon = currentPlan.icon;

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
          <p className="text-muted-foreground">
            Your AI-powered creative workspace is ready.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-card border border-border rounded-xl p-6 space-y-3">
            <h3 className="font-semibold text-foreground">🎯 Create Prompt</h3>
            <p className="text-sm text-muted-foreground">
              Start generating with our AI prompt tools.
            </p>
            <Button className="w-full" disabled>Coming in Phase 2</Button>
          </div>

          <div className="bg-card border border-border rounded-xl p-6 space-y-3">
            <h3 className="font-semibold text-foreground">📚 My Library</h3>
            <p className="text-sm text-muted-foreground">
              View your saved prompts and history.
            </p>
            <Button variant="outline" className="w-full" disabled>Coming in Phase 2</Button>
          </div>

          <div className="bg-card border border-border rounded-xl p-6 space-y-3">
            <h3 className="font-semibold text-foreground">⚡ Upgrade</h3>
            <p className="text-sm text-muted-foreground">
              {plan === "free" ? "Unlock unlimited prompts and premium features." : "Manage your subscription."}
            </p>
            <Button variant="secondary" className="w-full" disabled>Coming in Phase 3</Button>
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
    </div>
  );
};

export default Dashboard;
