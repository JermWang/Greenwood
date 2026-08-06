'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Cpu, Lightning, Radio } from '@phosphor-icons/react';
import WalletButton from '@/components/ui/WalletButton';
import { DemoBanner, DemoButton } from '@/components/ui/DemoButton';
import IntroGuide from '@/components/ui/IntroGuide';
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

function BntyBalanceModule() {
  const bntyBalance = useEvmWallet((state) => state.bntyBalance);
  const symbol = useEvmWallet((state) => state.bntySymbol);
  return (
    <div className="gw-balance-module">
      <span className="gw-balance-glyph"><Lightning size={14} weight="fill" /></span>
      <span className="hidden sm:block">
        <span className="block font-mono text-[8px] uppercase tracking-[.18em] text-emerald-100/45">Bounty reserve</span>
        <span className="mt-0.5 block font-mono text-[12px] font-bold text-white">
          {TOKEN_LIVE && bntyBalance != null ? Number(bntyBalance).toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—'}{' '}
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
    <div className="gw-os min-h-screen">
      <DeployNotice />
      <div className="gw-stage">
        <header className="gw-topbar">
          <Link href="/" className="flex items-center gap-2 lg:hidden" aria-label="Greenwood home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/gw-mark.svg" alt="" className="h-8 w-8 rounded-[10px]" />
            {/* The wordmark goes below 640px and the mark stays. The bar has
                room for exactly one more thing at that width, and the guide is
                that thing — the mark alone already says where you are. */}
            <span className="gw-topbar-wordmark font-mono text-sm font-bold tracking-[.24em] text-white">Greenwood</span>
          </Link>
          <div className="hidden min-w-0 items-center gap-3 lg:flex">
            <span className="gw-route-chip"><Cpu size={15} weight="duotone" /> {routeTitle(pathname)}</span>
            <span className="h-4 w-px bg-white/10" />
            <span className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[.18em] text-emerald-100/45">
              <Radio size={13} className="text-lime-300" /> {CHAIN.name} · {CHAIN.id}
            </span>
          </div>
          {/* The introduction, wherever the player is. A fund now starts
              outside on the Grounds rather than on this dashboard, so the guide
              has to travel — see the header of IntroGuide. It renders nothing
              at all once the introduction is finished. */}
          <IntroGuide />
          <div className="ml-auto flex items-center gap-2">
            {/* Beside Connect, not on a landing page of its own. The thing
                standing between a curious person and this game IS the connect
                step, so the alternative belongs in the same place. */}
            <DemoBanner />
            <BntyBalanceModule />
            <SoundToggle />
            <DemoButton />
            <WalletButton />
          </div>
        </header>
        <div className="gw-stage-content">{children}</div>
        {/* The one menu. Everything else is reached by walking to it. */}
        <MarketHud wallet={wallet} />
      </div>
      <TransactionSafetyModal />
    </div>
  );
}
