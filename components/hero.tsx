import Image from "next/image";
import { Button } from "./button";

type Highlight = {
  label: string;
  value: string;
  detail: string;
};

type HeroProps = {
  eyebrow: string;
  heading: string;
  description: string;
  primaryCta: { label: string; href: string };
  secondaryCta: { label: string; href: string };
  highlights: Highlight[];
  imageAlt: string;
};

export function Hero({
  eyebrow,
  heading,
  description,
  primaryCta,
  secondaryCta,
  highlights,
  imageAlt,
}: HeroProps) {
  return (
    <section className="relative isolate overflow-hidden rounded-3xl border border-black/5 bg-gradient-to-br from-surface via-brand-light/20 to-surface px-6 py-16 shadow-retro md:px-12 md:py-20">
      <div
        className="absolute -top-10 -right-10 h-48 w-48 rounded-full bg-accent/40 blur-3xl"
        aria-hidden="true"
      />
      <div className="grid gap-12 md:grid-cols-[1.1fr_0.9fr] md:items-center">
        <div className="space-y-8">
          <p className="section-heading">{eyebrow}</p>
          <h1 className="font-display text-4xl leading-tight tracking-tight text-foreground md:text-6xl">
            {heading}
          </h1>
          <p className="max-w-xl text-base text-muted-foreground md:text-lg">
            {description}
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <Button asChild>
              <a href={primaryCta.href}>{primaryCta.label}</a>
            </Button>
            <Button variant="ghost" asChild>
              <a href={secondaryCta.href}>{secondaryCta.label}</a>
            </Button>
          </div>
          <dl className="grid gap-6 pt-4 sm:grid-cols-3">
            {highlights.map((item) => (
              <div
                key={item.label}
                className="rounded-3xl border border-black/5 bg-surface/60 p-5 backdrop-blur-sm"
              >
                <dt className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                  {item.label}
                </dt>
                <dd className="mt-3 font-display text-3xl text-brand">
                  {item.value}
                </dd>
                <p className="mt-2 text-xs text-muted-foreground">
                  {item.detail}
                </p>
              </div>
            ))}
          </dl>
        </div>
        <div className="relative">
          <Image
            src="https://img.ether.paris/ether-website/assets/ether.png?width=1000"
            alt={imageAlt}
            width={900}
            height={1125}
            className="h-full w-full object-cover rounded-3xl shadow-lg shadow-black/10"
            priority
          />
        </div>
      </div>
    </section>
  );
}
