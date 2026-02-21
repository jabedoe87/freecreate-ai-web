import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ArrowLeft, Plus, Search, Trash2, Edit3, Star, StarOff } from "lucide-react";

interface Prompt {
  id: string;
  title: string;
  content: string;
  is_favorite: boolean;
  created_at: string;
}

const MyPrompts = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");

  const fetchPrompts = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("user_prompts")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setPrompts((data as Prompt[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchPrompts(); }, [user]);

  const filtered = prompts.filter(
    (p) =>
      p.title.toLowerCase().includes(search.toLowerCase()) ||
      p.content.toLowerCase().includes(search.toLowerCase())
  );

  const handleDelete = async (id: string) => {
    await supabase.from("user_prompts").delete().eq("id", id);
    setPrompts((prev) => prev.filter((p) => p.id !== id));
    toast.success("Prompt deleted");
  };

  const handleToggleFav = async (id: string, current: boolean) => {
    await supabase.from("user_prompts").update({ is_favorite: !current }).eq("id", id);
    setPrompts((prev) => prev.map((p) => (p.id === id ? { ...p, is_favorite: !current } : p)));
  };

  const startEdit = (p: Prompt) => {
    setEditingId(p.id);
    setEditTitle(p.title);
    setEditContent(p.content);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const trimmedTitle = editTitle.trim();
    const trimmedContent = editContent.trim();
    if (!trimmedTitle) { toast.error("Title cannot be empty"); return; }
    if (trimmedTitle.length > 200) { toast.error("Title must be 200 characters or less"); return; }
    if (!trimmedContent) { toast.error("Content cannot be empty"); return; }
    if (trimmedContent.length > 10000) { toast.error("Content must be 10,000 characters or less"); return; }
    const { error } = await supabase.from("user_prompts").update({ title: trimmedTitle, content: trimmedContent }).eq("id", editingId);
    if (error) { toast.error("Failed to update prompt: " + (error.message.includes("check") ? "Title or content exceeds length limit" : error.message)); return; }
    setPrompts((prev) => prev.map((p) => (p.id === editingId ? { ...p, title: trimmedTitle, content: trimmedContent } : p)));
    setEditingId(null);
    toast.success("Prompt updated");
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-4xl mx-auto flex items-center justify-between px-6 py-4">
          <button onClick={() => navigate("/dashboard")} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />
            <span className="text-lg font-bold text-gradient">FreeCreate AI</span>
          </button>
          <Button size="sm" onClick={() => navigate("/create-prompt")}>
            <Plus className="w-4 h-4 mr-2" /> New Prompt
          </Button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold text-foreground mb-6">My Prompts</h1>

        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search prompts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 bg-card"
          />
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 space-y-4">
            <p className="text-muted-foreground text-lg">
              {prompts.length === 0 ? "No prompts yet. Create your first one!" : "No prompts match your search."}
            </p>
            {prompts.length === 0 && (
              <Button onClick={() => navigate("/create-prompt")}>Create First Prompt</Button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map((p) => (
              <div key={p.id} className="bg-card border border-border rounded-xl p-5 space-y-3">
                {editingId === p.id ? (
                  <div className="space-y-3">
                    <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="bg-background" />
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="w-full bg-background border border-input rounded-md p-3 text-sm min-h-[100px] text-foreground"
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={saveEdit}>Save</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between">
                      <h3 className="font-semibold text-foreground">{p.title}</h3>
                      <div className="flex gap-1">
                        <button onClick={() => handleToggleFav(p.id, p.is_favorite)} className="p-1.5 hover:bg-muted rounded-md transition-colors">
                          {p.is_favorite ? <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" /> : <StarOff className="w-4 h-4 text-muted-foreground" />}
                        </button>
                        <button onClick={() => startEdit(p)} className="p-1.5 hover:bg-muted rounded-md transition-colors">
                          <Edit3 className="w-4 h-4 text-muted-foreground" />
                        </button>
                        <button onClick={() => handleDelete(p.id)} className="p-1.5 hover:bg-destructive/10 rounded-md transition-colors">
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </button>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-3">{p.content}</p>
                    <p className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleDateString()}</p>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default MyPrompts;
