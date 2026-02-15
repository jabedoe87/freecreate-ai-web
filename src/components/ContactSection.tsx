import { Mail } from "lucide-react";

const ContactSection = () => {
  return (
    <section id="contact" className="py-24 px-6">
      <div className="max-w-xl mx-auto text-center">
        <h2 className="text-3xl sm:text-4xl font-bold mb-6 text-gradient">Get in Touch</h2>
        <p className="text-muted-foreground mb-8">
          Have a question or want to work together? Reach out anytime.
        </p>
        <a
          href="mailto:mich.vanhaute@gmail.com"
          className="inline-flex items-center gap-3 text-lg text-primary hover:underline transition-colors"
        >
          <Mail className="w-5 h-5" />
          mich.vanhaute@gmail.com
        </a>
      </div>
    </section>
  );
};

export default ContactSection;
