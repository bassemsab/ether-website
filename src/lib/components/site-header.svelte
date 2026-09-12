<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import Button from './button.svelte';
  import ThemeToggle from './theme-toggle.svelte';
  import { cn } from '$utils/cn';
  import { locales, localeAbbreviations, isLocale, localeDirections } from '$lib/i18n/config';
  import type { Locale } from '$lib/i18n/config';

  interface NavigationItem {
    label: string;
    href: string;
  }

  interface Props {
    locale: Locale;
    navigation: NavigationItem[];
    collaborateLabel: string;
    studioLabel?: string;
    logoAlt: string;
    languageLabel: string;
    homeLabel: string;
    menuLabel: string;
  }

  let {
    locale,
    navigation,
    collaborateLabel,
    studioLabel,
    logoAlt,
    languageLabel,
    homeLabel,
    menuLabel
  }: Props = $props();

  let open = $state(false);

  $effect(() => {
    document.documentElement.dir = localeDirections[locale];
    document.documentElement.lang = locale;
  });

  let localeLinks = $derived.by(() => {
    const url = $page.url;
    // Assume route is /[locale]/...
    // We want to replace the first segment
    const segments = url.pathname.split('/').filter(Boolean);
    const rest = segments.slice(1); // skip locale
    const basePath = rest.length ? `/${rest.join('/')}` : '';
    const search = url.search;

    return locales.map((loc) => ({
      locale: loc,
      href: `/${loc}${basePath}${search}`,
      active: loc === locale,
      label: localeAbbreviations[loc]
    }));
  });

  function handleLocaleChange(value: string, closeMenu = false) {
    if (!isLocale(value)) return;
    if (closeMenu) open = false;
    
    // Find href
    const target = localeLinks.find(l => l.locale === value);
    if (target && !target.active) {
       document.cookie = `NEXT_LOCALE=${value}; path=/;`; // Keep cookie for persistence if needed
       goto(target.href);
    }
  }

  function scrollToContact() {
    open = false;
    const contact = document.querySelector("#contact");
    contact?.scrollIntoView({ behavior: "smooth" });
  }
</script>

<header class="relative z-50 px-6 pb-3 pt-4 md:sticky md:top-0 md:px-0 md:pb-0 md:pt-0">
  <div class="mx-auto flex max-w-7xl items-center justify-between gap-4 rounded-full border border-black/5 bg-surface px-5 py-3 shadow-retro-sm transition-all md:px-6 md:py-4 md:bg-surface/70">
    <a
      href={`/${locale}`}
      aria-label={homeLabel}
      class="flex items-center"
    >
      <img
        src="https://img.ether.paris/ether-website/assets/ether.png?width=1000"
        alt={logoAlt}
        width={50}
        height={50}
        class="ml-4 rounded-full bg-white p-0.5 shadow-sm"
      />
    </a>

    <nav class="hidden items-center gap-8 md:flex">
      {#each navigation as item}
        <a
          href={item.href}
          class="text-xs uppercase tracking-[0.3em] text-muted-foreground transition hover:text-foreground"
        >
          {item.label}
        </a>
      {/each}
    </nav>

    <div class="hidden items-center gap-3 md:flex">
      <ThemeToggle />
      <div class="relative inline-flex items-center text-xs">
        <label for="desktop-language" class="sr-only">
          {languageLabel}
        </label>
        <select
          id="desktop-language"
          value={locale}
          onchange={(e) => handleLocaleChange(e.currentTarget.value)}
          class="cursor-pointer appearance-none rounded-full border border-black/10 bg-surface/80 pl-3.5 pr-7 py-2 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground transition hover:border-black/20 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-brand rtl:pl-7 rtl:pr-3.5"
        >
          {#each localeLinks as item}
            <option value={item.locale} class="bg-surface text-foreground font-normal normal-case tracking-normal">
              {item.label}
            </option>
          {/each}
        </select>
        <svg
          class="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground rtl:right-auto rtl:left-2.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
        </svg>
      </div>
      <a
        href="/login"
        class="whitespace-nowrap inline-flex items-center justify-center rounded-full border border-black/10 bg-surface/80 px-4 py-2 text-xs font-medium uppercase tracking-[0.2em] text-foreground transition hover:border-brand hover:bg-brand hover:text-white"
      >
        {studioLabel || "Studio"}
      </a>
      <Button
        type="button"
        onclick={scrollToContact}
      >
        {collaborateLabel}
      </Button>
    </div>

    <button
      type="button"
      aria-expanded={open}
      aria-controls="mobile-menu"
      onclick={() => open = !open}
      class="focus-ring inline-flex h-10 w-10 items-center justify-center rounded-full border border-black/10 bg-surface md:hidden md:bg-surface/70"
    >
      <span class="sr-only">{menuLabel}</span>
      <div class="grid h-4 w-4 gap-1">
        {#each [0, 1, 2] as line}
          <span
            class={cn(
              "block h-[2px] w-full rounded-full bg-foreground transition-transform duration-200",
              open && line === 0 && "translate-y-[6px] -rotate-45",
              open && line === 1 && "opacity-0",
              open && line === 2 && "-translate-y-[6px] rotate-45"
            )}
          ></span>
        {/each}
      </div>
    </button>
  </div>
  
  <div
    id="mobile-menu"
    class={cn(
      "absolute left-6 right-6 top-full z-10 pt-4 transition-all duration-200 md:hidden md:left-0 md:right-0",
      open
        ? "pointer-events-auto opacity-100 translate-y-0"
        : "pointer-events-none -translate-y-3 opacity-0"
    )}
  >
    <nav class="space-y-3 rounded-3xl border border-black/5 bg-surface p-6 shadow-retro-sm md:bg-surface/80 md:backdrop-blur-md">
      <div class="flex items-center justify-between pb-2 border-b border-black/5">
        <span class="text-xs uppercase tracking-[0.3em] text-muted-foreground">Mode</span>
        <ThemeToggle />
      </div>
      <div class="space-y-2 text-xs">
        <label
          for="mobile-language"
          class="uppercase tracking-[0.3em] text-muted-foreground"
        >
          {languageLabel}
        </label>
        <div class="relative">
          <select
            id="mobile-language"
            value={locale}
            onchange={(e) => handleLocaleChange(e.currentTarget.value, true)}
            class="w-full appearance-none cursor-pointer rounded-2xl border border-black/10 bg-surface px-4 py-2.5 pr-10 uppercase tracking-[0.3em] text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand rtl:pr-4 rtl:pl-10"
          >
            {#each localeLinks as item}
              <option value={item.locale} class="bg-surface text-foreground font-normal normal-case tracking-normal">
                {item.label}
              </option>
            {/each}
          </select>
          <svg
            class="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground rtl:right-auto rtl:left-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>
      {#each navigation as item}
        <a
          href={item.href}
          onclick={() => open = false}
          class="block rounded-2xl bg-surface px-5 py-3 text-sm uppercase tracking-[0.3em] text-muted-foreground transition hover:bg-surface hover:text-foreground md:bg-surface/60"
        >
          {item.label}
        </a>
      {/each}
      <a
        href="/login"
        onclick={() => open = false}
        class="block rounded-2xl border border-black/10 bg-surface px-5 py-3 text-center text-sm font-medium uppercase tracking-[0.2em] text-foreground transition hover:border-brand hover:bg-brand hover:text-white"
      >
        {studioLabel || "Studio"}
      </a>
      <Button
        type="button"
        size="lg"
        class="w-full"
        onclick={scrollToContact}
      >
        {collaborateLabel}
      </Button>
    </nav>
  </div>
</header>
