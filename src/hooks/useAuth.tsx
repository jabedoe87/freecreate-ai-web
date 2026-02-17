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

  const refreshSubscription = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke("check-subscription");
      if (!error && data?.plan) {
        setPlan(data.plan as SubscriptionPlan);
      }
    } catch {
      // Fall back to DB
      if (user) {
        const { data } = await supabase.from("subscriptions").select("plan").eq("user_id", user.id).eq("status", "active").maybeSingle();
        if (data) setPlan(data.plan as SubscriptionPlan);
      }
    }
  }, [user]);

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
      }
    });

    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        await fetchProfile(session.user.id);
        // Defer subscription check to avoid blocking
        setTimeout(() => refreshSubscription(), 100);
      }
      setIsLoading(false);
    };

    init();
    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);

  // Periodic subscription refresh
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(refreshSubscription, 60000);
    return () => clearInterval(interval);
  }, [user, refreshSubscription]);

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
