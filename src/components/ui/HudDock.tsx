'use client';

// The right-hand dock: what you are carrying, and what things are going for.
//
// MIRRORS THE CHAT, deliberately. Chat sits bottom-left as a pill that opens a
// glass panel upward; these sit bottom-right and do the same. Two docks at
// opposite corners read as one system with a left half and a right half, which
// is the whole reason to build them the same way — the alternative is three
// unrelated widgets each inventing its own shape.
//
// IT REPLACED AN UNSTYLED COMPONENT. The old Exchange HUD had markup and, apart
// from one mobile touch-target rule, NO CSS at all: an unstyled button and an
// unstyled <aside> in normal document flow, which is why it appeared as bare
// text across the bottom of the screen and collided with the chat. It was not
// badly designed; it was never designed.
//
// ONE PANEL AT A TIME, and that is what the shared `open` state buys. Two
// panels stacked up the right edge would cover exactly the part of the board
// this dock exists to stay out of.
//
// NOTHING HERE TRADES OR EQUIPS. Both panels are read-only on purpose. Seeing
// what your salvage is worth is a decision input you need where you stand;
// acting on it is a place you go — the Exchange is reached by walking into the
// Trading Floor and up to a stall (see IsoTradingFloor), and instruments are
// fitted at a desk in the Machine Room. That is the navigation rule in CLAUDE.md
// and this dock is careful not to be the exception to it: it tells you the
// number, it does not sell you anything.

import { useCallback, useEffect, useState } from 'react';
import { Storefront, Backpack, X } from '@phosphor-icons/react';
import { api, type MarketListing, type InventoryItem } from '@/lib/api-client';
import { COMPONENT_RARITIES, RARITIES, SLOT_LABELS, rarityHex, type Rarity } from '@/lib/rarity';

const KIND_LABEL: Record<string, string> = {
  crate: 'Allocation',
  component: 'Instrument',
  node: 'Desk',
  cosmetic: 'Cosmetic',
};

/** A rarity off the wire is a string; treat anything unknown as the floor. */
const asRarity = (value: string): Rarity =>
  (RARITIES as string[]).includes(value) ? (value as Rarity) : 'common';

/**
 * How many rows each panel shows.
 *
 * Small enough that the panel never grows past about a third of the board's
 * height, which is the constraint the HUD budget in CLAUDE.md actually imposes.
 * The full lists are pages you can open; this is the glance.
 */
const ROWS = 7;

type Panel = 'market' | 'items';

export default function HudDock({ wallet }: { wallet: string | null }) {
  const [open, setOpen] = useState<Panel | null>(null);
  const [listings, setListings] = useState<MarketListing[] | null>(null);
  const [items, setItems] = useState<InventoryItem[] | null>(null);

  /*
   * Loaded when opened, and refreshed each time it is opened.
   *
   * A HUD that polls a market nobody is looking at is a request every few
   * seconds for a closed panel; a HUD that loads once is a panel showing this
   * morning's prices. Fetching on open is both correct and free.
   */
  useEffect(() => {
    if (open === 'market') {
      setListings(null);
      void api
        .marketListings()
        .then((r) => setListings(r.listings.slice(0, ROWS)))
        .catch(() => setListings([]));
    }
    if (open === 'items' && wallet) {
      setItems(null);
      void api
        .inventory(wallet)
        .then((r) =>
          setItems(
            [...r.items].sort(
              (a, b) =>
                RARITIES.indexOf(asRarity(b.rarity)) - RARITIES.indexOf(asRarity(a.rarity)) ||
                b.createdAt - a.createdAt
            )
          )
        )
        .catch(() => setItems([]));
    }
  }, [open, wallet]);

  // Escape closes it, because it covers part of the game and anything covering
  // the game needs a way out that does not require finding a button.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const toggle = useCallback((panel: Panel) => {
    setOpen((current) => (current === panel ? null : panel));
  }, []);

  if (!wallet) return null;

  return (
    <div className="eg-dock">
      {open === 'market' && (
        <section className="eg-dock-panel" aria-label="Market prices">
          <header>
            <Storefront size={13} weight="duotone" />
            <b>Market</b>
            <button onClick={() => setOpen(null)} aria-label="Close">
              <X size={12} weight="bold" />
            </button>
          </header>
          <ul className="eg-dock-list">
            {listings === null && <li className="eg-dock-empty">Reading the book…</li>}
            {listings?.length === 0 && <li className="eg-dock-empty">Nothing listed right now.</li>}
            {listings?.map((listing) => (
              <li key={listing.id}>
                <span className="eg-dock-what">{KIND_LABEL[listing.itemKind] ?? listing.itemKind}</span>
                <span className="eg-dock-price">
                  {Math.round(listing.priceGreen).toLocaleString()}
                  <i>GREEN</i>
                </span>
              </li>
            ))}
          </ul>
          {/* A direction, not a link. The Exchange is a place you walk to. */}
          <p className="eg-dock-foot">Trade at the Trading Floor.</p>
        </section>
      )}

      {open === 'items' && (
        <section className="eg-dock-panel" aria-label="Instruments you hold">
          <header>
            <Backpack size={13} weight="duotone" />
            <b>Instruments</b>
            {items && items.length > 0 && <em>{items.length}</em>}
            <button onClick={() => setOpen(null)} aria-label="Close">
              <X size={12} weight="bold" />
            </button>
          </header>
          <ul className="eg-dock-list">
            {items === null && <li className="eg-dock-empty">Opening the locker…</li>}
            {items?.length === 0 && (
              <li className="eg-dock-empty">Nothing yet. Allocations hold instruments.</li>
            )}
            {items?.slice(0, ROWS).map((item) => {
              const rarity = asRarity(item.rarity);
              return (
                <li key={item.id}>
                  {/* The rarity colour is the same one the model is tinted with
                      in the world, so an item reads the same in both places. */}
                  <i className="eg-dock-pip" style={{ background: rarityHex(rarity) }} />
                  <span className="eg-dock-what">
                    {SLOT_LABELS[item.slot] ?? 'Instrument'}
                    <small>{COMPONENT_RARITIES[rarity].label}</small>
                  </span>
                  <span className="eg-dock-price">
                    ×{item.multiplier.toFixed(1)}
                    {item.equippedNodeId !== null && <i>FITTED</i>}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="eg-dock-foot">
            {items && items.length > ROWS
              ? `${items.length - ROWS} more. Fit them at a desk in the Machine Room.`
              : 'Fit instruments at a desk in the Machine Room.'}
          </p>
        </section>
      )}

      <div className="eg-dock-tabs">
        <button
          className={`eg-dock-tab${open === 'market' ? ' is-open' : ''}`}
          onClick={() => toggle('market')}
          aria-expanded={open === 'market'}
        >
          <Storefront size={15} weight="duotone" />
          <span>Market</span>
        </button>
        <button
          className={`eg-dock-tab${open === 'items' ? ' is-open' : ''}`}
          onClick={() => toggle('items')}
          aria-expanded={open === 'items'}
        >
          <Backpack size={15} weight="duotone" />
          <span>Items</span>
        </button>
      </div>
    </div>
  );
}
