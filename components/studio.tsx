export function Studio() {
  const studios = [
    {
      city: 'Toronto',
      timezone: 'UTC-5',
      focus: 'Pilotage de projets logiciels et support produit pour l’Amérique du Nord'
    },
    {
      city: 'Paris',
      timezone: 'UTC+1',
      focus: 'Direction artistique du label et DJ mixage live sur les scènes parisiennes'
    },
    {
      city: 'Damas',
      timezone: 'UTC+3',
      focus: 'Conseil en stratégie et structuration des organisations culturelles'
    },
    {
      city: 'Kuala Lumpur',
      timezone: 'UTC+8',
      focus: 'DJ mixage et production studio pour la scène d’Asie du Sud-Est'
    },
    {
      city: 'Sharjah',
      timezone: 'UTC+4',
      focus: 'Gestion des catalogues et opérations de distribution musicale au Moyen-Orient'
    },
    {
      city: 'Riyad',
      timezone: 'UTC+3',
      focus: 'Accompagnement en gouvernance et intégration digitale pour les entreprises régionales'
    },
    {
      city: 'Melbourne',
      timezone: 'UTC+10',
      focus: 'Support technique et maintenance 24/7 pour nos plateformes logicielles'
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
    </div>
  );
}
