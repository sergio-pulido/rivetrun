import type { Metadata, Viewport } from 'next';
import { Chakra_Petch, IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';
import type { ReactNode } from 'react';
import { StoreSync } from '@/ui/StoreSync';
import './globals.css';

// Design v1: Chakra Petch (display), IBM Plex Sans (body), IBM Plex Mono (data).
const chakra = Chakra_Petch({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-chakra', display: 'swap' });
const plexSans = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-plex-sans', display: 'swap' });
const plexMono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['500', '600'], variable: '--font-plex-mono', display: 'swap' });

export const metadata: Metadata = {
  title: 'RivetRun',
  description: 'Build the body. Brief the brain. Watch it drive.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0e1013',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${chakra.variable} ${plexSans.variable} ${plexMono.variable}`}>
      <body className="min-h-dvh bg-ground font-sans text-text antialiased">
        <StoreSync />
        {children}
      </body>
    </html>
  );
}
