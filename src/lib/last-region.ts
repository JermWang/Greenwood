'use client';

// Where the player was standing, so the dashboard's one button can put them
// back there.
//
// The dashboard is a door now, not a screen (see the header of app/app/page).
// A door needs a destination, and "the region you were last in" is the only
// answer that does not make a returning player re-walk the world to get back to
// what they were doing.
//
// PER-BROWSER AND CLIENT-SIDE, deliberately. The server-side version is a column
// on `users` written on every region entry — a database write per door, for a
// value whose entire job is to aim a button, and one that two open tabs would
// immediately start fighting over. Nothing here can grant access to anything:
// the dashboard checks the remembered region against /api/regions before it
// offers it, and the region's own page gates again on arrival. The worst a
// forged or stale value can do is aim the button at a door that then refuses.

import { useEffect } from 'react';
import type { RegionId } from './regions';

const KEY = 'evergreen:last-region';

/**
 * Stored with the wallet it belongs to.
 *
 * One key rather than a key per wallet, because the value is only ever read for
 * the wallet that is signed in right now — a per-wallet key would leave a row
 * per account this browser has ever touched, none of which are ever cleaned up.
 * A mismatch reads as "nothing remembered", which is the correct answer: the
 * fund that just signed in has not been anywhere yet.
 */
interface Remembered {
  wallet: string;
  region: RegionId;
}

/** Record that this wallet is standing in this region. Safe to call on mount. */
export function rememberRegion(wallet: string | null | undefined, region: RegionId): void {
  if (typeof window === 'undefined' || !wallet) return;
  try {
    const entry: Remembered = { wallet: wallet.toLowerCase(), region };
    window.localStorage.setItem(KEY, JSON.stringify(entry));
  } catch {
    // Private mode and blocked storage both land here. Losing the memory costs
    // a returning player one walk from the Grounds, not correctness.
  }
}

/** The region this wallet was last in, or null if we have nothing for them. */
export function lastRegion(wallet: string | null | undefined): RegionId | null {
  if (typeof window === 'undefined' || !wallet) return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const entry = JSON.parse(raw) as Partial<Remembered>;
    if (typeof entry?.region !== 'string' || typeof entry?.wallet !== 'string') return null;
    return entry.wallet === wallet.toLowerCase() ? (entry.region as RegionId) : null;
  } catch {
    return null;
  }
}

/**
 * Record this region for as long as its page is mounted.
 *
 * A hook rather than a bare call in each page because the wallet arrives after
 * mount — the operation store signs you in a tick or two later — so a one-shot
 * write on mount would record nothing for the region you actually entered
 * first. Re-running on the wallet is what makes the very first visit stick.
 */
export function useRememberRegion(wallet: string | null | undefined, region: RegionId): void {
  useEffect(() => {
    rememberRegion(wallet, region);
  }, [wallet, region]);
}
