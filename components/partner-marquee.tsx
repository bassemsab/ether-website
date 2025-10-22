import { partners } from '@/lib/utils/content';

export function PartnerMarquee() {
  const items = [...partners, ...partners];

  return (
    <div className="overflow-hidden rounded-full border border-black/5 bg-white/70 py-4">
      <div className="flex w-[200%] animate-marquee gap-10 whitespace-nowrap text-xs uppercase tracking-[0.4em] text-muted-foreground">
        {items.map((partner, index) => (
          <span key={`${partner}-${index}`} className="inline-flex items-center gap-3">
            {partner}
            <span className="h-1.5 w-1.5 rounded-full bg-accent/70" aria-hidden="true" />
          </span>
        ))}
      </div>
    </div>
  );
}
