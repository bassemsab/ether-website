export function Manifesto() {
  return (
    <div className="grid gap-10 md:grid-cols-[1.2fr_0.8fr] md:items-start">
      <div className="space-y-6">
        <p className="font-display text-2xl leading-snug text-foreground md:text-3xl">
          Ether est un studio polymorphe. Nous voyageons pour rencontrer les équipes, capter les textures des lieux,
          et traduire ces vibrations en expériences numériques tactiles.
        </p>
        <p className="text-sm text-muted-foreground md:text-base">
          L’approche Retroui reconnecte avec les codes analogiques : transitions granuleuses, typographies mémorielles,
          couleurs patinées. Chaque projet devient une pièce curatoriale prête à vivre sur écran, papier ou scène.
        </p>
        <div className="divider" />
        <ul className="grid gap-3 text-sm text-muted-foreground">
          <li className="flex items-start gap-3">
            <span className="mt-1 h-2 w-2 rounded-full bg-brand" aria-hidden="true" />
            Expériences bilingues fr/en pour toucher des audiences globales.
          </li>
          <li className="flex items-start gap-3">
            <span className="mt-1 h-2 w-2 rounded-full bg-brand" aria-hidden="true" />
            Méthodologie accessible par design, audité AA+ avec partenaires spécialisés.
          </li>
          <li className="flex items-start gap-3">
            <span className="mt-1 h-2 w-2 rounded-full bg-brand" aria-hidden="true" />
            Production agile : sprints hebdomadaires, rituels dédiés aux parties prenantes.
          </li>
        </ul>
      </div>
      <div className="retro-card space-y-6 p-8">
        <h3 className="font-display text-xl">Offre signature</h3>
        <p className="text-sm text-muted-foreground">
          Un programme de 10 semaines qui combine audit culturel, prototypage vivant et orchestration du lancement,
          calibré pour les créateurs ambitieux.
        </p>
        <ul className="space-y-3 text-sm">
          <li className="flex items-center justify-between">
            <span className="uppercase tracking-[0.3em] text-muted-foreground">Phase Exploration</span>
            <span className="font-mono text-sm text-brand">Semaines 1-3</span>
          </li>
          <li className="flex items-center justify-between">
            <span className="uppercase tracking-[0.3em] text-muted-foreground">Phase Design</span>
            <span className="font-mono text-sm text-brand">Semaines 4-7</span>
          </li>
          <li className="flex items-center justify-between">
            <span className="uppercase tracking-[0.3em] text-muted-foreground">Phase Activation</span>
            <span className="font-mono text-sm text-brand">Semaines 8-10</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
