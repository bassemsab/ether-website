import Image from "next/image";
import Link from "next/link";
import { Button } from "./button";
import { highlights } from "@/lib/utils/content";
import { siteConfig } from "@/lib/utils/site-config";

export function Hero() {
  return (
    <section className="relative isolate overflow-hidden rounded-3xl border border-black/5 bg-gradient-to-br from-white via-brand-light/20 to-white px-6 py-16 shadow-retro md:px-12 md:py-20">
      <div
        className="absolute -top-10 -right-10 h-48 w-48 rounded-full bg-accent/40 blur-3xl"
        aria-hidden="true"
      />
      <div className="grid gap-12 md:grid-cols-[1.1fr_0.9fr] md:items-center">
        <div className="space-y-8">
          <p className="section-heading">{siteConfig.motto}</p>
          <h1 className="font-display text-4xl leading-tight tracking-tight text-foreground md:text-6xl">
            Studio créatif itinérant pour expériences numériques sensibles.
          </h1>
          <p className="max-w-xl text-base text-muted-foreground md:text-lg">
            Nous orchestrons des plateformes, identités et activations qui
            résonnent avec les communautés culturelles, en mêlant design
            rétro-futuriste et rigueur opérationnelle.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <Button asChild>
              <Link href="#contact">Entrer en contact</Link>
            </Button>
            <Button variant="ghost" asChild>
              <Link href="#cases">Voir les cas</Link>
            </Button>
          </div>
          <dl className="grid gap-6 pt-4 sm:grid-cols-3">
            {highlights.map((item) => (
              <div
                key={item.label}
                className="rounded-3xl border border-black/5 bg-white/60 p-5 backdrop-blur-sm"
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
          <div className="aspect-[4/5] overflow-hidden rounded-[2.5rem] border border-black/10 bg-white/60 shadow-retro">
            <Image
              src="https://img.ether.paris/ether-website/assets/ether.png?width=1000"
              alt="Assemblage créatif par Ether"
              width={900}
              height={1125}
              className="h-full w-full object-cover"
              priority
            />
          </div>
          <div className="absolute -bottom-20 left-1/2 w-[110%] -translate-x-1/2 rounded-full border border-black/5 bg-white/80 px-6 py-4 text-center text-xs uppercase tracking-[0.3em] text-muted-foreground shadow-retro-sm">
            {siteConfig.name} · Tout partout
          </div>
        </div>
      </div>
    </section>
  );
}
