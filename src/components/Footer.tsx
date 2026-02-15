const Footer = () => {
  return (
    <footer className="border-t border-border py-8 px-6 text-center">
      <p className="text-sm text-muted-foreground">
        © {new Date().getFullYear()} FreeCreate AI – Belgium
      </p>
    </footer>
  );
};

export default Footer;
