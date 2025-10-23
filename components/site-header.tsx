"use client";

import { useCallback, useMemo, useState, startTransition, useEffect } from "react";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "./button";
import { cn } from "@/lib/utils/cn";
import {
  locales,
  localeAbbreviations,
  isLocale,
  localeDirections,
  type Locale,
} from "@/lib/i18n/config";

type NavigationItem = {
  label: string;
  href: string;
};

type SiteHeaderProps = {
  locale: Locale;
  navigation: NavigationItem[];
  collaborateLabel: string;
  logoAlt: string;
  languageLabel: string;
  homeLabel: string;
  menuLabel: string;
};

export function SiteHeader({
  locale,
  navigation,
  collaborateLabel,
  logoAlt,
  languageLabel,
  homeLabel,
  menuLabel,
}: SiteHeaderProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.dir = localeDirections[locale];
      document.documentElement.lang = locale;
    }
  }, [locale]);

  const localeLinks = useMemo(() => {
    const segments = pathname.split("/").filter(Boolean);
    const [, ...rest] = segments;
    const basePath = rest.length ? `/${rest.join("/")}` : "";
    const queryEntries = Array.from(searchParams.entries());
    const queryString = queryEntries.length
      ? `?${new URLSearchParams(queryEntries).toString()}`
      : "";

    return locales.map((loc) => ({
      locale: loc,
      href: `/${loc}${basePath}${queryString}`,
      active: loc === locale,
      label: localeAbbreviations[loc],
    }));
  }, [locale, pathname, searchParams]);

  const changeLocale = useCallback(
    (nextLocale: Locale) => {
      const target = localeLinks.find((item) => item.locale === nextLocale);
      if (!target || target.active) {
        return;
      }
      if (typeof document !== "undefined") {
        document.cookie = `NEXT_LOCALE=${nextLocale}; path=/;`;
      }
      startTransition(() => {
        router.push(target.href as any);
      });
    },
    [localeLinks, router]
  );

  const handleLocaleChange = useCallback(
    (value: string, closeMenu = false) => {
      if (!isLocale(value)) {
        return;
      }
      if (closeMenu) {
        setOpen(false);
      }
      changeLocale(value);
    },
    [changeLocale]
  );

  return (
    <header className="relative z-50 bg-background px-6 pb-3 pt-4 md:sticky md:top-0 md:bg-transparent md:px-0 md:pb-0 md:pt-0 md:backdrop-blur-lg">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 rounded-full border border-black/5 bg-surface px-5 py-3 shadow-retro-sm transition-all md:px-6 md:py-4 md:bg-surface/70">
        <a href={`/${locale}`} aria-label={homeLabel} className="flex items-center">
          {/* <BrandMark /> */}
          <Image
            src="https://img.ether.paris/ether-website/assets/ether.png?width=1000"
            alt={logoAlt}
            width={50}
            height={50}
            className="ml-4"
            priority
          />
        </a>

        <nav className="hidden items-center gap-8 md:flex">
          {navigation.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="text-xs uppercase tracking-[0.3em] text-muted-foreground transition hover:text-foreground"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <div className="text-xs">
            <label htmlFor="desktop-language" className="sr-only">
              {languageLabel}
            </label>
            <select
              id="desktop-language"
              value={locale}
              onChange={(event) => handleLocaleChange(event.target.value)}
              className="rounded-full border border-black/10 bg-surface/80 px-3 py-1 uppercase tracking-[0.3em] text-muted-foreground transition focus:outline-none focus:ring-2 focus:ring-brand"
            >
              {localeLinks.map((item) => (
                <option key={item.locale} value={item.locale}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <Button
            type="button"
            onClick={() => {
              const contact = document.querySelector("#contact");
              contact?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            {collaborateLabel}
          </Button>
        </div>

        <button
          type="button"
          aria-expanded={open}
          aria-controls="mobile-menu"
          onClick={() => setOpen((prev) => !prev)}
          className="focus-ring inline-flex h-10 w-10 items-center justify-center rounded-full border border-black/10 bg-surface md:hidden md:bg-surface/70"
        >
          <span className="sr-only">{menuLabel}</span>
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
          "absolute left-6 right-6 top-full z-10 pt-4 transition-all duration-200 md:hidden md:left-0 md:right-0",
          open
            ? "pointer-events-auto opacity-100 translate-y-0"
            : "pointer-events-none -translate-y-3 opacity-0"
        )}
      >
        <nav className="space-y-3 rounded-3xl border border-black/5 bg-surface p-6 shadow-retro-sm md:bg-surface/80 md:backdrop-blur-md">
          <div className="space-y-2 text-xs">
            <label htmlFor="mobile-language" className="uppercase tracking-[0.3em] text-muted-foreground">
              {languageLabel}
            </label>
            <select
              id="mobile-language"
              value={locale}
              onChange={(event) => handleLocaleChange(event.target.value, true)}
              className="w-full rounded-2xl border border-black/10 bg-surface px-4 py-2 uppercase tracking-[0.3em] text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand"
            >
              {localeLinks.map((item) => (
                <option key={item.locale} value={item.locale}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          {navigation.map((item) => (
            <a
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="block rounded-2xl bg-surface px-5 py-3 text-sm uppercase tracking-[0.3em] text-muted-foreground transition hover:bg-surface hover:text-foreground md:bg-surface/60"
            >
              {item.label}
            </a>
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
            {collaborateLabel}
          </Button>
        </nav>
      </div>
    </header>
  );
}
