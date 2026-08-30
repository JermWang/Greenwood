'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { BookOpenText, CaretRight, Flask, Play, XLogo } from '@phosphor-icons/react';
import CopyContract from '@/components/ui/CopyContract';
import SoundToggle from '@/components/ui/SoundToggle';
import { X_URL } from '@/lib/config';

// ssr: false because the scene builds three.js objects at render scope, and a
// throw inside a Canvas subtree during the server pass takes the whole scene
// with it -- black canvas, empty console. See docs/iso-conventions.md.
const TitleCinematic = dynamic(() => import('@/components/iso/TitleCinematic'), { ssr: false });

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
  { label: 'Play demo', detail: 'Start outside and build it, no wallet needed', href: '/demo', Icon: Flask },
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
    <main className="eg-title-screen">
      <div className="eg-title-world">
        <TitleCinematic />
      </div>
      <div className="eg-title-vignette" />
      <div className="eg-title-scanlines" aria-hidden />

      <header className="eg-title-topbar">
        <Link href="/" className="eg-title-mark" aria-label="Evergreen home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/eg-mark.svg" alt="" />
          <span>Evergreen</span>
        </Link>
        <div className="eg-title-top-actions">
          {/* Renders nothing until the token address is configured, so it simply
              appears in the top bar the moment the CA goes live. */}
          <CopyContract />
          <a href={X_URL} target="_blank" rel="noreferrer" aria-label="Evergreen on X"><XLogo size={18} weight="fill" /></a>
          <SoundToggle />
        </div>
      </header>

      <section className={`eg-title-center ${menuOpen ? 'is-menu' : ''}`}>
        <div className="eg-title-lockup">
          <span>REAL-WORLD YIELD</span>
          <h1>Evergreen</h1>
          <p>Build the fund. Own the yield.</p>
        </div>

        {!menuOpen ? (
          <button type="button" className="eg-press-start" onClick={choose}>
            <span>Press Enter</span>
            <small>to start</small>
          </button>
        ) : (
          <nav className="eg-main-menu" aria-label="Main menu">
            <Link
              href={PRIMARY.href}
              className={`eg-menu-primary ${activeIndex === 0 ? 'is-active' : ''}`}
              onMouseEnter={() => setActiveIndex(0)}
              aria-current={activeIndex === 0 ? 'true' : undefined}
            >
              <span className="eg-menu-icon">
                <PRIMARY.Icon size={22} weight={activeIndex === 0 ? 'fill' : 'duotone'} />
              </span>
              <span>
                <b>{PRIMARY.label}</b>
                <small>{PRIMARY.detail}</small>
                <span className="eg-menu-rooms">
                  {PRIMARY.rooms.map((room) => <span key={room}>{room}</span>)}
                </span>
              </span>
              <CaretRight size={17} weight="bold" />
            </Link>

            <div className="eg-menu-pair">
              {SECONDARY.map(({ label, detail, href, Icon }, index) => {
                const position = index + 1;
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`eg-menu-tile ${position === activeIndex ? 'is-active' : ''}`}
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

            <div className="eg-menu-controls">
              <kbd>W</kbd><kbd>S</kbd><span>Navigate</span>
              <kbd>ENTER</kbd><span>Select</span>
              <kbd>ESC</kbd><span>Back</span>
            </div>
          </nav>
        )}
      </section>

      <footer className="eg-title-footer">
        <span className="eg-title-build"><i /> ROBINHOOD CHAIN // BUILD 02</span>
      </footer>
    </main>
  );
}
