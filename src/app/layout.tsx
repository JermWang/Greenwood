import type { Metadata, Viewport } from 'next';
import { JetBrains_Mono, Space_Grotesk } from 'next/font/google';
import './globals.css';
import PrivyAppProvider from '@/components/providers/PrivyAppProvider';

const displayFont = Space_Grotesk({ subsets: ['latin'], variable: '--font-display', display: 'swap' });
const monoFont = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' });

// Placeholder marketing domain — swap for the project's real domain before launch.
const SITE_URL = 'https://greenwood.fun';
const DESCRIPTION =
  'Open equity and treasury desks, upgrade your portfolio, unlock allocations, and earn BNTY yield from tokenized real-world assets on Robinhood Chain.';

export const metadata: Metadata = {
  // metadataBase resolves relative asset paths to absolute URLs, which Open
  // Graph and Twitter both require. Set to the live domain so previews point at
  // production, not the Railway subdomain.
  //
  // No `images` yet: the share card art is being commissioned. A card with no
  // image still renders as a title/description summary, which beats shipping
  // artwork from the previous theme.
  metadataBase: new URL(SITE_URL),
  title: 'Greenwood — Real-World Yield',
  description: DESCRIPTION,
  icons: { icon: '/gpu-mark.svg' },
  openGraph: {
    type: 'website',
    url: SITE_URL,
    siteName: 'Greenwood — Real-World Yield',
    title: 'Greenwood — Real-World Yield',
    description: DESCRIPTION,
  },
  twitter: {
    card: 'summary',
    site: '@greenwood_rwa',
    creator: '@greenwood_rwa',
    title: 'Greenwood — Real-World Yield',
    description: DESCRIPTION,
  },
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
