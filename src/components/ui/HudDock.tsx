'use client';

// The right-hand dock: what you are carrying, and the market.
//
// MIRRORS THE CHAT, deliberately. Chat sits bottom-left as a pill that opens a
// glass panel upward; these sit bottom-right and do the same. Two docks at
// opposite ends of the bottom edge read as one system with a left half and a
// right half, which is the whole reason to build them the same way — the
// alternative is three unrelated widgets each inventing its own shape.
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
// THE MARKET PANEL TRADES. It buys, it lists and it cancels, against the same
// four routes the full Exchange page uses — including the settlement lifecycle,
// so a purchase raises the same wallet prompt here as it does there. An earlier
// version of this file was read-only and argued at length that it should stay
// that way; that was a call about product, not about safety, and it was made
// differently. Nothing about the server changed: every one of these routes
// already authenticated the caller and re-checked the listing.
//
// Items stays read-only, and that is not the same decision. Fitting an
// instrument means choosing a desk to fit it TO, which is the Machine Room's
// whole screen — a picker for it in a 330px panel would be a worse version of
// something that already exists twenty tiles away.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Storefront, Backpack, X, Tag } from '@phosphor-icons/react';
import {
  api,
  type MarketListing,
  type MarketItemKind,
  type InventoryItem,
  type CosmeticItem,
  type StepHandler,
} from '@/lib/api-client';
import { useOperation } from '@/lib/useOperation';
import { COMPONENT_RARITIES, RARITIES, SLOT_LABELS, asRarity, rarityHex } from '@/lib/rarity';
import { listingSubtitle, listingTitle, sellerLabel } from '@/lib/listings';
import ListingThumb from './ListingThumb';

const fmt = (n: number) => Math.round(n).toLocaleString();

/*
 * The lists are capped in CSS, not by slicing the data.
 *
 * The read-only version took the first seven rows and drew them. That is fine
 * for a price glance and wrong the moment you can BUY from it: a market panel
 * showing seven listings out of forty, with nothing on screen saying so, is a
 * panel lying about depth to somebody deciding what to pay. A max-height and a
 * scrollbar say "there is more" without needing a sentence.
 */

type Panel = 'market' | 'items';
type Mode = 'buy' | 'sell';

/** One thing this wallet could put on the board. */
interface Sellable {
  kind: MarketItemKind;
  id: number;
  label: string;
  detail: string;
  colour?: string;
}

