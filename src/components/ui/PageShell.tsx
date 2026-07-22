'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowLeft, Circuitry } from '@phosphor-icons/react';

interface PageShellProps {
  title: string;
  subtitle?: string;
  backHref?: string;
  backLabel?: string;
  maxWidth?: string;
  children: React.ReactNode;
}

const ROUTE_CODES: Record<string, string> = {
  '/app/inventory': 'BAY-02 / COMPONENT CONTROL',
  '/app/market': 'EX-04 / PEER LIQUIDITY',
  '/app/vault': 'CORE-05 / RESERVE TELEMETRY',
  '/app/ops': 'FAB-03 / LINE DIAGNOSTICS',
  '/app/tokenomics': 'NET-06 / EMISSION LOGIC',
  '/app/leaderboard': 'RACE-07 / NETWORK RANK',
  '/app/profile': 'ID-08 / OPERATOR RECORD',
  '/app/docs': 'MAN-09 / FIELD PROCEDURES',
};

export default function PageShell({ title, subtitle, backHref, backLabel, maxWidth = 'max-w-[1480px]', children }: PageShellProps) {
  const pathname = usePathname();
  const routeCode = ROUTE_CODES[pathname] ?? 'GPU / FAB MODULE';

  return (
    <main className={`gpu-page mx-auto w-full ${maxWidth}`}>
      <header className="gpu-page-header">
        <div className="relative z-10 min-w-0">
          {backHref && (
            <Link href={backHref} className="mb-4 inline-flex items-center gap-2 font-mono text-[9px] uppercase tracking-[.2em] text-sky-200/55 transition hover:text-lime-300">
              <ArrowLeft size={13} /> {backLabel?.replace('← ', '') ?? 'Fab floor'}
            </Link>
          )}
          <div className="flex items-center gap-2 font-mono text-[9px] font-semibold uppercase tracking-[.25em] text-lime-300">
            <Circuitry size={14} weight="duotone" /> {routeCode}
          </div>
          <h1 className="mt-3 max-w-4xl text-[clamp(2rem,5vw,4.25rem)] font-semibold leading-[.92] tracking-[-.055em] text-white">{title}</h1>
          {subtitle && <p className="mt-4 max-w-2xl text-sm leading-6 text-sky-100/58 md:text-[15px]">{subtitle}</p>}
        </div>
        <div className="gpu-page-wafer" aria-hidden>
          <span className="gpu-page-wafer-core" />
          <span className="gpu-page-wafer-trace trace-a" />
          <span className="gpu-page-wafer-trace trace-b" />
        </div>
      </header>
      <div className="gpu-page-content">{children}</div>
    </main>
  );
}
