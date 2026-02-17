import { createContext, useContext, useEffect, useState, ReactNode } from "react";
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
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  plan: "free",
  isLoading: true,
  signOut: async () => {},
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AuthContextType["profile"]>(null);
  const [plan, setPlan] = useState<SubscriptionPlan>("free");
  const [isLoading, setIsLoading] = useState(true);

  const fetchUserData = async (userId: string) => {
    const [profileRes, subRes] = await Promise.all([
      supabase.from("profiles").select("display_name, avatar_url, email").eq("user_id", userId).maybeSingle(),
      supabase.from("subscriptions").select("plan, status").eq("user_id", userId).eq("status", "active").maybeSingle(),
    ]);
    if (profileRes.data) setProfile(profileRes.data);
    if (subRes.data) setPlan(subRes.data.plan as SubscriptionPlan);
    else setPlan("free");
  };

  useEffect(() => {
    let mounted = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        setTimeout(() => fetchUserData(session.user.id), 0);
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
      if (session?.user) await fetchUserData(session.user.id);
      setIsLoading(false);
    };

    init();
    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setProfile(null);
    setPlan("free");
  };

  return (
    <AuthContext.Provider value={{ session, user, profile, plan, isLoading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
