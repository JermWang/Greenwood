'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowLeft, Circuitry } from '@phosphor-icons/react';
import AssetMark from '@/components/ui/AssetMark';

interface PageShellProps {
  title: string;
  subtitle?: string;
  backHref?: string;
  backLabel?: string;
  maxWidth?: string;
  children: React.ReactNode;
}

const ROUTE_CODES: Record<string, string> = {
  '/app/inventory': 'BAY-02 / INSTRUMENT CONTROL',
  // No '/app/market' — the Exchange is a table on the Trading Floor now, not a
  // route. See MarketPanel.
  '/app/outfitter': 'FLR-10 / OUTFITTER',
  '/app/stake': 'VLT-05 / FIXED INCOME',
  '/app/vault': 'CORE-06 / RESERVE ANALYTICS',
  '/app/ops': 'FUND-03 / DESK DIAGNOSTICS',
  '/app/tokenomics': 'NET-06 / EMISSION LOGIC',
  '/app/leaderboard': 'RACE-07 / NETWORK RANK',
  '/app/profile': 'ID-08 / FUND RECORD',
  '/app/docs': 'MAN-09 / FIELD PROCEDURES',
};

export default function PageShell({ title, subtitle, backHref, backLabel, maxWidth = 'max-w-[1480px]', children }: PageShellProps) {
  const pathname = usePathname();
  const routeCode = ROUTE_CODES[pathname] ?? 'EVERGREEN / FUND MODULE';

  return (
    <main className={`eg-page mx-auto w-full ${maxWidth}`}>
      <header className="eg-page-header">
        <div className="relative z-10 min-w-0">
          {backHref && (
            <Link href={backHref} className="mb-4 inline-flex items-center gap-2 font-mono text-[9px] uppercase tracking-[.2em] text-emerald-200/55 transition hover:text-lime-300">
              <ArrowLeft size={13} /> {backLabel?.replace('← ', '') ?? 'Trading floor'}
            </Link>
          )}
          <div className="flex items-center gap-2 font-mono text-[9px] font-semibold uppercase tracking-[.25em] text-lime-300">
            <Circuitry size={14} weight="duotone" /> {routeCode}
          </div>
          <h1 className="mt-3 max-w-4xl text-[clamp(2rem,5vw,4.25rem)] font-semibold leading-[.92] tracking-[-.055em] text-white">{title}</h1>
          {subtitle && <p className="mt-4 max-w-2xl text-sm leading-6 text-emerald-100/58 md:text-[15px]">{subtitle}</p>}
        </div>
        {/*
          An actual desk from the game, not an abstraction of one.

          This was an animated bar chart, which had itself replaced a rotating
          radar sweep — both of them motion standing in for a brand, and both CSS
          that could belong to any product with a green accent. The model is the
          same component the Machine Room renders, so it cannot drift from the
          game, and it is the one thing in this header that could not possibly
          belong to anything else. See AssetMark for why it is not a GLB.
        */}
        <AssetMark kind="rack" />
      </header>
      <div className="eg-page-content">{children}</div>
    </main>
  );
}
