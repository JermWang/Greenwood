'use client';

// The Exchange, as a collapsed HUD button.
//
// The only menu left in the game, and deliberately so. Everything else — desks,
// instruments, notes, the Outfitter, travel — is reached by walking to it,
// because a game where every destination is also a tab teaches players that the
// world is decoration. The market is the exception because it is the one thing
// you genuinely want mid-run: seeing what your salvage is worth is a decision
// input, and making someone walk home to check it just adds travel to a number
// lookup.
//
// Collapsed to a single button by default. It opens over the game rather than
// replacing it, and it is deliberately CONDENSED — the newest listings and their
// prices, nothing else. The full Exchange is still a place you go to.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Storefront, X } from '@phosphor-icons/react';
import { api, type MarketListing } from '@/lib/api-client';

const KIND_LABEL: Record<string, string> = {
  crate: 'Allocation',
  component: 'Instrument',
  node: 'Desk',
  cosmetic: 'Cosmetic',
};

export default function MarketHud({ wallet }: { wallet: string | null }) {
  const [open, setOpen] = useState(false);
  const [listings, setListings] = useState<MarketListing[] | null>(null);

  const load = useCallback(() => {
    if (!open) return;
    void api
      .marketListings()
      .then((r) => setListings(r.listings.slice(0, 8)))
      .catch(() => setListings([]));
  }, [open]);

  // Loaded only when opened, and refreshed each time it is. A HUD that polls a
  // market the player is not looking at is a request every few seconds for a
  // panel that is closed.
  useEffect(() => { load(); }, [load]);

  // Escape closes it, because it covers the game and anything covering the game
  // needs a way out that does not require finding a button.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!wallet) return null;

  if (!open) {
    return (
      <button className="mkt-hud-tab" onClick={() => setOpen(true)} aria-label="Open the Exchange">
        <Storefront size={17} weight="duotone" />
        <span>Exchange</span>
      </button>
    );
  }

  return (
    <aside className="mkt-hud" aria-label="Exchange">
      <header>
        <b>Exchange</b>
        <button onClick={() => setOpen(false)} aria-label="Close"><X size={14} weight="bold" /></button>
      </header>

      {listings === null && <p className="mkt-hud-empty">Reading the book…</p>}
      {listings?.length === 0 && <p className="mkt-hud-empty">Nothing listed right now.</p>}

      <ul>
        {listings?.map((l) => (
          <li key={l.id}>
            <span>{KIND_LABEL[l.itemKind] ?? l.itemKind}</span>
            <b>{Math.round(l.priceBnty).toLocaleString()}</b>
          </li>
        ))}
      </ul>

      {/* The condensed view is for checking prices. Trading is still somewhere
          you go — the link is a door, not a replacement for one. */}
      <Link href="/app/market" className="mkt-hud-full">Open the floor →</Link>
    </aside>
  );
}
