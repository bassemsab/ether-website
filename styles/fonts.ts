import { Space_Grotesk, Playfair_Display, IBM_Plex_Mono } from 'next/font/google';

export const neue = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-neue',
  display: 'swap'
});

export const display = Playfair_Display({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--font-display',
  display: 'swap'
});

export const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap'
});
