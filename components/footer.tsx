import Link from 'next/link';
import { siteConfig } from '@/lib/utils/site-config';

const year = new Date().getFullYear();

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-black/10 bg-surface/70">
      <div className="container flex flex-col gap-12 py-12 md:flex-row md:items-start md:justify-between">
        <div className="max-w-sm space-y-3">
          <p className="font-display text-2xl leading-tight">
            {siteConfig.name} · <span className="text-accent">{siteConfig.motto}</span>
          </p>
          <p className="text-sm text-muted-foreground">
            Nous façonnons des expériences digitales sensibles pour les créateurs et institutions culturelles.
          </p>
        </div>
        <div className="grid gap-8 text-sm uppercase tracking-[0.3em] md:grid-cols-2">
          <div>
            <p className="mb-3 text-muted-foreground">Explorer</p>
            <ul className="space-y-2 text-muted-foreground">
              {siteConfig.navigation.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="hover:text-foreground">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-3 text-muted-foreground">Social</p>
            <ul className="space-y-2 text-muted-foreground">
              {siteConfig.socials.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="hover:text-foreground" target="_blank" rel="noreferrer">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      <div className="border-t border-black/10 bg-surface/80 py-6">
        <div className="container flex flex-col justify-between gap-4 text-xs text-muted-foreground md:flex-row">
          <span>© {year} {siteConfig.name}. Tous droits réservés.</span>
          <span>Studio basé à Paris · Montréal · Dakar</span>
        </div>
      </div>
    </footer>
  );
}
