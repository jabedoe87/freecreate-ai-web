import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type SubscriptionPlan = "free" | "pro" | "bundle";

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: { display_name: string | null; avatar_url: string | null; email: string | null } | null;
  plan: SubscriptionPlan;
  isLoading: boolean;
  signOut: () => Promise<void>;
  refreshSubscription: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  plan: "free",
  isLoading: true,
  signOut: async () => {},
  refreshSubscription: async () => {},
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AuthContextType["profile"]>(null);
  const [plan, setPlan] = useState<SubscriptionPlan>("free");
  const [isLoading, setIsLoading] = useState(true);

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase.from("profiles").select("display_name, avatar_url, email").eq("user_id", userId).maybeSingle();
    if (data) setProfile(data);
  };

  // Always read directly from DB — never rely on stale check-subscription edge function cache
  // Accepts explicit userId to avoid stale closure bug when called from onAuthStateChange
  const refreshSubscription = useCallback(async (currentUser?: User | null) => {
    // Prefer the explicitly-passed user to avoid capturing a stale `user` from closure
    const uid = currentUser?.id ?? user?.id;
    if (!uid) return;
    try {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("plan, status")
        .eq("user_id", uid)
        .maybeSingle();

      if (error) {
        console.error("[useAuth] refreshSubscription query error:", error.message);
        return;
      }
      if (data?.plan) {
        setPlan(data.plan as SubscriptionPlan);
      }
    } catch (err) {
      console.error("[useAuth] refreshSubscription error:", err);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let mounted = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        setTimeout(() => {
          fetchProfile(session.user.id);
          refreshSubscription(session.user);
        }, 0);
      } else {
        setProfile(null);
        setPlan("free");
      }
    });

    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        await fetchProfile(session.user.id);
        await refreshSubscription(session.user);
      }
      setIsLoading(false);
    };

    init();
    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);

  // Periodic subscription refresh every 60s to catch webhook-triggered updates
  // Capture user via ref to avoid re-creating interval on every user state change
  useEffect(() => {
    if (!user) return;
    const uid = user.id;
    const interval = setInterval(async () => {
      try {
        const { data } = await supabase
          .from("subscriptions")
          .select("plan, status")
          .eq("user_id", uid)
          .maybeSingle();
        if (data?.plan) setPlan(data.plan as SubscriptionPlan);
      } catch (e) {
        console.error("[useAuth] periodic refresh error:", e);
      }
    }, 60000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setProfile(null);
    setPlan("free");
  };

  return (
    <AuthContext.Provider value={{ session, user, profile, plan, isLoading, signOut, refreshSubscription }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
