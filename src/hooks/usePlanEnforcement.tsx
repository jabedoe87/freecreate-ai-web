import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useNavigate } from "react-router-dom";

const FREE_LIMIT = 5;

export const usePlanEnforcement = () => {
  const { user, plan } = useAuth();
  const navigate = useNavigate();
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [generationsThisMonth, setGenerationsThisMonth] = useState(0);
  const [loading, setLoading] = useState(true);

  // Current month in YYYY-MM format for usage_tracking queries
  const currentMonth = new Date().toISOString().slice(0, 7);

  const fetchUsage = useCallback(async () => {
    if (!user) return;
    try {
      const { data } = await supabase
        .from("usage_tracking")
        .select("count, month")
        .eq("user_id", user.id)
        .eq("action", "generation")
        .eq("month", currentMonth)
        .maybeSingle();

      setGenerationsThisMonth(data?.count ?? 0);
    } catch (e) {
      console.error("[usePlanEnforcement] fetchUsage error:", e);
    } finally {
      setLoading(false);
    }
  }, [user, currentMonth]);

  useEffect(() => {
    fetchUsage();
  }, [fetchUsage]);

  // Returns false only for free users at or above the limit
  const canGenerate = (): boolean => {
    if (plan === "pro" || plan === "bundle") return true;
    return generationsThisMonth < FREE_LIMIT;
  };

  // Increments usage counter; upserts row if first generation this month
  const incrementGeneration = async (): Promise<void> => {
    if (!user) return;
    try {
      const { data: existing } = await supabase
        .from("usage_tracking")
        .select("id, count")
        .eq("user_id", user.id)
        .eq("action", "generation")
        .eq("month", currentMonth)
        .maybeSingle();

      if (existing) {
        await supabase
          .from("usage_tracking")
          .update({ count: existing.count + 1 })
          .eq("id", existing.id);
        setGenerationsThisMonth(existing.count + 1);
      } else {
        await supabase.from("usage_tracking").insert({
          user_id: user.id,
          action: "generation",
          month: currentMonth,
          count: 1,
        });
        setGenerationsThisMonth(1);
      }
    } catch (e) {
      console.error("[usePlanEnforcement] incrementGeneration error:", e);
    }
  };

  const isPro = () => plan === "pro";
  const isBundle = () => plan === "bundle";
  const isPaid = () => isPro() || isBundle();

  // Gate helper: show modal and return false if generation not allowed
  const checkCanGenerate = (): boolean => {
    if (canGenerate()) return true;
    setShowUpgradeModal(true);
    return false;
  };

  const dismissModal = () => setShowUpgradeModal(false);

  const goToUpgrade = () => {
    dismissModal();
    navigate("/upgrade");
  };

  return {
    plan,
    isPro,
    isBundle,
    isPaid,
    canGenerate,
    checkCanGenerate,
    generationsThisMonth,
    limit: FREE_LIMIT,
    remaining: Math.max(0, FREE_LIMIT - generationsThisMonth),
    incrementGeneration,
    showUpgradeModal,
    setShowUpgradeModal,
    dismissModal,
    goToUpgrade,
    loading,
    refetch: fetchUsage,
  };
};
