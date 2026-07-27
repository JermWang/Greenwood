'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Cpu, Lightning, Radio } from '@phosphor-icons/react';
import WalletButton from '@/components/ui/WalletButton';
import MarketHud from '@/components/ui/MarketHud';
import { useOperation } from '@/lib/useOperation';
import DeployNotice from '@/components/ui/DeployNotice';
import SoundToggle from '@/components/ui/SoundToggle';
import TransactionSafetyModal from '@/components/ui/TransactionSafetyModal';
import { useEvmWallet } from '@/lib/evm';
import { CHAIN, TOKEN_LIVE } from '@/lib/config';

const ROUTE_TITLES: Record<string, string> = {
  '/app': 'Fund Overview',
  '/app/trading-floor': 'Trading Floor',
  '/app/floor': 'Machine Room',
  '/app/inventory': 'Instruments',
  '/app/ops': 'Analytics',
  '/app/market': 'Exchange',
  '/app/vault': 'The Vault',
  '/app/tokenomics': 'BNTY Model',
  '/app/leaderboard': 'Leaderboard',
  '/app/profile': 'Fund Profile',
  '/app/docs': 'Handbook',
};

function routeTitle(pathname: string) {
  const exact = ROUTE_TITLES[pathname];
  if (exact) return exact;
  return Object.entries(ROUTE_TITLES).find(([path]) => path !== '/app' && pathname.startsWith(path))?.[1] ?? 'Greenwood';
}

function GpuBalanceModule() {
  const osrBalance = useEvmWallet((state) => state.osrBalance);
  const symbol = useEvmWallet((state) => state.osrSymbol);
  return (
    <div className="fab-balance-module">
      <span className="fab-balance-glyph"><Lightning size={14} weight="fill" /></span>
      <span className="hidden sm:block">
        <span className="block font-mono text-[8px] uppercase tracking-[.18em] text-emerald-100/45">Bounty reserve</span>
        <span className="mt-0.5 block font-mono text-[12px] font-bold text-white">
          {TOKEN_LIVE && osrBalance != null ? Number(osrBalance).toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—'}{' '}
          <span className="text-lime-300">{TOKEN_LIVE ? symbol : 'BNTY'}</span>
        </span>
      </span>
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const wallet = useOperation((s) => s.wallet);
  return (
    <div className="gpu-os min-h-screen">
      <DeployNotice />
      <div className="gpu-stage">
        <header className="fab-topbar">
          <Link href="/" className="flex items-center gap-2 lg:hidden" aria-label="Greenwood home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/gpu-mark.svg" alt="" className="h-8 w-8 rounded-[10px]" />
            <span className="font-mono text-sm font-bold tracking-[.24em] text-white">Greenwood</span>
          </Link>
          <div className="hidden min-w-0 items-center gap-3 lg:flex">
            <span className="fab-route-chip"><Cpu size={15} weight="duotone" /> {routeTitle(pathname)}</span>
            <span className="h-4 w-px bg-white/10" />
            <span className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[.18em] text-emerald-100/45">
              <Radio size={13} className="text-lime-300" /> {CHAIN.name} · {CHAIN.id}
            </span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <GpuBalanceModule />
            <SoundToggle />
            <WalletButton />
          </div>
        </header>
        <div className="gpu-stage-content">{children}</div>
        {/* The one menu. Everything else is reached by walking to it. */}
        <MarketHud wallet={wallet} />
      </div>
      <TransactionSafetyModal />
    </div>
  );
}
