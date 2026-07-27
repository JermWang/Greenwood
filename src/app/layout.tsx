import type { Metadata, Viewport } from 'next';
import { JetBrains_Mono, Space_Grotesk } from 'next/font/google';
import './globals.css';
import PrivyAppProvider from '@/components/providers/PrivyAppProvider';

const displayFont = Space_Grotesk({ subsets: ['latin'], variable: '--font-display', display: 'swap' });
const monoFont = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' });

/**
 * Where this deployment actually lives.
 *
 * metadataBase resolves relative asset paths to absolute URLs, which Open Graph
 * and Twitter both require — so if it points at a domain that is not serving
 * this build, every share card asks for its image from a host that does not have
 * it. That is precisely what a hardcoded marketing domain does before the domain
 * is pointed anywhere: the metadata reads correctly and the image 404s.
 *
 * So it is a variable, with Railway's own generated domain as the automatic
 * fallback. Cards work on the deploy that exists today, and pointing them at the
 * marketing domain later is one environment variable rather than a code change.
 */
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : null) ??
  'https://greenwood.fun';

/**
 * The share copy, and the line it deliberately walks.
 *
 * A share card is the FIRST thing anybody sees, and for most people it is the
 * only thing — so it has to sell the game that is actually on the tin (an idle
 * DeFi yield game) without lying, and without giving away the turn.
 *
 * The rule from docs/greenwood-turn.md holds here more than anywhere: the reveal
 * is environmental, it lands between levels three and ten, and it is worthless
 * the moment a player arrives already knowing. So nothing here says zombie,
 * survival, apocalypse, or horror. Not one word.
 *
 * What it DOES do is refuse to be entirely reassuring. "One of the last lit
 * settlements" reads as branding on a first pass and as a fact on a second.
 * "The desks run day and night. Something has to keep the lights on." is a
 * yield-farming boast that is also, literally, the plot. Anyone who plays and
 * comes back to re-read this should find the answer was sitting here the whole
 * time — which is the only kind of foreshadowing worth writing.
 *
 * If you are tempted to add "…but not everything out there is friendly", don't.
 * That is the sentence that turns a hint into a spoiler.
 */
const DESCRIPTION =
  'An idle yield game on Robinhood Chain. Open desks, fit instruments, compound BNTY, ' +
  'and take what you earn out past the fence. The desks run day and night — something has ' +
  'to keep the lights on.';

/** Shorter, for cards that truncate. Carries the same double meaning. */
const TAGLINE = 'One of the last lit settlements. Yield never sleeps.';

export const metadata: Metadata = {
  // metadataBase resolves relative asset paths to absolute URLs, which Open
  // Graph and Twitter both require. Set to the live domain so previews point at
  // production, not the Railway subdomain.
  //
  // No `images` yet: the share card art is being commissioned. A card with no
  // image still renders as a title/description summary, which beats shipping
  // artwork from the previous theme.
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Greenwood — Real-World Yield',
    // Sub-pages get "Trading Floor — Greenwood" rather than repeating the
    // tagline, so a shared deep link says which room it is.
    template: '%s — Greenwood',
  },
  description: DESCRIPTION,
  applicationName: 'Greenwood',
  keywords: ['Greenwood', 'BNTY', 'Robinhood Chain', 'idle game', 'yield', 'RWA', 'DeFi'],
  icons: { icon: '/gpu-mark.svg', apple: '/gpu-mark.svg' },
  openGraph: {
    type: 'website',
    url: SITE_URL,
    siteName: 'Greenwood',
    title: `Greenwood — ${TAGLINE}`,
    description: DESCRIPTION,
    locale: 'en_GB',
    // No `images` here on purpose: src/app/opengraph-image.tsx supplies it, and
    // listing one as well would override the generated PNG with whatever is
    // named here. X, Facebook and LinkedIn all reject SVG, so the generated
    // raster is the only version that actually renders where it matters.
  },
  twitter: {
    // summary_large_image now that there is art to put in it. A large card is
    // roughly twice the click-through of a summary and this game is entirely
    // carried by how it looks.
    card: 'summary_large_image',
    site: '@greenwood_rwa',
    creator: '@greenwood_rwa',
    title: `Greenwood — ${TAGLINE}`,
    description: DESCRIPTION,
    // Also omitted: the generated opengraph-image is picked up for both.
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0b1511',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${displayFont.variable} ${monoFont.variable}`}>
        <PrivyAppProvider>{children}</PrivyAppProvider>
      </body>
    </html>
  );
}
