type ManifestoProps = {
  paragraphs: string[];
  bullets: string[];
  offer: {
    title: string;
    description: string;
    phases: { label: string; timeline: string }[];
  };
};

export function Manifesto({ paragraphs, bullets, offer }: ManifestoProps) {
  const [lead, ...rest] = paragraphs;

  return (
    <div className="grid gap-10 md:grid-cols-[1.2fr_0.8fr] md:items-start">
      <div className="space-y-6">
        {lead ? (
          <p className="font-display text-2xl leading-snug text-foreground md:text-3xl">
            {lead}
          </p>
        ) : null}
        {rest.map((paragraph) => (
          <p key={paragraph} className="text-sm text-muted-foreground md:text-base">
            {paragraph}
          </p>
        ))}
        <div className="divider" />
        <ul className="grid gap-3 text-sm text-muted-foreground">
          {bullets.map((bullet) => (
            <li key={bullet} className="flex items-start gap-3">
              <span className="mt-1 h-2 w-2 rounded-full bg-brand" aria-hidden="true" />
              {bullet}
            </li>
          ))}
        </ul>
      </div>
      <div className="retro-card space-y-6 p-8">
        <h3 className="font-display text-xl">{offer.title}</h3>
        <p className="text-sm text-muted-foreground">{offer.description}</p>
        <ul className="space-y-3 text-sm">
          {offer.phases.map((phase) => (
            <li key={phase.label} className="flex items-center justify-between">
              <span className="uppercase tracking-[0.3em] text-muted-foreground">
                {phase.label}
              </span>
              <span className="font-mono text-sm text-brand">{phase.timeline}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
