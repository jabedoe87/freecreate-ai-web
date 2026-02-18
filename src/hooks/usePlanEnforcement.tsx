import { useState, useCallback } from "react";
import { useAuth } from "./useAuth";
import { useUsage } from "./useUsage";
import { useNavigate } from "react-router-dom";

export const usePlanEnforcement = () => {
  const { plan } = useAuth();
  const { canGenerate, remaining, limit, incrementUsage } = useUsage();
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const navigate = useNavigate();

  const isPro = () => plan === "pro";
  const isBundle = () => plan === "bundle";
  const isPaid = () => isPro() || isBundle();

  // Returns false and shows modal if generation is not allowed
  const checkCanGenerate = useCallback((): boolean => {
    if (canGenerate) return true;
    setShowUpgradeModal(true);
    return false;
  }, [canGenerate]);

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
    remaining,
    limit,
    checkCanGenerate,
    showUpgradeModal,
    dismissModal,
    goToUpgrade,
    incrementUsage,
  };
};
