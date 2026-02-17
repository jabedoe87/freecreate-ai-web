import { useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

const DebugBanner = () => {
  if (import.meta.env.PROD) return null;

  const location = useLocation();
  const { session, isLoading } = useAuth();

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[9999] bg-foreground/90 text-background text-xs px-4 py-1.5 flex items-center gap-4 font-mono">
      <span>📍 {location.pathname}</span>
      <span>🔐 {isLoading ? "loading…" : session ? "logged in" : "logged out"}</span>
      <span>🌐 DEV</span>
    </div>
  );
};

export default DebugBanner;
