'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Cpu, Lightning, Radio } from '@phosphor-icons/react';
import WalletButton from '@/components/ui/WalletButton';
import { DemoBanner, DemoButton } from '@/components/ui/DemoButton';
import IntroGuide from '@/components/ui/IntroGuide';
import ChatDock from '@/components/ui/ChatDock';
import { MARK_SRC } from '@/lib/brand-assets';
import HudDock from '@/components/ui/HudDock';
import { useOperation } from '@/lib/useOperation';
import DeployNotice from '@/components/ui/DeployNotice';
import SoundToggle from '@/components/ui/SoundToggle';
import TransactionSafetyModal from '@/components/ui/TransactionSafetyModal';
import { useEvmWallet } from '@/lib/evm';
import { CHAIN, TOKEN_LIVE } from '@/lib/config';
import { REGIONS } from '@/lib/regions';

/*
 * `/app` is deliberately absent: it is a door, not a room (see app/app/page), so
 * routeTitle falls through to "Evergreen" there. It read "Fund Overview" back
 * when the dashboard was an overview, and a chip naming a screen that no longer
 * exists is worse than no chip at all.
 */
const ROUTE_TITLES: Record<string, string> = {
  /*
   * Every PLACE, taken from the region table rather than written out again.
   *
   * The Grounds, the Treeline, HQ and the Deep Forest were missing, so the one
   * chip that says where you are said "Evergreen" in exactly the regions where
   * knowing which one you are standing in matters most. Sourced from REGIONS so
   * a region cannot be added without its name reaching the bar — the copy that
   * was duplicated here for the rooms is the copy that went stale for the rest.
   */
  ...Object.fromEntries(REGIONS.map((region) => [region.href, region.name])),
  '/app/inventory': 'Instruments',
  '/app/ops': 'Analytics',
  '/app/market': 'Exchange',
  '/app/vault': 'The Vault',
  '/app/tokenomics': 'GREEN Model',
  '/app/leaderboard': 'Leaderboard',
  '/app/profile': 'Fund Profile',
  '/app/docs': 'Handbook',
};

function routeTitle(pathname: string) {
  const exact = ROUTE_TITLES[pathname];
  if (exact) return exact;
  return Object.entries(ROUTE_TITLES).find(([path]) => pathname.startsWith(path))?.[1] ?? 'Evergreen';
}

function GreenBalanceModule() {
  const greenBalance = useEvmWallet((state) => state.greenBalance);
  const symbol = useEvmWallet((state) => state.greenSymbol);
  return (
    <div className="eg-balance-module">
      <span className="eg-balance-glyph"><Lightning size={14} weight="fill" /></span>
      <span className="hidden sm:block">
        <span className="block font-mono text-[8px] uppercase tracking-[.18em] text-emerald-100/45">Green reserve</span>
        <span className="mt-0.5 block font-mono text-[12px] font-bold text-white">
          {TOKEN_LIVE && greenBalance != null ? Number(greenBalance).toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—'}{' '}
          <span className="text-lime-300">{TOKEN_LIVE ? symbol : 'GREEN'}</span>
        </span>
      </span>
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const wallet = useOperation((s) => s.wallet);
  /** Whether this pathname is a place in the world rather than a flat page. */
  const inRegion = REGIONS.some((region) => region.href === pathname);
  return (
    <div className="eg-os min-h-screen">
      <DeployNotice />
      <div className="eg-stage">
        <header className="eg-topbar">
          <Link href="/" className="flex items-center gap-2 lg:hidden" aria-label="Evergreen home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={MARK_SRC} alt="" className="h-8 w-8 rounded-[10px]" />
            {/* The wordmark goes below 640px and the mark stays. The bar has
                room for exactly one more thing at that width, and the guide is
                that thing — the mark alone already says where you are. */}
            <span className="eg-topbar-wordmark font-mono text-sm font-bold tracking-[.24em] text-white">Evergreen</span>
          </Link>
          <div className="hidden min-w-0 items-center gap-3 lg:flex">
            <span className="eg-route-chip"><Cpu size={15} weight="duotone" /> {routeTitle(pathname)}</span>
            <span className="h-4 w-px bg-white/10" />
            <span className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[.18em] text-emerald-100/45">
              <Radio size={13} className="text-lime-300" /> {CHAIN.name} · {CHAIN.id}
            </span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {/* Beside Connect, not on a landing page of its own. The thing
                standing between a curious person and this game IS the connect
                step, so the alternative belongs in the same place. */}
            <DemoBanner />
            <GreenBalanceModule />
            <SoundToggle />
            <DemoButton />
            <WalletButton />
          </div>
        </header>
        <div className="eg-stage-content">{children}</div>
        {/*
          The introduction, wherever the player is, and NOT IN THIS BAR.

          It lived in the top bar so that it would travel — a fund starts
          outside on the Grounds, so a guide pinned to one screen is a guide
          the player has to already know how to find. That reasoning still
          holds and this still travels; what was wrong was the CONTROL. The
          only way to collapse the panel was a chip sitting in the global nav
          bar, among the wallet, the balance and the sound toggle, which reads
          as another piece of chrome rather than as the handle on the panel
          hanging under it. It anchors itself now — see .eg-guide.
        */}
        <IntroGuide />
        {/*
          World chat, per shard, bottom-left.
          
          Everywhere except the doorway. /app is a figure and a button (see
          app/app/page) and a chat box is the first of the eleven panels coming
          back; the conversation belongs where the people are, which is in the
          regions.
        */}
        {pathname !== '/app' && <ChatDock />}
        {/*
          Market and Items, bottom-right, mirroring the chat.

          IN THE WORLD SCREENS ONLY. The old Exchange HUD was on every page
          under /app including the flat ones, which is part of what made it look
          arbitrary — a floating price panel on top of the full Exchange page is
          a panel arguing with the thing it summarises. HUD furniture belongs on
          the screens that have a HUD, so this is gated on the pathname actually
          being a region.

          Neither panel trades or equips. The Exchange is reached by walking
          into the Trading Floor and up to a stall; instruments are fitted at a
          desk in the Machine Room. See the header in HudDock.
        */}
        {inRegion && <HudDock wallet={wallet} />}
      </div>
      <TransactionSafetyModal />
    </div>
  );
}
