import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

const PLAN_LIMITS: Record<string, number> = {
  free: 5,
  pro: 999999,
  bundle: 999999,
};

export const useUsage = () => {
  const { user, plan } = useAuth();
  const [usageCount, setUsageCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const currentMonth = new Date().toISOString().slice(0, 7);
  const limit = PLAN_LIMITS[plan] || 5;
  const canGenerate = usageCount < limit;
  const remaining = Math.max(0, limit - usageCount);

  const fetchUsage = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("usage_tracking")
      .select("count")
      .eq("user_id", user.id)
      .eq("action", "generation")
      .eq("month", currentMonth)
      .maybeSingle();
    setUsageCount(data?.count || 0);
    setLoading(false);
  }, [user, currentMonth]);

  useEffect(() => {
    fetchUsage();
  }, [fetchUsage]);

  const incrementUsage = async () => {
    if (!user) return false;
    const { data: existing } = await supabase
      .from("usage_tracking")
      .select("id, count")
      .eq("user_id", user.id)
      .eq("action", "generation")
      .eq("month", currentMonth)
      .maybeSingle();

    if (existing) {
      if (existing.count >= limit) return false;
      await supabase
        .from("usage_tracking")
        .update({ count: existing.count + 1 })
        .eq("id", existing.id);
      setUsageCount(existing.count + 1);
    } else {
      await supabase
        .from("usage_tracking")
        .insert({ user_id: user.id, action: "generation", month: currentMonth, count: 1 });
      setUsageCount(1);
    }
    return true;
  };

  return { usageCount, limit, canGenerate, remaining, loading, incrementUsage, refetch: fetchUsage };
};
