import { Link } from "react-router-dom";

const Footer = () => {
  return (
    <footer className="border-t border-border py-10 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 mb-6">
          <Link to="/privacy-policy" className="text-sm text-muted-foreground hover:text-primary transition-colors">
            Privacy Policy
          </Link>
          <Link to="/terms-of-service" className="text-sm text-muted-foreground hover:text-primary transition-colors">
            Terms of Service
          </Link>
          <Link to="/refund-policy" className="text-sm text-muted-foreground hover:text-primary transition-colors">
            Refund Policy
          </Link>
          <Link to="/cookie-policy" className="text-sm text-muted-foreground hover:text-primary transition-colors">
            Cookie Policy
          </Link>
        </div>
        <p className="text-sm text-muted-foreground text-center">
          © {new Date().getFullYear()} FreeCreate AI – Belgium
        </p>
      </div>
    </footer>
  );
};

export default Footer;
