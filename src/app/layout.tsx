import type { Metadata, Viewport } from 'next';
import { JetBrains_Mono, Space_Grotesk } from 'next/font/google';
import './globals.css';
import PrivyAppProvider from '@/components/providers/PrivyAppProvider';
import CinematicBackdrop from '@/components/ui/CinematicBackdrop';

const displayFont = Space_Grotesk({ subsets: ['latin'], variable: '--font-display', display: 'swap' });
const monoFont = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' });

export const metadata: Metadata = {
  title: 'GPU — Graphics Processing Utility',
  description:
    'Build wafer fabs and cleanrooms, upgrade silicon equipment, open supply pods, and farm GPU on Robinhood Chain.',
  icons: { icon: '/gpu-mark.svg' },
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
