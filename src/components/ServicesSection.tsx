import { Bot, Workflow, FileText, Briefcase } from "lucide-react";

const services = [
  {
    icon: Bot,
    title: "AI Prompts",
    description: "Ready-to-use, expertly crafted prompts to get the most out of any AI model.",
  },
  {
    icon: Workflow,
    title: "Automation Systems",
    description: "End-to-end automation workflows that eliminate repetitive tasks and boost productivity.",
  },
  {
    icon: FileText,
    title: "Digital Templates",
    description: "Professionally designed templates for content, marketing, and business operations.",
  },
  {
    icon: Briefcase,
    title: "Business Tools",
    description: "AI-powered tools built to streamline your business processes and decision-making.",
  },
];

const ServicesSection = () => {
  return (
    <section id="services" className="py-24 px-6">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-3xl sm:text-4xl font-bold text-center mb-16 text-gradient">
          Our Services
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {services.map((service) => (
            <div
              key={service.title}
              className="group surface-elevated border border-border rounded-lg p-8 transition-all duration-300 hover:glow-border"
            >
              <service.icon className="w-10 h-10 text-primary mb-5" />
              <h3 className="text-xl font-semibold text-foreground mb-3">{service.title}</h3>
              <p className="text-muted-foreground leading-relaxed">{service.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ServicesSection;
