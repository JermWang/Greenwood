import type { Metadata, Viewport } from 'next';
import { JetBrains_Mono, Space_Grotesk } from 'next/font/google';
import { X_HANDLE } from '@/lib/config';
import './globals.css';

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
  'https://playevergreen.xyz';

/**
 * The share copy, and the line it deliberately walks.
 *
 * A share card is the FIRST thing anybody sees, and for most people it is the
 * only thing — so it has to sell the game that is actually on the tin (an idle
 * DeFi yield game) without lying, and without giving away the turn.
 *
 * The rule from docs/evergreen-turn.md holds here more than anywhere: the reveal
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
  'An idle yield game on Robinhood Chain. Open desks, fit instruments, compound GREEN, ' +
  'and take what you earn out past the fence. The desks run day and night — something has ' +
  'to keep the lights on.';

/** Shorter, for cards that truncate. Carries the same double meaning. */
const TAGLINE = 'One of the last lit settlements. Yield never sleeps.';

/**
 * The share card: a real render of the settlement, from the brand kit.
 *
 * This replaced a card drawn at request time by satori (the old
 * app/opengraph-image.tsx). That existed because there was no artwork, and it
 * was a reasonable stand-in — but satori is not a browser, it paints rectangles
 * and text, and the game's own look does not survive being approximated in
 * flexbox. An actual screenshot of the world does the selling.
 *
 * Declared explicitly rather than through the app/opengraph-image file
 * convention, so the one copy that ships lives in the brand kit alongside the
 * other launch assets rather than being duplicated into src/.
 *
 * Width and height are stated because X and Facebook both use them to reserve
 * layout space before the image has downloaded — omit them and the card can be
 * rendered as a small summary while the fetch is still in flight.
 */
const SHARE_CARD = {
  url: '/og-card.png',
  width: 1200,
  height: 630,
  alt: 'Evergreen — one of the last lit settlements. Yield never sleeps.',
} as const;

export const metadata: Metadata = {
  // metadataBase resolves relative asset paths to absolute URLs, which Open
  // Graph and Twitter both require. Set to the live domain so previews point at
  // production, not the Railway subdomain.
  //
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Evergreen — Real-World Yield',
    // Sub-pages get "Trading Floor — Evergreen" rather than repeating the
    // tagline, so a shared deep link says which room it is.
    template: '%s — Evergreen',
  },
  description: DESCRIPTION,
  applicationName: 'Evergreen',
  keywords: ['Evergreen', 'GREEN', 'Robinhood Chain', 'idle game', 'yield', 'RWA', 'DeFi'],
  /**
   * Canonical, so the same game shared from two hosts is one page.
   *
   * The app answers on playgreenwood.xyz AND on Railway's generated subdomain,
   * and links to both are already in the wild. Without this they are two URLs
   * with identical content competing with each other, and share counts and
   * search ranking split between them.
   */
  alternates: { canonical: SITE_URL },
  /**
   * Icons are the GENERATED routes, not the SVG.
   *
   * `apple: '/eg-mark.svg'` was silently doing nothing: iOS ignores SVG for
   * touch icons and screenshots the page instead, so adding the game to a home
   * screen produced a tile showing a shrunken screengrab. See app/apple-icon.
   * The SVG stays declared as well — browsers that take it get the sharper
   * asset, and Next serves the raster to everything that does not.
   */
  icons: {
    icon: [
      { url: '/icon', type: 'image/png', sizes: '180x180' },
      { url: '/eg-mark.svg', type: 'image/svg+xml' },
    ],
    apple: [{ url: '/apple-icon', type: 'image/png', sizes: '180x180' }],
  },
  manifest: '/manifest.webmanifest',
  /**
   * Stop iOS turning numbers into phone links.
   *
   * Safari autolinks anything that reads like a telephone number, and this
   * screen is wall-to-wall figures — balances, rates, level counts, countdowns.
   * They render blue and underlined, and tapping one offers to place a call.
   */
  formatDetection: { telephone: false, address: false, email: false },
  /** Launched from an iOS home screen: full viewport, no browser chrome. */
  appleWebApp: {
    capable: true,
    title: 'Evergreen',
    // The status bar sits ON the page, so the page has to own that strip. See
    // viewportFit: 'cover' below and the safe-area insets in globals.css.
    statusBarStyle: 'black-translucent',
  },
  openGraph: {
    type: 'website',
    url: SITE_URL,
    siteName: 'Evergreen',
    title: `Evergreen — ${TAGLINE}`,
    description: DESCRIPTION,
    locale: 'en_GB',
    images: [SHARE_CARD],
  },
  twitter: {
    // summary_large_image now that there is art to put in it. A large card is
    // roughly twice the click-through of a summary and this game is entirely
    // carried by how it looks.
    card: 'summary_large_image',
    // From X_URL, so the link in the footer and the account the share card
    // credits cannot name two different places.
    site: X_HANDLE,
    creator: X_HANDLE,
    title: `Evergreen — ${TAGLINE}`,
    description: DESCRIPTION,
    images: [SHARE_CARD],
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  /**
   * The page's own background, --robin-black.
   *
   * It was #0b1511 — a different, greener black that appears nowhere in the
   * palette. On Android the browser chrome is painted this colour and sits
   * directly above the page, so the seam between them was visible on every
   * phone and on no desktop, which is why it survived.
   */
  themeColor: '#17160f',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${displayFont.variable} ${monoFont.variable}`}>{children}</body>
    </html>
  );
}
