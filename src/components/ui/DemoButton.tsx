'use client';

// "Play the demo" — and the banner that follows you once you do.
//
// The button sits beside Connect Wallet rather than on a separate landing page,
// because the thing standing between a curious person and this game is the
// connect step, and the fix for that is an alternative in the same place, not a
// link somewhere else that they have to find first.
//
// The banner is not decoration. A demo that is indistinguishable from the real
// thing is a demo somebody spends an hour building a fund in and then discovers
// was never real, which is a worse experience than not offering one — so it says
// so, permanently, and offers the way out.

import { useCallback, useState } from 'react';
import { Play } from '@phosphor-icons/react';
import { useOperation } from '@/lib/useOperation';
import { isDemoWallet } from '@/lib/demo';
import { api } from '@/lib/api-client';

export function DemoButton() {
  const { wallet, setWallet } = useOperation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { wallet: demo } = await api.startDemo();
      // setWallet rather than seeding state directly: it is what starts the
      // polling timers, and without them the dashboard holds an address it
      // never fetches anything for, which looks exactly like a hung request.
      setWallet(demo);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the demo.');
    } finally {
      setBusy(false);
    }
  }, [busy, setWallet]);

  // Nothing to offer once somebody is playing, demo or otherwise.
  if (wallet) return null;

  return (
    <button className="demo-start" onClick={() => void start()} disabled={busy} title={error ?? undefined}>
      <Play size={13} weight="fill" />
      {busy ? 'Starting…' : 'Play the demo'}
    </button>
  );
}

/**
 * The reminder, once a demo is running.
 *
 * Says what it is and gets out of the way. "Nothing here is real" is the whole
 * message — not a disclaimer nobody reads, a single line that stops somebody
 * mistaking a sandbox for their actual holdings.
 */
export function DemoBanner() {
  const { wallet, setWallet } = useOperation();
  if (!isDemoWallet(wallet)) return null;
  return (
    <span className="demo-flag">
      <b>DEMO</b>
      <span>Nothing here is real — explore anywhere.</span>
      <button
        onClick={() => {
          // Clear the cookie as well as the store, or the next load resumes the
          // session that was just exited.
          document.cookie = 'greenwood_demo=; Max-Age=0; path=/';
          setWallet(null);
        }}
      >
        Exit
      </button>
    </span>
  );
}
