type ApproachStep = {
  title: string;
  description: string;
  phase: string;
};

type ApproachProps = {
  steps: ApproachStep[];
};

export function Approach({ steps }: ApproachProps) {
  return (
    <div className="grid gap-6 md:grid-cols-3">
      {steps.map((item) => (
        <article key={item.title} className="retro-card relative overflow-hidden p-8">
          <span className="absolute right-6 top-6 text-6xl font-bold text-brand/10">
            {item.phase}
          </span>
          <div className="space-y-4">
            <h3 className="font-display text-2xl">{item.title}</h3>
            <p className="text-sm text-muted-foreground">{item.description}</p>
          </div>
        </article>
      ))}
    </div>
  );
}
