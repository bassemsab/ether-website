type Service = {
  title: string;
  description: string;
  deliverables: string[];
};

type ExpertiseProps = {
  services: Service[];
};

export function Expertise({ services }: ExpertiseProps) {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {services.map((service) => (
        <article key={service.title} className="retro-card flex flex-col gap-6 p-8">
          <div className="space-y-3">
            <h3 className="font-display text-2xl">{service.title}</h3>
            <p className="text-sm text-muted-foreground">{service.description}</p>
          </div>
          <ul className="space-y-2 text-xs uppercase tracking-[0.3em] text-muted-foreground">
            {service.deliverables.map((item) => (
              <li key={item} className="flex items-center gap-2 text-muted-foreground/80">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
        </article>
      ))}
    </div>
  );
}
