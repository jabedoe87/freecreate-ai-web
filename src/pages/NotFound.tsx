import { useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Home, LogIn, Zap, AlertTriangle } from "lucide-react";

// All valid SPA routes — if path matches one of these, it's a client routing issue (not a true 404)
const KNOWN_ROUTES = [
  "/", "/dashboard", "/create-prompt", "/my-prompts", "/templates",
  "/upgrade", "/auth", "/login", "/signup", "/app", "/home", "/pricing",
  "/privacy-policy", "/terms-of-service", "/refund-policy", "/cookie-policy",
  "/debug/billing",
];

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const isKnownRoute = KNOWN_ROUTES.some(
    (r) => location.pathname === r || location.pathname.startsWith(r + "/")
  );

  useEffect(() => {
    console.error("[404] Unknown route:", location.pathname, "| Known route?", isKnownRoute);
  }, [location.pathname, isKnownRoute]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="text-center max-w-md space-y-6">
        <div className="flex justify-center">
          <AlertTriangle className="w-16 h-16 text-muted-foreground" />
        </div>
        <div className="space-y-2">
          <h1 className="text-6xl font-bold text-foreground">404</h1>
          <p className="text-xl font-semibold text-foreground">Page not found</p>
          <p className="text-sm text-muted-foreground">
            {isKnownRoute
              ? "This page exists but didn't load correctly. Try one of the links below."
              : `The path "${location.pathname}" doesn't exist in this app.`}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button onClick={() => navigate("/")} variant="default" className="gap-2">
            <Home className="w-4 h-4" />
            Go Home
          </Button>
          <Button onClick={() => navigate("/auth")} variant="outline" className="gap-2">
            <LogIn className="w-4 h-4" />
            Log In
          </Button>
          <Button onClick={() => navigate("/upgrade")} variant="outline" className="gap-2">
            <Zap className="w-4 h-4" />
            Upgrade
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          FreeCreate AI · <a href="/" className="underline hover:text-foreground">freecreate-ai-web.lovable.app</a>
        </p>
      </div>
    </div>
  );
};

export default NotFound;

