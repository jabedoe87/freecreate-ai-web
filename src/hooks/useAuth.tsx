import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type SubscriptionPlan = "free" | "pro" | "bundle";

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: { display_name: string | null; avatar_url: string | null; email: string | null } | null;
  plan: SubscriptionPlan;
  lifetimeAccess: boolean;
  isLoading: boolean;
  signOut: () => Promise<void>;
  refreshSubscription: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  plan: "free",
  lifetimeAccess: false,
  isLoading: true,
  signOut: async () => {},
  refreshSubscription: async () => {},
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AuthContextType["profile"]>(null);
  const [plan, setPlan] = useState<SubscriptionPlan>("free");
  const [lifetimeAccess, setLifetimeAccess] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase.from("profiles").select("display_name, avatar_url, email").eq("user_id", userId).maybeSingle();
    if (data) setProfile(data);
  };

  // Server-side entitlement read via edge function — single source of truth
  const refreshSubscription = useCallback(async () => {
    try {
      // Don't call the edge function if there's no valid session
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (!currentSession?.access_token) {
        console.warn("[useAuth] No valid session, skipping refresh-entitlement");
        return;
      }

      const { data, error } = await supabase.functions.invoke("refresh-entitlement");
      if (error) {
        console.error("[useAuth] refresh-entitlement error:", error.message);
        // If 401/403, session is invalid — sign out gracefully
        if (error.message?.includes("401") || error.message?.includes("Unauthorized") || error.message?.includes("Invalid token")) {
          console.warn("[useAuth] Session invalid, signing out");
          await supabase.auth.signOut();
          return;
        }
        // Fallback: direct DB read
        if (currentSession?.user) {
          const { data: subData } = await supabase
            .from("subscriptions")
            .select("plan, status")
            .eq("user_id", currentSession.user.id)
            .maybeSingle();
          if (subData?.plan) setPlan(subData.plan as SubscriptionPlan);
        }
        return;
      }
      if (data?.plan) setPlan(data.plan as SubscriptionPlan);
      if (data?.lifetime_access !== undefined) setLifetimeAccess(data.lifetime_access);
    } catch (err) {
      console.error("[useAuth] refreshSubscription error:", err);
    }
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
          refreshSubscription();
        }, 0);
      } else {
        setProfile(null);
        setPlan("free");
        setLifetimeAccess(false);
      }
    });

    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        await fetchProfile(session.user.id);
        await refreshSubscription();
      }
      setIsLoading(false);
    };

    init();
    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);

  // Periodic refresh every 60s
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => refreshSubscription(), 60000);
    return () => clearInterval(interval);
  }, [user?.id, refreshSubscription]);

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setProfile(null);
    setPlan("free");
    setLifetimeAccess(false);
  };

  return (
    <AuthContext.Provider value={{ session, user, profile, plan, lifetimeAccess, isLoading, signOut, refreshSubscription }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
