'use client';

// The mark in the top bar, and the way back to the title screen.
//
// It is a real <a href="/">, not a button that calls router.push, and that is
// deliberate: middle-click, cmd-click and "open in new tab" all have to keep
// working on the one element in the app that most looks like a home link. The
// guard below intercepts the PLAIN left click only, and lets every modified
// click through untouched.
//
// WHY IT ASKS. On a page, a stray click on the logo costs you a page. In a
// region it drops you out of the world you are standing in — and the mark sits
// in the corner people flick the mouse to, next to nothing else clickable. The
// confirmation exists for the miss, not for the decision, so it is a single
// question with the safe answer focused and Escape wired to it.
//
// It is honest about the stakes rather than dramatic: leaving a region does not
// cost your run. Position, health and pack all live server-side in
// `expedition_state`, so walking out of the tab and coming back puts you where
// you were. Saying "you will lose your progress" would be a lie told to make a
// dialog feel important, and the first player who tested it would learn to
// ignore the next warning too.

import Link from 'next/link';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { MARK_SRC } from '@/lib/brand-assets';

export default function HomeMark({
  /** True where a stray click would interrupt something: the world screens. */
  guard,
  /** Where the player is, named, so the question is about somewhere real. */
  place,
}: {
  guard: boolean;
  place?: string | null;
}) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);

  const leave = useCallback(() => {
    setAsking(false);
    router.push('/');
  }, [router]);

  // Escape answers "stay". The safe answer is the one a keyboard reaches
  // without aiming, because this dialog exists for people who did not mean to
  // open it.
  useEffect(() => {
    if (!asking) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAsking(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [asking]);

  return (
    <>
      <Link
        href="/"
        className="eg-home-mark"
        aria-label="Evergreen — title screen"
        onClick={(event) => {
          if (!guard) return;
          // Let the browser have every click that means "somewhere else, not
          // here": new tab, new window, middle button. Only the plain one is
          // the accident this guards against.
          if (
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey ||
            event.button !== 0
          ) {
            return;
          }
          event.preventDefault();
          setAsking(true);
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={MARK_SRC} alt="" />
        <span className="eg-topbar-wordmark">Evergreen</span>
      </Link>

      {/*
        PORTALLED TO <body>, and it has to be.

        This component lives in `.eg-topbar`, which is `position: sticky` with
        `z-index: 45` — so it opens a stacking context, and every z-index inside
        it is scored against its siblings rather than against the page. The
        dialog asked for 210 and still came out UNDER the introduction panel
        (z-index 46), because 46 beats the whole topbar at 45 and nothing inside
        the bar can climb past its parent.

        Raising the topbar would have "fixed" it by putting the nav over
        everything else permanently. A modal simply does not belong in another
        element's stacking context.
      */}
      {asking && createPortal(
        <div
          className="eg-leave-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="eg-leave-title"
          // Clicking the backdrop is the same answer as Escape. A misclick that
          // opened this should be closable by another misclick.
          onClick={(event) => {
            if (event.target === event.currentTarget) setAsking(false);
          }}
        >
          <div className="eg-leave-modal">
            <h2 id="eg-leave-title">Back to the title screen?</h2>
            <p>
              {place ? `You are in ${place}. ` : ''}
              Nothing is lost — your fund, your pack and where you are standing are
              all kept, and you will come straight back here.
            </p>
            <div className="eg-leave-actions">
              <button type="button" className="is-stay" onClick={() => setAsking(false)} autoFocus>
                Stay
              </button>
              <button type="button" className="is-leave" onClick={leave}>
                Leave
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
