import type { Metadata, Viewport } from 'next';
import './globals.css';
import { display, mono, neue } from '@/styles/fonts';
import { siteConfig } from '@/lib/utils/site-config';

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: `${siteConfig.name} · ${siteConfig.motto}`,
    template: `%s · ${siteConfig.name}`
  },
  description: siteConfig.description,
  keywords: [
    'Ether',
    'Creative studio',
    'Design agency',
    'Product design',
    'Brand strategy',
    'Digital experiences'
  ],
  authors: [{ name: 'Ether Studio' }],
  openGraph: {
    title: `${siteConfig.name} · ${siteConfig.motto}`,
    description: siteConfig.description,
    url: siteConfig.url,
    siteName: siteConfig.name,
    images: [
      {
        url: siteConfig.ogImage,
        width: 1600,
        height: 900,
        alt: `${siteConfig.name} hero artwork`
      }
    ],
    locale: siteConfig.locale,
    type: 'website'
  },
  twitter: {
    card: 'summary_large_image',
    title: `${siteConfig.name} · ${siteConfig.motto}`,
    description: siteConfig.description,
    images: [siteConfig.ogImage]
  }
};

export const viewport: Viewport = {
  themeColor: '#F5F0E6'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${neue.variable} ${display.variable} ${mono.variable}`}>
      <body className="grain-overlay antialiased">
        {children}
      </body>
    </html>
  );
}
