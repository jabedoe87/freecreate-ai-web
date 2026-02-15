const navLinks = ["About", "Services", "Contact"];

const Navbar = () => {
  const scrollTo = (id: string) => {
    document.getElementById(id.toLowerCase())?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/50">
      <div className="max-w-5xl mx-auto flex items-center justify-between px-6 py-4">
        <span className="text-lg font-bold text-gradient">FreeCreate AI</span>
        <div className="hidden sm:flex gap-6">
          {navLinks.map((link) => (
            <button
              key={link}
              onClick={() => scrollTo(link)}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {link}
            </button>
          ))}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
