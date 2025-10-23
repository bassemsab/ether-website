import type { Viewport } from 'next';
import { cookies } from 'next/headers';
import './globals.css';
import { display, mono, neue } from '@/styles/fonts';
import { defaultLocale, isLocale, localeDirections } from '@/lib/i18n/config';

export const viewport: Viewport = {
  themeColor: '#F5F0E6'
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const localeCookie = cookieStore.get('NEXT_LOCALE')?.value;
  const locale = localeCookie && isLocale(localeCookie) ? localeCookie : defaultLocale;
  const dir = localeDirections[locale];

  return (
    <html lang={locale} dir={dir} className={`${neue.variable} ${display.variable} ${mono.variable}`}>
      <body className="grain-overlay antialiased">
        {children}
      </body>
    </html>
  );
}
