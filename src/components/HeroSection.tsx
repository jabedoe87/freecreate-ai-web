import heroBg from "@/assets/hero-bg.jpg";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

const HeroSection = () => {
  const navigate = useNavigate();
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Background image */}
      <div className="absolute inset-0">
        <img
          src={heroBg}
          alt=""
          className="w-full h-full object-cover opacity-40"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-background/80 to-background" />
      </div>

      {/* Content */}
      <div className="relative z-10 text-center px-6 max-w-3xl mx-auto">
        <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold tracking-tight mb-4 animate-fade-in-up">
          <span className="text-gradient">FreeCreate AI</span>
        </h1>
        <p className="text-xl sm:text-2xl text-muted-foreground mb-10 animate-fade-in-up" style={{ animationDelay: "0.15s" }}>
          Smart Digital Tools & AI Automation
        </p>
        <div className="animate-fade-in-up" style={{ animationDelay: "0.3s" }}>
          <Button
            size="lg"
            className="glow-primary bg-primary text-primary-foreground hover:bg-primary/90 text-lg px-8 py-6 font-semibold"
            onClick={() => navigate("/auth")}
          >
            Get Started
          </Button>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