export default function HudDock({ wallet }: { wallet: string | null }) {
  const { op, refresh } = useOperation();
  const [open, setOpen] = useState<Panel | null>(null);
  const [mode, setMode] = useState<Mode>('buy');

  const [listings, setListings] = useState<MarketListing[] | null>(null);
  const [feeBps, setFeeBps] = useState(250);
  const [items, setItems] = useState<InventoryItem[] | null>(null);
  const [wardrobe, setWardrobe] = useState<CosmeticItem[] | null>(null);

  const [picked, setPicked] = useState<Sellable | null>(null);
  const [price, setPrice] = useState('');
  /** The listing id being acted on, or 'list' while a sale is being posted. */
  const [busy, setBusy] = useState<number | 'list' | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const say = useCallback((message: string) => {
    setNote(message);
    window.setTimeout(() => setNote((current) => (current === message ? null : current)), 3600);
  }, []);

  const loadMarket = useCallback(async () => {
    try {
      const board = await api.marketListings();
      setListings(board.listings);
      setFeeBps(board.feeBps);
    } catch {
      setListings([]);
    }
  }, []);

  const loadHoldings = useCallback(async () => {
    if (!wallet) return;
    const [inv, cos] = await Promise.all([
      api.inventory(wallet).catch(() => ({ items: [] as InventoryItem[] })),
      api.cosmetics(wallet).catch(() => ({ items: [] as CosmeticItem[] })),
    ]);
    setItems(
      [...inv.items].sort(
        (a, b) =>
          RARITIES.indexOf(asRarity(b.rarity)) - RARITIES.indexOf(asRarity(a.rarity)) ||
          b.createdAt - a.createdAt
      )
    );
    setWardrobe(cos.items);
  }, [wallet]);

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
      void loadMarket();
      void loadHoldings();
    }
    if (open === 'items') {
      setItems(null);
      void loadHoldings();
    }
  }, [open, loadMarket, loadHoldings]);

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

  const mine = useMemo(
    () =>
      (listings ?? []).filter((l) => wallet && l.seller.toLowerCase() === wallet.toLowerCase()),
    [listings, wallet]
  );
  const others = useMemo(
    () =>
      (listings ?? []).filter((l) => !wallet || l.seller.toLowerCase() !== wallet.toLowerCase()),
    [listings, wallet]
  );

  /**
   * What this wallet can put on the board.
   *
   * EQUIPPED GEAR IS EXCLUDED, and worn cosmetics with it. The server refuses
   * both, so offering them here would only produce a rejection a moment later —
   * and a shop that lists things it will not sell you is worse than one that
   * lists fewer things. Same rule the full Exchange applies.
   */
  const sellables = useMemo<Sellable[]>(() => {
    const out: Sellable[] = [];
    for (const crate of op?.crates ?? []) {
      out.push({
        kind: 'crate',
        id: crate.id,
        label: 'Allocation',
        detail: crate.crateType === 'equity_allocation' ? 'Equity' : 'Treasury',
      });
    }
    for (const item of items ?? []) {
      if (item.equippedNodeId != null) continue;
      const rarity = asRarity(item.rarity);
      out.push({
        kind: 'component',
        id: item.id,
        label: SLOT_LABELS[item.slot] ?? 'Instrument',
        detail: COMPONENT_RARITIES[rarity].label,
        colour: rarityHex(rarity),
      });
    }
    for (const piece of wardrobe ?? []) {
      if (!piece.owned || piece.equipped || piece.listed || piece.ownedId == null) continue;
      out.push({ kind: 'cosmetic', id: piece.ownedId, label: piece.name, detail: 'Cosmetic' });
    }
    return out;
  }, [op?.crates, items, wardrobe]);

  const priceNum = Number(price);
  const priceValid = picked != null && Number.isFinite(priceNum) && priceNum > 0;
  const net = priceValid ? priceNum - Math.floor((priceNum * feeBps) / 10_000) : 0;

  const buy = useCallback(
    async (listing: MarketListing) => {
      if (!wallet) return say('Connect a wallet first');
      setBusy(listing.id);
      try {
        // The same step handler the Exchange page uses: a purchase can raise a
        // wallet prompt, and a panel that goes quiet while a wallet waits
        // offscreen is a panel people click again.
        const onStep: StepHandler = (step) =>
          say(step === 'submitting' ? 'Confirm in your wallet…' : 'Working…');
        const result = await api.marketBuy(wallet, listing.id, onStep);
        await Promise.all([loadMarket(), loadHoldings(), refresh()]);
        // Do not claim a clean sale when the seller's payout has not landed.
        say(result.sellerPaid === false ? 'Bought — seller payout pending' : 'Bought');
      } catch (e) {
        say(e instanceof Error ? e.message : 'Purchase failed');
      } finally {
        setBusy(null);
      }
    },
    [wallet, say, loadMarket, loadHoldings, refresh]
  );

  const cancel = useCallback(
    async (listing: MarketListing) => {
      if (!wallet) return;
      setBusy(listing.id);
      try {
        await api.marketCancel(wallet, listing.id);
        await Promise.all([loadMarket(), loadHoldings(), refresh()]);
        say('Listing cancelled');
      } catch (e) {
        say(e instanceof Error ? e.message : 'Could not cancel');
      } finally {
        setBusy(null);
      }
    },
    [wallet, say, loadMarket, loadHoldings, refresh]
  );

  const list = useCallback(async () => {
    if (!wallet || !picked || !priceValid) return;
    setBusy('list');
    try {
      await api.marketList(wallet, picked.kind, picked.id, priceNum);
      setPicked(null);
      setPrice('');
      await Promise.all([loadMarket(), loadHoldings(), refresh()]);
      say('Listed');
    } catch (e) {
      say(e instanceof Error ? e.message : 'Could not list that');
    } finally {
      setBusy(null);
    }
  }, [wallet, picked, priceValid, priceNum, say, loadMarket, loadHoldings, refresh]);

  if (!wallet) return null;

  return (
    <div className="eg-dock">
      {open === 'market' && (
        <section className="eg-dock-panel is-market" aria-label="Market">
          <header>
            <Storefront size={13} weight="duotone" />
            <b>Market</b>
            <button onClick={() => setOpen(null)} aria-label="Close">
              <X size={12} weight="bold" />
            </button>
          </header>

          <div className="eg-dock-modes" role="tablist">
            <button
              role="tab"
              aria-selected={mode === 'buy'}
              className={mode === 'buy' ? 'is-on' : undefined}
              onClick={() => setMode('buy')}
            >
              Buy
            </button>
            <button
              role="tab"
              aria-selected={mode === 'sell'}
              className={mode === 'sell' ? 'is-on' : undefined}
              onClick={() => setMode('sell')}
            >
              Sell
            </button>
          </div>

          {mode === 'buy' ? (
            <ul className="eg-dock-list is-scroll">
              {listings === null && <li className="eg-dock-empty">Reading the book…</li>}
              {listings !== null && others.length === 0 && (
                <li className="eg-dock-empty">Nothing listed right now.</li>
              )}
              {others.map((listing) => (
                <li key={listing.id} className="is-lot">
                  {/* No `live`: this panel floats over a region that is already
                      running a WebGL scene, and CrateThumb opens its own
                      context. See ListingThumb. */}
                  <ListingThumb listing={listing} size={32} />
                  <span className="eg-dock-what">
                    {listingTitle(listing)}
                    <small>{listingSubtitle(listing)}</small>
                    {/* Who is selling. A name where they have set one, the
                        shortened address where they have not. */}
                    <em>{sellerLabel(listing)}</em>
                  </span>
                  <span className="eg-dock-lot-buy">
                    <span className="eg-dock-price">
                      {fmt(listing.priceGreen)}
                      <i>GREEN</i>
                    </span>
                    <button
                      className="eg-dock-go"
                      disabled={busy !== null}
                      onClick={() => void buy(listing)}
                    >
                      {busy === listing.id ? '…' : 'Buy'}
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="eg-dock-sell">
              {/*
                Both lists share ONE scroll area, and the price row stays
                pinned below it.

                Scrolling them separately was the first attempt and it grew the
                panel instead of the scrollbar: list something and the panel got
                a third section taller, until the top of it ran up under the
                introduction in the opposite corner. One capped scroll region
                means posting a listing changes what is IN the panel and never
                how big it is.
              */}
              <div className="eg-dock-scroll">
                {mine.length > 0 && (
                  <>
                    <p className="eg-dock-kicker">On the board</p>
                    <ul className="eg-dock-list">
                      {mine.map((listing) => (
                        <li key={listing.id} className="is-lot">
                          <ListingThumb listing={listing} size={26} />
                          <span className="eg-dock-what">
                            {listingTitle(listing)}
                            <small>{listingSubtitle(listing)}</small>
                          </span>
                          <span className="eg-dock-lot-buy">
                            <span className="eg-dock-price">
                              {fmt(listing.priceGreen)}
                              <i>GREEN</i>
                            </span>
                            <button
                              className="eg-dock-go is-quiet"
                              disabled={busy !== null}
                              onClick={() => void cancel(listing)}
                            >
                              {busy === listing.id ? '…' : 'Cancel'}
                            </button>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}

                <p className="eg-dock-kicker">Yours to sell</p>
                {sellables.length === 0 ? (
                  <p className="eg-dock-empty is-pad">
                    Nothing spare. Equipped instruments and worn cosmetics have to come off first.
                  </p>
                ) : (
                  <ul className="eg-dock-list">
                    {sellables.map((s) => {
                      const on = picked?.kind === s.kind && picked.id === s.id;
                      return (
                        <li key={`${s.kind}-${s.id}`}>
                          <button
                            className={`eg-dock-pick${on ? ' is-on' : ''}`}
                            onClick={() => setPicked(on ? null : s)}
                          >
                            {s.colour && (
                              <i className="eg-dock-pip" style={{ background: s.colour }} />
                            )}
                            <span className="eg-dock-what">
                              {s.label}
                              <small>{s.detail}</small>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <form
                className="eg-dock-price-row"
                onSubmit={(e) => {
                  e.preventDefault();
                  void list();
                }}
              >
                <input
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  inputMode="decimal"
                  placeholder={picked ? `Price in GREEN` : 'Pick something first'}
                  disabled={!picked}
                  aria-label="Asking price in GREEN"
                  /* The world listens for W/A/S/D. Without this, typing a price
                     with a stray letter in it walks you across the map. */
                  onKeyDown={(e) => e.stopPropagation()}
                />
                <button type="submit" disabled={!priceValid || busy !== null}>
                  <Tag size={12} weight="fill" />
                  {busy === 'list' ? '…' : 'List'}
                </button>
              </form>
              {/* The fee is shown as what you RECEIVE, not as a percentage. The
                  number a seller is deciding on is the one that reaches them. */}
              <p className="eg-dock-foot">
                {priceValid
                  ? `You receive ${fmt(net)} GREEN after the ${(feeBps / 100).toFixed(2)}% fee.`
                  : 'Sell here; the full book is at the Trading Floor.'}
              </p>
            </div>
          )}

          {note && <p className="eg-dock-note">{note}</p>}
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
          <ul className="eg-dock-list is-scroll">
            {items === null && <li className="eg-dock-empty">Opening the locker…</li>}
            {items?.length === 0 && (
              <li className="eg-dock-empty">Nothing yet. Allocations hold instruments.</li>
            )}
            {items?.map((item) => {
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
          <p className="eg-dock-foot">Fit instruments at a desk in the Machine Room.</p>
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
