import { cn } from '@/lib/utils/cn';

type SectionProps = {
  id?: string;
  eyebrow?: string;
  title?: string;
  description?: string;
  className?: string;
  children: React.ReactNode;
};

export function Section({ id, eyebrow, title, description, className, children }: SectionProps) {
  return (
    <section id={id} className={cn('container space-y-10 py-16 md:py-24', className)}>
      {(eyebrow || title || description) && (
        <div className="max-w-2xl space-y-5">
          {eyebrow ? <p className="section-heading">{eyebrow}</p> : null}
          {title ? <h2 className="font-display text-3xl md:text-4xl">{title}</h2> : null}
          {description ? <p className="text-base text-muted-foreground md:text-lg">{description}</p> : null}
        </div>
      )}
      {children}
    </section>
  );
}
