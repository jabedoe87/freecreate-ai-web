import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUsage } from "@/hooks/useUsage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ArrowLeft, Sparkles, Zap } from "lucide-react";
import UpgradeLimitModal from "@/components/UpgradeLimitModal";

const CreatePrompt = () => {
  const { user, plan } = useAuth();
  const { canGenerate, remaining, limit, incrementUsage } = useUsage();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  const handleSave = async () => {
    if (!title.trim() || !content.trim()) {
      toast.error("Please fill in both title and content");
      return;
    }
    // Block generation and show paywall if free user is at limit
    if (!canGenerate) {
      setShowUpgradeModal(true);
      return;
    }
    setSaving(true);
    try {
      const success = await incrementUsage();
      if (!success) {
        setShowUpgradeModal(true);
        return;
      }
      const { error } = await supabase.from("user_prompts").insert({
        user_id: user!.id,
        title: title.trim(),
        content: content.trim(),
      });
      if (error) throw error;
      toast.success("Prompt saved!");
      navigate("/my-prompts");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-4xl mx-auto flex items-center justify-between px-6 py-4">
          <button onClick={() => navigate("/dashboard")} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />
            <span className="text-lg font-bold text-gradient">FreeCreate AI</span>
          </button>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Zap className="w-4 h-4 text-primary" />
            <span>{remaining}/{limit} remaining</span>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        <div className="space-y-2 mb-8">
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
            <Sparkles className="w-8 h-8 text-primary" />
            Create Prompt
          </h1>
          <p className="text-muted-foreground">
            Craft your AI prompt and save it to your library.
          </p>
        </div>

        {!canGenerate && plan === "free" && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 mb-6">
            <p className="text-sm text-destructive font-medium">
              You've used all {limit} generations this month.{" "}
              <button onClick={() => setShowUpgradeModal(true)} className="underline font-bold">
                Upgrade now
              </button>{" "}
              for unlimited access.
            </p>
          </div>
        )}

        <div className="bg-card border border-border rounded-xl p-6 space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Prompt Title</label>
            <Input
              placeholder="e.g. Blog Post Generator"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="bg-background"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Prompt Content</label>
            <Textarea
              placeholder="Write your prompt here... Be specific about what you want the AI to generate."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="bg-background min-h-[200px]"
            />
          </div>
          <div className="flex gap-3">
            <Button onClick={handleSave} disabled={saving} className="flex-1">
              {saving ? "Saving..." : "Save Prompt"}
            </Button>
            <Button variant="outline" onClick={() => navigate("/dashboard")}>
              Cancel
            </Button>
          </div>
        </div>
      </main>

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

export default CreatePrompt;
