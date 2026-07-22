'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  BookOpenText,
  ChartDonut,
  Cube,
  Factory,
  Gauge,
  List,
  Lock,
  Package,
  Pulse,
  Storefront,
  Trophy,
  UserCircle,
  Vault,
  X,
  XLogo,
  type Icon,
} from '@phosphor-icons/react';
import { X_URL } from '@/lib/config';

type NavEntry = { href: string; label: string; short: string; Icon: Icon };

const FAB_LINKS: NavEntry[] = [
  { href: '/app', label: 'Fab Floor', short: 'Floor', Icon: Factory },
  { href: '/app/floor', label: 'Build Floor', short: 'Build', Icon: Cube },
  { href: '/app/inventory', label: 'Parts Bay', short: 'Parts', Icon: Package },
  { href: '/app/ops', label: 'Telemetry', short: 'Data', Icon: Pulse },
];

const NETWORK_LINKS: NavEntry[] = [
  { href: '/app/market', label: 'Chip Exchange', short: 'Market', Icon: Storefront },
  { href: '/app/stake', label: 'Capacity Contracts', short: 'Stake', Icon: Lock },
  { href: '/app/vault', label: 'Treasury Core', short: 'Vault', Icon: Vault },
  { href: '/app/tokenomics', label: 'GPU Model', short: 'Model', Icon: ChartDonut },
  { href: '/app/leaderboard', label: 'Silicon Race', short: 'Ranks', Icon: Trophy },
];

const SYSTEM_LINKS: NavEntry[] = [
  { href: '/app/profile', label: 'Operator ID', short: 'You', Icon: UserCircle },
  { href: '/app/docs', label: 'Fab Manual', short: 'Guide', Icon: BookOpenText },
];

const ALL_LINKS = [...FAB_LINKS, ...NETWORK_LINKS, ...SYSTEM_LINKS];
const MOBILE_LINKS = [FAB_LINKS[0], FAB_LINKS[1], NETWORK_LINKS[0], NETWORK_LINKS[1]];

function isCurrent(pathname: string, href: string) {
  return href === '/app' ? pathname === href : pathname.startsWith(href);
}

function RailGroup({ label, links, pathname }: { label: string; links: NavEntry[]; pathname: string }) {
  return (
    <div className="fab-rail-group">
      <div className="fab-rail-label">{label}</div>
      <div className="space-y-1.5">
        {links.map(({ href, label: itemLabel, Icon }) => {
          const active = isCurrent(pathname, href);
          return (
            <Link key={href} href={href} className={`fab-rail-link ${active ? 'is-active' : ''}`} aria-current={active ? 'page' : undefined}>
              <span className="fab-rail-icon"><Icon size={18} weight={active ? 'fill' : 'duotone'} aria-hidden /></span>
              <span>{itemLabel}</span>
              {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-current shadow-[0_0_12px_currentColor]" />}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export default function NavBar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <aside className="fab-rail hidden lg:flex" aria-label="GPU fab navigation">
        <Link href="/" className="fab-brand-lockup" aria-label="GPU home">
          <span className="fab-brand-mark">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/gpu-mark.svg" alt="" className="h-full w-full" />
          </span>
          <span>
            <span className="block font-mono text-[20px] font-bold tracking-[.28em] text-white">GPU</span>
            <span className="block font-mono text-[8px] uppercase tracking-[.26em] text-sky-200/55">Silicon network</span>
          </span>
        </Link>

        <div className="fab-rail-scroll">
          <RailGroup label="Production" links={FAB_LINKS} pathname={pathname} />
          <RailGroup label="Network" links={NETWORK_LINKS} pathname={pathname} />
          <RailGroup label="System" links={SYSTEM_LINKS} pathname={pathname} />
        </div>

        <div className="fab-rail-footer">
          <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[.18em] text-sky-100/60">
            <Gauge size={15} weight="duotone" className="text-lime-300" />
            Fab link nominal
          </div>
          <div className="mt-3 grid grid-cols-3 gap-1" aria-hidden>
            {[72, 92, 58].map((height, index) => (
              <span key={index} className="flex h-8 items-end overflow-hidden rounded-[5px] bg-white/[.04]">
                <span className="w-full rounded-[5px] bg-gradient-to-t from-blue-500 to-lime-300" style={{ height: `${height}%` }} />
              </span>
            ))}
          </div>
          <a href={X_URL} target="_blank" rel="noreferrer" className="mt-3 flex items-center gap-2 text-[11px] text-sky-100/45 transition hover:text-white">
            <XLogo size={14} weight="fill" /> Network updates
          </a>
        </div>
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-[70] bg-[#030814]/76 backdrop-blur-md lg:hidden" role="presentation" onClick={() => setMobileOpen(false)}>
          <div className="fab-mobile-sheet" role="dialog" aria-modal="true" aria-label="All GPU sections" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[.28em] text-lime-300">GPU operating system</div>
                <div className="mt-1 text-xl font-semibold text-white">Jump to a module</div>
              </div>
              <button className="fab-icon-button" onClick={() => setMobileOpen(false)} aria-label="Close navigation"><X size={18} /></button>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {ALL_LINKS.map(({ href, label, Icon }) => {
                const active = isCurrent(pathname, href);
                return (
                  <Link key={href} href={href} onClick={() => setMobileOpen(false)} className={`fab-mobile-card ${active ? 'is-active' : ''}`}>
                    <Icon size={22} weight={active ? 'fill' : 'duotone'} />
                    <span>{label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <nav className="fab-mobile-dock lg:hidden" aria-label="Mobile GPU navigation">
        {MOBILE_LINKS.map(({ href, short, Icon }) => {
          const active = isCurrent(pathname, href);
          return (
            <Link key={href} href={href} className={`fab-dock-link ${active ? 'is-active' : ''}`} aria-current={active ? 'page' : undefined}>
              <Icon size={19} weight={active ? 'fill' : 'duotone'} />
              <span>{short}</span>
            </Link>
          );
        })}
        <button className={`fab-dock-link ${mobileOpen ? 'is-active' : ''}`} onClick={() => setMobileOpen(true)} aria-label="Open all modules">
          <List size={20} weight="bold" />
          <span>Modules</span>
        </button>
      </nav>
    </>
  );
}
