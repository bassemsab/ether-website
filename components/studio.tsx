type StudioLocation = {
  city: string;
  timezone: string;
  focus: string;
};

type StudioProps = {
  locations: StudioLocation[];
  onsiteLabel: string;
};

export function Studio({ locations, onsiteLabel }: StudioProps) {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {locations.map((studio) => (
        <article key={studio.city} className="retro-card space-y-4 p-6">
          <header className="flex items-baseline justify-between">
            <h3 className="font-display text-2xl">{studio.city}</h3>
            <span className="font-mono text-sm text-muted-foreground">
              {studio.timezone}
            </span>
          </header>
          <p className="text-sm text-muted-foreground">{studio.focus}</p>
          <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
            {onsiteLabel}
          </div>
        </article>
      ))}
    </div>
  );
}
