type NavigationItem = {
  label: string;
  href: string;
};

type SiteFooterProps = {
  siteName: string;
  motto: string;
  description: string;
  navigation: NavigationItem[];
  socials: NavigationItem[];
  exploreLabel: string;
  socialLabel: string;
  rights: string;
  studiosLine: string;
};

export function SiteFooter({
  siteName,
  motto,
  description,
  navigation,
  socials,
  exploreLabel,
  socialLabel,
  rights,
  studiosLine,
}: SiteFooterProps) {
  return (
    <footer className="mt-24 border-t border-black/10 bg-surface/70">
      <div className="container flex flex-col gap-12 py-12 md:flex-row md:items-start md:justify-between">
        <div className="max-w-sm space-y-3">
          <p className="font-display text-2xl leading-tight">
            {siteName} · <span className="text-accent">{motto}</span>
          </p>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="grid gap-8 text-sm uppercase tracking-[0.3em] md:grid-cols-2">
          <div>
            <p className="mb-3 text-muted-foreground text-black">
              {exploreLabel}
            </p>
            <ul className="space-y-2 text-muted-foreground">
              {navigation.map((item) => (
                <li key={item.href}>
                  <a href={item.href} className="hover:text-foreground">
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-3 text-muted-foreground font-black">
              {socialLabel}
            </p>
            <ul className="space-y-2 text-muted-foreground">
              {socials.map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    className="hover:text-foreground"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      <div className="border-t border-black/10 bg-surface/80 py-6">
        <div className="container flex flex-col justify-between gap-4 text-xs text-muted-foreground md:flex-row">
          <span>{rights}</span>
          <span>{studiosLine}</span>
        </div>
      </div>
    </footer>
  );
}
