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

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Play } from '@phosphor-icons/react';
import { AUTO_WALLET, demoWalletFromCookie, useOperation } from '@/lib/useOperation';
import { useWalletStore } from '@/lib/store';
import { DEMO_COOKIE, DEMO_ENTRY, isDemoWallet } from '@/lib/demo';
import { legacyKey } from '@/lib/legacy-keys';
import { api } from '@/lib/api-client';

/**
 * Sign in, into BOTH wallet stores.
 *
 * There are two — `useWalletStore` for the connected address and `useOperation`
 * for the fund state and its polling timers — and a session that sets only one
 * of them half-works in a way that looks like a hung request: the demo starts,
 * the banner appears, and the dashboard sits on FUND UPLINK OFFLINE forever
 * because the panel it renders reads the store that was never told.
 *
 * This exact trap has now caught the dev-wallet bypass and the demo. Anything
 * that signs a player in goes through here — which is why it is exported: the
 * demo entrance at /demo signs somebody in too, and a second copy of these two
 * lines living over there is exactly how one of them gets forgotten again.
 */
export function useSignIn() {
  const setStoreWallet = useWalletStore((s) => s.setWallet);
  const setOpWallet = useOperation((s) => s.setWallet);
  return useCallback(
    (wallet: string | null) => {
      setStoreWallet(wallet);
      setOpWallet(wallet);
    },
    [setStoreWallet, setOpWallet]
  );
}

export function DemoButton() {
  const wallet = useOperation((s) => s.wallet);
  const signIn = useSignIn();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Come back to the session this browser already has.
   *
   * In an EFFECT, not at module scope. Resuming used to happen when
   * lib/useOperation was first imported, which is during hydration — and a store
   * written before React has mounted is a store React renders straight past. The
   * cookie was there, the fund was not, and the connect button was back. A
   * refresh losing ten minutes of someone's demo is close to the worst thing a
   * demo can do, and it is invisible until you actually reload the page.
   *
   * Guarded on `wallet` so it never fights a real connected account.
   */
  useEffect(() => {
    if (wallet) return;
    // The dev bypass first, so a developer with it configured is never quietly
    // replaced by a demo cookie left over from testing the demo.
    if (AUTO_WALLET) { signIn(AUTO_WALLET); return; }
    const demo = demoWalletFromCookie();
    if (demo) signIn(demo);
  }, [wallet, signIn]);

  const start = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { wallet: demo } = await api.startDemo();
      signIn(demo);
      // Outside, not wherever this button happened to be clicked. Pressed from
      // the dashboard — which is where somebody with no wallet lands — it
      // otherwise signs you into an empty fund on the same wall of panels you
      // were already looking at, which is the worst first minute this game has.
      // See DEMO_ENTRY in lib/demo.
      router.push(DEMO_ENTRY);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the demo.');
    } finally {
      setBusy(false);
    }
  }, [busy, signIn, router]);

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
  const wallet = useOperation((s) => s.wallet);
  const signIn = useSignIn();
  if (!isDemoWallet(wallet)) return null;
  return (
    <span className="demo-flag">
      <b>DEMO</b>
      <span>Nothing here is real — explore anywhere.</span>
      <button
        onClick={() => {
          // Clear the cookie as well as the store, or the next load resumes the
          // session that was just exited. Both names, because a session that
          // predates the Evergreen rename is still holding the old one and
          // readCookie would happily resume from it (see lib/legacy-keys).
          for (const name of [DEMO_COOKIE, legacyKey(DEMO_COOKIE)]) {
            document.cookie = `${name}=; Max-Age=0; path=/`;
          }
          signIn(null);
        }}
      >
        Exit
      </button>
    </span>
  );
}
