import { useNavigate } from "react-router-dom";

const sectionLinks = ["About", "Services", "Contact"];

const Navbar = () => {
  const navigate = useNavigate();

  const scrollTo = (id: string) => {
    document.getElementById(id.toLowerCase())?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/50">
      <div className="max-w-5xl mx-auto flex items-center justify-between px-6 py-4">
        <span className="text-lg font-bold text-gradient">FreeCreate AI</span>
        <div className="hidden sm:flex items-center gap-6">
          {sectionLinks.map((link) => (
            <button
              key={link}
              onClick={() => scrollTo(link)}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {link}
            </button>
          ))}
          <button
            onClick={() => navigate("/auth?mode=login")}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Login
          </button>
          <button
            onClick={() => navigate("/auth?mode=signup")}
            className="text-sm font-medium text-primary hover:text-primary/80 transition-colors"
          >
            Sign Up
          </button>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
