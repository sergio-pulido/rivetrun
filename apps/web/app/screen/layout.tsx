import { Chakra_Petch, IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';
import type { ReactNode } from 'react';

// Fonts of the big-screen design (docs/design/v1): Chakra Petch display, IBM Plex Sans body, IBM Plex Mono data.
const chakra = Chakra_Petch({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-chakra', display: 'swap' });
const plexSans = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-plex-sans', display: 'swap' });
const plexMono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['500', '600'], variable: '--font-plex-mono', display: 'swap' });

export default function ScreenLayout({ children }: { children: ReactNode }) {
  return <div className={`${chakra.variable} ${plexSans.variable} ${plexMono.variable}`}>{children}</div>;
}
