export function Studio() {
  const studios = [
    {
      city: 'Paris',
      timezone: 'UTC+1',
      focus: 'Recherche utilisateur, direction photo, scenarii physiques'
    },
    {
      city: 'Montréal',
      timezone: 'UTC-5',
      focus: 'Produit numérique, design system, QA accessibilité'
    },
    {
      city: 'Dakar',
      timezone: 'UTC+0',
      focus: 'Brand storytelling, production audiovisuelle, communautés'
    }
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {studios.map((studio) => (
        <article key={studio.city} className="retro-card space-y-4 p-6">
          <header className="flex items-baseline justify-between">
            <h3 className="font-display text-2xl">{studio.city}</h3>
            <span className="font-mono text-sm text-muted-foreground">{studio.timezone}</span>
          </header>
          <p className="text-sm text-muted-foreground">{studio.focus}</p>
          <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Sessions immersives sur place</div>
        </article>
      ))}
      <div className="retro-card space-y-4 p-6">
        <h3 className="font-display text-2xl">Collectif</h3>
        <p className="text-sm text-muted-foreground">
          UX strategists, creative technologists, motion designers et compositeurs sonores collaborent selon les projets.
        </p>
        <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
          16 talents · 7 disciplines · 3 langues
        </p>
      </div>
    </div>
  );
}
