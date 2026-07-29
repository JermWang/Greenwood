'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { BookOpenText, CaretRight, Flask, Play, XLogo } from '@phosphor-icons/react';
import type { TwinNode } from '@/components/iso/IsoTwin';
import CopyContract from '@/components/ui/CopyContract';
import SoundToggle from '@/components/ui/SoundToggle';
import { X_URL } from '@/lib/config';

const IsoTwin = dynamic(() => import('@/components/iso/IsoTwin'), { ssr: false });

/**
 * A hand-picked fund for the title screen — a mix of both desk types at high
 * level, so the board behind the lockup shows the game at its best rather than
 * an empty floor. Slots are left empty: the title screen is a silhouette, and
 * instrument detail does not read at this scale.
 */
const SHOWROOM_NODES: TwinNode[] = [
  { id: 'showroom-equity-1', type: 'oil', level: 8, isActive: true, components: [] },
  { id: 'showroom-treasury-1', type: 'mine', level: 7, isActive: true, components: [] },
  { id: 'showroom-treasury-2', type: 'mine', level: 5, isActive: true, components: [] },
  { id: 'showroom-equity-2', type: 'oil', level: 4, isActive: true, components: [] },
];

/**
 * The menu, weighted rather than uniform.
 *
 * Three identical bars gave the demo and the handbook the same visual weight as
 * starting the game, which is not how the game is actually shaped: the fund
 * dashboard is the hub, and the floors hang off it. So the primary action is a
 * wide card that names the rooms it opens onto — a bare "Start" tells a new
 * player nothing about what is behind it — and the two supporting entries sit
 * under it as a pair.
 */
const PRIMARY = {
  label: 'Start / continue',
  detail: 'Create a fund, or pick up where you left off',
  href: '/start',
  Icon: Play,
  rooms: ['Dashboard', 'Trading Floor', 'Machine Room'],
} as const;

const SECONDARY = [
  { label: 'Play demo', detail: 'Walk a built floor, no wallet needed', href: '/demo', Icon: Flask },
  { label: 'Handbook', detail: 'Systems, economy and safety', href: '/app/docs', Icon: BookOpenText },
] as const;

/** Flat order for keyboard navigation: primary first, then the pair. */
const MENU = [PRIMARY, ...SECONDARY] as ReadonlyArray<{
  label: string;
  detail: string;
  href: string;
  Icon: typeof Play;
}>;

export default function Landing() {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const choose = useCallback(() => {
    if (!menuOpen) {
      setMenuOpen(true);
      return;
    }
    router.push(MENU[activeIndex].href);
  }, [activeIndex, menuOpen, router]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches('button, a, input, textarea, select')) return;
      if (!menuOpen && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        setMenuOpen(true);
        return;
      }
      if (!menuOpen) return;
      // Left/right are aliases for the same step rather than a second axis: the
      // two supporting entries sit side by side, so reaching for A/D there is
      // the natural thing to do, and a grid-aware cursor would be more state
      // than a three-item menu earns.
      const key = event.key.toLowerCase();
      if (event.key === 'ArrowUp' || event.key === 'ArrowLeft' || key === 'w' || key === 'a') {
        event.preventDefault();
        setActiveIndex((current) => (current - 1 + MENU.length) % MENU.length);
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowRight' || key === 's' || key === 'd') {
        event.preventDefault();
        setActiveIndex((current) => (current + 1) % MENU.length);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        router.push(MENU[activeIndex].href);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        setMenuOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeIndex, menuOpen, router]);

  return (
    <main className="gw-title-screen">
      <div className="gw-title-world">
        <IsoTwin nodes={SHOWROOM_NODES} selectedNodeId={null} ambient />
      </div>
      <div className="gw-title-vignette" />
      <div className="gw-title-scanlines" aria-hidden />

      <header className="gw-title-topbar">
        <Link href="/" className="gw-title-mark" aria-label="Greenwood home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/gw-mark.svg" alt="" />
          <span>Greenwood</span>
        </Link>
        <div className="gw-title-top-actions">
          {/* Renders nothing until the token address is configured, so it simply
              appears in the top bar the moment the CA goes live. */}
          <CopyContract />
          <a href={X_URL} target="_blank" rel="noreferrer" aria-label="Greenwood on X"><XLogo size={18} weight="fill" /></a>
          <SoundToggle />
        </div>
      </header>

      <section className={`gw-title-center ${menuOpen ? 'is-menu' : ''}`}>
        <div className="gw-title-lockup">
          <span>REAL-WORLD YIELD</span>
          <h1>Greenwood</h1>
          <p>Build the fund. Own the yield.</p>
        </div>

        {!menuOpen ? (
          <button type="button" className="gw-press-start" onClick={choose}>
            <span>Press Enter</span>
            <small>to start</small>
          </button>
        ) : (
          <nav className="gw-main-menu" aria-label="Main menu">
            <Link
              href={PRIMARY.href}
              className={`gw-menu-primary ${activeIndex === 0 ? 'is-active' : ''}`}
              onMouseEnter={() => setActiveIndex(0)}
              aria-current={activeIndex === 0 ? 'true' : undefined}
            >
              <span className="gw-menu-icon">
                <PRIMARY.Icon size={22} weight={activeIndex === 0 ? 'fill' : 'duotone'} />
              </span>
              <span>
                <b>{PRIMARY.label}</b>
                <small>{PRIMARY.detail}</small>
                <span className="gw-menu-rooms">
                  {PRIMARY.rooms.map((room) => <span key={room}>{room}</span>)}
                </span>
              </span>
              <CaretRight size={17} weight="bold" />
            </Link>

            <div className="gw-menu-pair">
              {SECONDARY.map(({ label, detail, href, Icon }, index) => {
                const position = index + 1;
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`gw-menu-tile ${position === activeIndex ? 'is-active' : ''}`}
                    onMouseEnter={() => setActiveIndex(position)}
                    aria-current={position === activeIndex ? 'true' : undefined}
                  >
                    <Icon size={19} weight={position === activeIndex ? 'fill' : 'duotone'} />
                    <b>{label}</b>
                    <small>{detail}</small>
                  </Link>
                );
              })}
            </div>

            <div className="gw-menu-controls">
              <kbd>W</kbd><kbd>S</kbd><span>Navigate</span>
              <kbd>ENTER</kbd><span>Select</span>
              <kbd>ESC</kbd><span>Back</span>
            </div>
          </nav>
        )}
      </section>

      <footer className="gw-title-footer">
        <span className="gw-title-build"><i /> ROBINHOOD CHAIN // BUILD 02</span>
      </footer>
    </main>
  );
}
