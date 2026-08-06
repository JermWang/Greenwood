'use client';

// The demo entrance. It is a DOOR, not a destination.
//
// This page used to BE the demo: a hand-placed Machine Room, six fake desks
// declared as a literal in this file, and no account behind any of it. Nothing
// could be built, nothing was earned, nothing was yours — and the room it
// opened in is the one room the game's own navigation says you are meant to
// have WALKED to. A new player arrived at the end of the first hour with none
// of the first hour having happened, which is the opposite of an invitation.
//
// So it now does what "Play the demo" always claimed. It mints a real account
// (lib/demo — a real row, the real database, the real game), signs the browser
// in, and drops the player outside at the arrival gate on the first step of the
// same introduction a connected player walks. There is no demo build of the
// game past this line. There is just the game.
//
// It renders almost nothing on purpose: anything worth looking at here is a
// thing the player is looking at INSTEAD of the world, and the wait is one
// request long.

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ShieldCheck } from '@phosphor-icons/react';
import { useSignIn } from '@/components/ui/DemoButton';
import { api } from '@/lib/api-client';
import { DEMO_ENTRY } from '@/lib/demo';

export default function DemoPage() {
  const router = useRouter();
  const signIn = useSignIn();
  const [error, setError] = useState<string | null>(null);
  /** Bumped by the retry button; the effect below is keyed on it. */
  const [attempt, setAttempt] = useState(0);
  /**
   * Guards React's development double-invoke.
   *
   * Without it the entrance posts twice on every visit. The route resumes an
   * existing cookie rather than minting a second account, so the cost would be
   * a wasted request rather than a duplicate fund — but the second response can
   * land after the first and re-sign-in mid-navigation, and that is the class
   * of race that only ever appears in front of somebody else.
   */
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      try {
        const { wallet } = await api.startDemo();
        signIn(wallet);
        // `replace`, so Back from the Grounds returns to the title screen
        // instead of re-entering this page and bouncing straight forward again.
        router.replace(DEMO_ENTRY);
      } catch (e) {
        started.current = false;
        setError(e instanceof Error ? e.message : 'The demo could not be started.');
      }
    })();
  }, [router, signIn, attempt]);

  const retry = useCallback(() => {
    setError(null);
    setAttempt((n) => n + 1);
  }, []);

  return (
    <main className="gw-onboarding-screen">
      <div className="gw-onboarding-grid" aria-hidden />
      <header className="gw-onboarding-top">
        <Link href="/" aria-label="Return to title screen"><ArrowLeft size={18} /> Title screen</Link>
        <span>DEMO // NO WALLET REQUIRED</span>
      </header>

      <section className="gw-onboarding-card">
        <div className="gw-onboarding-step">{error ? 'HELD AT THE GATE' : '01 / ARRIVING'}</div>

        {error ? (
          <>
            <h1>That gate did not open.</h1>
            <p>The demo asks the server for a throwaway fund, and that request did not come back.</p>
            <div className="gw-onboarding-error">{error}</div>
            <div className="gw-onboarding-wallet">
              <button className="btn-primary" onClick={retry}>Try again</button>
            </div>
          </>
        ) : (
          <div className="gw-profile-check">
            <span />
            <h1>Opening the gate.</h1>
            <p>
              A throwaway fund, seeded with Scrip, playing the real game against the real
              database. You arrive outside Greenwood with nothing built — the Machine Room is a
              door you walk to.
            </p>
          </div>
        )}

        <div className="gw-safety-note">
          <ShieldCheck size={20} weight="duotone" />
          <span>
            <b>Nothing here is real</b>
            <small>
              No wallet, no signature, and no token can move. The banner in the top bar says so
              for as long as the session lasts, and Exit ends it.
            </small>
          </span>
        </div>
      </section>

      <aside className="gw-demo-invite">
        <ShieldCheck size={22} weight="duotone" />
        <span><b>Want to keep it?</b><small>A linked fund is the same game, saved to a wallet you own.</small></span>
        <Link href="/start">Link a fund</Link>
      </aside>
    </main>
  );
}
