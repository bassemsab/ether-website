"use client";

import { useState } from "react";
import Link from "next/link";
import { BrandMark } from "./brand-mark";
import Image from "next/image";
import { Button } from "./button";
import { siteConfig } from "@/lib/utils/site-config";
import { cn } from "@/lib/utils/cn";

export function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 backdrop-blur-lg">
      <div className="container mx-auto flex items-center justify-between gap-4 rounded-full border border-black/5 bg-white/70 px-6 py-4 shadow-retro-sm transition-all">
        <Link href="/" aria-label="Retour à l’accueil">
          {/* <BrandMark /> */}
          <Image
            src="https://img.ether.paris/ether-website/assets/ether.png?width=1000"
            alt="Assemblage créatif par Ether"
            width={50}
            height={50}
            className="ml-4"
            priority
          />
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {siteConfig.navigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-xs uppercase tracking-[0.3em] text-muted-foreground transition hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="hidden md:block">
          <Button
            type="button"
            onClick={() => {
              const contact = document.querySelector("#contact");
              contact?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            Collaborer
          </Button>
        </div>
        <button
          type="button"
          aria-expanded={open}
          aria-controls="mobile-menu"
          onClick={() => setOpen((prev) => !prev)}
          className="focus-ring inline-flex h-10 w-10 items-center justify-center rounded-full border border-black/10 bg-white/70 md:hidden"
        >
          <span className="sr-only">Menu</span>
          <div className="grid h-4 w-4 gap-1">
            {[0, 1, 2].map((line) => (
              <span
                key={line}
                className={cn(
                  "block h-[2px] w-full rounded-full bg-foreground transition-transform duration-200",
                  open && line === 0 && "translate-y-[6px] -rotate-45",
                  open && line === 1 && "opacity-0",
                  open && line === 2 && "-translate-y-[6px] rotate-45"
                )}
              />
            ))}
          </div>
        </button>
      </div>
      <div
        id="mobile-menu"
        className={cn(
          "md:hidden",
          open
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0"
        )}
      >
        <nav className="container mt-4 space-y-3 rounded-3xl border border-black/5 bg-white/80 p-6 shadow-retro-sm backdrop-blur-md">
          {siteConfig.navigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="block rounded-2xl bg-white/60 px-5 py-3 text-sm uppercase tracking-[0.3em] text-muted-foreground transition hover:bg-white hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
          <Button
            type="button"
            size="lg"
            className="w-full"
            onClick={() => {
              setOpen(false);
              const contact = document.querySelector("#contact");
              contact?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            Collaborer
          </Button>
        </nav>
      </div>
    </header>
  );
}
