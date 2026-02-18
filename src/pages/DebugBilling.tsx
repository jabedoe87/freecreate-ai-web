import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { RefreshCw, ShieldAlert } from "lucide-react";

const OWNER_EMAIL = import.meta.env.VITE_OWNER_EMAIL || "";

interface StripeEvent {
  id: string;
  event_id: string;
  type: string;
  customer_id: string | null;
  user_id: string | null;
  created_at: string;
  status: string;
  error: string | null;
}

interface ProfileRow {
  id: string;
  user_id: string;
  email: string | null;
  plan?: string;
  stripe_customer_id?: string | null;
}

interface SubRow {
  id: string;
  user_id: string;
  plan: string;
  status: string;
  current_period_end: string | null;
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
}

const DebugBilling = () => {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();
  const [events, setEvents] = useState<StripeEvent[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [subs, setSubs] = useState<SubRow[]>([]);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOwner = user?.email === OWNER_EMAIL || !OWNER_EMAIL;

  const fetchAll = useCallback(async () => {
    if (!user || !isOwner) return;
    setFetching(true);
    setError(null);
    try {
      const [eventsRes, profilesRes, subsRes] = await Promise.all([
        supabase.from("stripe_events").select("*").order("created_at", { ascending: false }).limit(10),
        supabase.from("profiles").select("id, user_id, email, display_name"),
        supabase.from("subscriptions").select("*").order("created_at", { ascending: false }).limit(20),
      ]);
      if (eventsRes.error) throw eventsRes.error;
      if (profilesRes.error) throw profilesRes.error;
      if (subsRes.error) throw subsRes.error;
      setEvents(eventsRes.data as StripeEvent[]);
      setProfiles(profilesRes.data as ProfileRow[]);
      setSubs(subsRes.data as SubRow[]);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setFetching(false);
    }
  }, [user, isOwner]);

  useEffect(() => {
    if (!isLoading && !user) navigate("/auth");
  }, [isLoading, user]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!isOwner) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4">
        <ShieldAlert className="w-12 h-12 text-destructive" />
        <p className="text-foreground font-semibold text-xl">Access denied</p>
        <Button variant="outline" onClick={() => navigate("/dashboard")}>Back to Dashboard</Button>
      </div>
    );
  }

  const fmt = (iso: string) => new Date(iso).toLocaleString();
  const lastWebhook = events[0]?.created_at;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-4">
          <span className="font-bold text-foreground">🔧 Debug — Billing</span>
          <div className="flex items-center gap-3">
            {lastWebhook && (
              <span className="text-xs text-muted-foreground">Last webhook: {fmt(lastWebhook)}</span>
            )}
            <Button size="sm" variant="outline" onClick={fetchAll} disabled={fetching}>
              <RefreshCw className={`w-4 h-4 mr-2 ${fetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button size="sm" variant="ghost" onClick={() => navigate("/dashboard")}>Dashboard</Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10 space-y-10">
        {error && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 text-sm text-destructive">{error}</div>
        )}

        {/* Section 1: Stripe Events */}
        <section>
          <h2 className="text-lg font-bold text-foreground mb-4">Stripe Events (latest 10)</h2>
          <div className="bg-card border border-border rounded-xl overflow-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border">
                <tr className="text-left text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Event ID</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Error</th>
                </tr>
              </thead>
              <tbody>
                {events.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">No events yet</td></tr>
                ) : events.map((e) => (
                  <tr key={e.id} className="border-t border-border hover:bg-muted/30">
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground truncate max-w-[180px]">{e.event_id}</td>
                    <td className="px-4 py-3 text-foreground">{e.type}</td>
                    <td className="px-4 py-3 text-muted-foreground">{fmt(e.created_at)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        e.status === "success" ? "bg-green-500/10 text-green-500"
                        : e.status === "error" ? "bg-red-500/10 text-red-500"
                        : "bg-yellow-500/10 text-yellow-500"
                      }`}>{e.status}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-destructive truncate max-w-[200px]">{e.error || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Section 2: Billing Profiles */}
        <section>
          <h2 className="text-lg font-bold text-foreground mb-4">Billing Profiles</h2>
          <div className="bg-card border border-border rounded-xl overflow-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border">
                <tr className="text-left text-muted-foreground">
                  <th className="px-4 py-3 font-medium">User ID</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                </tr>
              </thead>
              <tbody>
                {profiles.length === 0 ? (
                  <tr><td colSpan={2} className="px-4 py-6 text-center text-muted-foreground">No profiles</td></tr>
                ) : profiles.map((p) => (
                  <tr key={p.id} className="border-t border-border hover:bg-muted/30">
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{p.user_id}</td>
                    <td className="px-4 py-3 text-foreground">{p.email || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Section 3: Subscriptions */}
        <section>
          <h2 className="text-lg font-bold text-foreground mb-4">Subscriptions</h2>
          <div className="bg-card border border-border rounded-xl overflow-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border">
                <tr className="text-left text-muted-foreground">
                  <th className="px-4 py-3 font-medium">User ID</th>
                  <th className="px-4 py-3 font-medium">Plan</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Period End</th>
                  <th className="px-4 py-3 font-medium">Stripe Sub ID</th>
                  <th className="px-4 py-3 font-medium">Customer ID</th>
                </tr>
              </thead>
              <tbody>
                {subs.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">No subscriptions</td></tr>
                ) : subs.map((s) => (
                  <tr key={s.id} className="border-t border-border hover:bg-muted/30">
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground truncate max-w-[140px]">{s.user_id}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${
                        s.plan === "pro" ? "bg-blue-500/10 text-blue-400"
                        : s.plan === "bundle" ? "bg-purple-500/10 text-purple-400"
                        : "bg-muted text-muted-foreground"
                      }`}>{s.plan}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${s.status === "active" ? "bg-green-500/10 text-green-500" : "bg-yellow-500/10 text-yellow-500"}`}>
                        {s.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{s.current_period_end ? fmt(s.current_period_end) : "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground truncate max-w-[160px]">{s.stripe_subscription_id || "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground truncate max-w-[140px]">{s.stripe_customer_id || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
};

export default DebugBilling;
