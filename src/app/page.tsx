'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { BookOpenText, CaretRight, Flask, Play, XLogo } from '@phosphor-icons/react';
import { SHOWROOM_NODES } from '@/components/three/Compound';
import CopyContract from '@/components/ui/CopyContract';
import SoundToggle from '@/components/ui/SoundToggle';
import { X_URL } from '@/lib/config';

const Scene = dynamic(() => import('@/components/three/Scene'), { ssr: false });

const MENU = [
  { label: 'Start / continue', detail: 'Create an operator or resume your company', href: '/start', Icon: Play },
  { label: 'Play demo', detail: 'Walk the floor without a wallet', href: '/demo', Icon: Flask },
  { label: 'Fab manual', detail: 'Systems, economy, and safety', href: '/app/docs', Icon: BookOpenText },
] as const;

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
      if (event.key === 'ArrowUp' || event.key.toLowerCase() === 'w') {
        event.preventDefault();
        setActiveIndex((current) => (current - 1 + MENU.length) % MENU.length);
      } else if (event.key === 'ArrowDown' || event.key.toLowerCase() === 's') {
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
    <main className="gpu-title-screen">
      <div className="gpu-title-world">
        <Scene nodes={SHOWROOM_NODES} preset="sunset" selectedNodeId={null} focusNodeId={null} variant="landing" />
      </div>
      <div className="gpu-title-vignette" />
      <div className="gpu-title-scanlines" aria-hidden />

      <header className="gpu-title-topbar">
        <Link href="/" className="gpu-title-mark" aria-label="GPU home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/gpu-mark.svg" alt="" />
          <span>GPU</span>
        </Link>
        <div className="gpu-title-top-actions">
          {/* Renders nothing until the token address is configured, so it simply
              appears in the top bar the moment the CA goes live. */}
          <CopyContract />
          <a href={X_URL} target="_blank" rel="noreferrer" aria-label="GPU on X"><XLogo size={18} weight="fill" /></a>
          <SoundToggle />
        </div>
      </header>

      <section className={`gpu-title-center ${menuOpen ? 'is-menu' : ''}`}>
        <div className="gpu-title-lockup">
          <span>GRAPHICS PROCESSING UTILITY</span>
          <h1>GPU</h1>
          <p>Build the company. Own the compute.</p>
        </div>

        {!menuOpen ? (
          <button type="button" className="gpu-press-start" onClick={choose}>
            <span>Press Enter</span>
            <small>to start</small>
          </button>
        ) : (
          <nav className="gpu-main-menu" aria-label="Main menu">
            {MENU.map(({ label, detail, href, Icon }, index) => (
              <Link
                key={href}
                href={href}
                className={index === activeIndex ? 'is-active' : ''}
                onMouseEnter={() => setActiveIndex(index)}
                aria-current={index === activeIndex ? 'true' : undefined}
              >
                <Icon size={18} weight={index === activeIndex ? 'fill' : 'duotone'} />
                <span><b>{label}</b><small>{detail}</small></span>
                <CaretRight size={17} weight="bold" />
              </Link>
            ))}
            <div className="gpu-menu-controls"><kbd>W</kbd><kbd>S</kbd><span>Navigate</span><kbd>ENTER</kbd><span>Select</span><kbd>ESC</kbd><span>Back</span></div>
          </nav>
        )}
      </section>

      <footer className="gpu-title-footer">
        <span className="gpu-title-build"><i /> ROBINHOOD CHAIN // BUILD 02</span>
      </footer>
    </main>
  );
}
