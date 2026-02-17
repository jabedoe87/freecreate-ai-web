import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ArrowLeft, Search, Lock, Copy, Crown } from "lucide-react";

interface Template {
  id: string;
  title: string;
  content: string;
  category: string;
  min_plan: string;
  is_featured: boolean;
}

const PLAN_RANK: Record<string, number> = { free: 0, pro: 1, bundle: 2 };

const Templates = () => {
  const { plan } = useAuth();
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase.from("prompt_templates").select("*").order("is_featured", { ascending: false });
      setTemplates((data as Template[]) || []);
      setLoading(false);
    };
    fetch();
  }, []);

  const categories = ["all", ...Array.from(new Set(templates.map((t) => t.category)))];

  const filtered = templates.filter((t) => {
    const matchSearch = t.title.toLowerCase().includes(search.toLowerCase()) || t.content.toLowerCase().includes(search.toLowerCase());
    const matchCat = category === "all" || t.category === category;
    return matchSearch && matchCat;
  });

  const canAccess = (minPlan: string) => PLAN_RANK[plan] >= (PLAN_RANK[minPlan] || 0);

  const handleUse = (t: Template) => {
    if (!canAccess(t.min_plan)) {
      toast.error(`This template requires the ${t.min_plan.toUpperCase()} plan`);
      return;
    }
    navigator.clipboard.writeText(t.content);
    toast.success("Copied to clipboard! Paste it in the prompt editor.");
  };

  const planBadge = (minPlan: string) => {
    if (minPlan === "free") return null;
    return (
      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${minPlan === "pro" ? "bg-primary/20 text-primary" : "bg-yellow-500/20 text-yellow-400"}`}>
        <Crown className="w-3 h-3 inline mr-1" />
        {minPlan.toUpperCase()}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-5xl mx-auto flex items-center justify-between px-6 py-4">
          <button onClick={() => navigate("/dashboard")} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />
            <span className="text-lg font-bold text-gradient">FreeCreate AI</span>
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold text-foreground mb-2">Prompt Templates</h1>
        <p className="text-muted-foreground mb-6">Browse premium AI prompts. Upgrade for full access.</p>

        <div className="flex flex-col sm:flex-row gap-4 mb-8">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search templates..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 bg-card" />
          </div>
          <div className="flex gap-2 flex-wrap">
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${category === c ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground hover:text-foreground"}`}
              >
                {c.charAt(0).toUpperCase() + c.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-muted-foreground py-16">No templates found.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.map((t) => {
              const locked = !canAccess(t.min_plan);
              return (
                <div key={t.id} className={`bg-card border border-border rounded-xl p-5 space-y-3 ${locked ? "opacity-70" : ""}`}>
                  <div className="flex items-start justify-between">
                    <h3 className="font-semibold text-foreground">{t.title}</h3>
                    {planBadge(t.min_plan)}
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-3">{t.content}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground capitalize">{t.category}</span>
                    {locked ? (
                      <Button size="sm" variant="secondary" onClick={() => navigate("/upgrade")}>
                        <Lock className="w-3 h-3 mr-1" /> Unlock
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => handleUse(t)}>
                        <Copy className="w-3 h-3 mr-1" /> Use
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};

export default Templates;
