import Image from 'next/image';
import { caseStudies } from '@/lib/utils/content';

export function CaseStudies() {
  return (
    <div className="grid gap-8 lg:grid-cols-3">
      {caseStudies.map((project) => (
        <article key={project.title} className="retro-card overflow-hidden">
          <div className="relative aspect-[4/5] overflow-hidden rounded-t-[2.5rem]">
            <Image
              src={project.image}
              alt={project.title}
              width={800}
              height={1000}
              className="h-full w-full object-cover transition-transform duration-700 hover:scale-[1.05]"
            />
            <div className="absolute right-5 top-5 rounded-full bg-surface/80 px-4 py-2 text-xs uppercase tracking-[0.3em] text-muted-foreground">
              {project.sector}
            </div>
          </div>
          <div className="space-y-5 p-8">
            <h3 className="font-display text-2xl">{project.title}</h3>
            <p className="text-sm text-muted-foreground">{project.summary}</p>
            <ul className="space-y-2 text-sm text-muted-foreground/80">
              {project.metrics.map((metric) => (
                <li key={metric} className="flex items-center gap-3">
                  <span className="h-2 w-8 rounded-full bg-accent/80" aria-hidden="true" />
                  <span>{metric}</span>
                </li>
              ))}
            </ul>
          </div>
        </article>
      ))}
    </div>
  );
}
