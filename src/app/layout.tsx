import type { Metadata, Viewport } from 'next';
import { JetBrains_Mono, Space_Grotesk } from 'next/font/google';
import './globals.css';
import PrivyAppProvider from '@/components/providers/PrivyAppProvider';
import CinematicBackdrop from '@/components/ui/CinematicBackdrop';

const displayFont = Space_Grotesk({ subsets: ['latin'], variable: '--font-display', display: 'swap' });
const monoFont = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' });

const SITE_URL = 'https://playgpu.fun';
const DESCRIPTION =
  'Build wafer fabs and cleanrooms, upgrade silicon equipment, open supply pods, and farm GPU on Robinhood Chain.';

export const metadata: Metadata = {
  // metadataBase resolves the relative asset paths below to absolute URLs, which
  // Open Graph and Twitter both require — without it a shared link renders no
  // card. Set to the live domain so the preview points at production, not the
  // Railway subdomain.
  metadataBase: new URL(SITE_URL),
  title: 'GPU — Graphics Processing Utility',
  description: DESCRIPTION,
  icons: { icon: '/gpu-mark.svg' },
  openGraph: {
    type: 'website',
    url: SITE_URL,
    siteName: 'GPU — Graphics Processing Utility',
    title: 'GPU — Graphics Processing Utility',
    description: DESCRIPTION,
    images: [{ url: '/social/BANNER.png', width: 1500, height: 500, alt: 'GPU — Graphics Processing Utility' }],
  },
  twitter: {
    card: 'summary_large_image',
    site: '@PlayGPU_RH',
    creator: '@PlayGPU_RH',
    title: 'GPU — Graphics Processing Utility',
    description: DESCRIPTION,
    images: ['/social/BANNER.png'],
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
        <PrivyAppProvider>
          <CinematicBackdrop />
          {children}
        </PrivyAppProvider>
      </body>
    </html>
  );
}
