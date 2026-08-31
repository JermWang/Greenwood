'use client';

// The market, as state and four verbs.
//
// There are two market surfaces now — the compact one in the HUD dock and the
// full one at the table on the Trading Floor — and they need identical
// behaviour from different layouts. Buying is not a rendering concern: it is a
// settlement lifecycle, a re-fetch of three things, and a set of rules about
// what may be listed. Written twice, the two would drift on exactly the rule
// that matters (equipped gear is unsellable) and only one of them would be
// wrong, which is the hardest kind of bug to notice.
//
// So the logic lives here and the panels are presentation. Same reasoning as
// lib/listings holding the copy.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  api,
  type CosmeticItem,
  type InventoryItem,
  type MarketItemKind,
  type MarketListing,
  type StepHandler,
  type TradeView,
} from './api-client';
import { useOperation } from './useOperation';
import { COMPONENT_RARITIES, SLOT_LABELS, asRarity, rarityHex, RARITIES } from './rarity';

/** One thing this wallet could put on the board. */
export interface Sellable {
  kind: MarketItemKind;
  id: number;
  label: string;
  detail: string;
  colour?: string;
}

export interface MarketState {
  listings: MarketListing[] | null;
  /** Listings by somebody else — the only ones that can be bought. */
  others: MarketListing[];
  /** This wallet's own open listings. */
  mine: MarketListing[];
  trades: TradeView[] | null;
  sellables: Sellable[];
  feeBps: number;
  /** The listing id being acted on, or 'list' while one is being posted. */
  busy: number | 'list' | null;
  note: string | null;
  buy: (listing: MarketListing) => Promise<void>;
  cancel: (listing: MarketListing) => Promise<void>;
  list: (pick: Sellable, priceGreen: number) => Promise<boolean>;
  reload: () => void;
}

export function useMarket(wallet: string | null, open: boolean): MarketState {
  const { op, refresh } = useOperation();
  const [listings, setListings] = useState<MarketListing[] | null>(null);
  const [trades, setTrades] = useState<TradeView[] | null>(null);
  const [items, setItems] = useState<InventoryItem[] | null>(null);
  const [wardrobe, setWardrobe] = useState<CosmeticItem[] | null>(null);
  const [feeBps, setFeeBps] = useState(250);
  const [busy, setBusy] = useState<number | 'list' | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const say = useCallback((message: string) => {
    setNote(message);
    window.setTimeout(() => setNote((c) => (c === message ? null : c)), 3600);
  }, []);

  const loadBoard = useCallback(async () => {
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

  const loadTrades = useCallback(async () => {
    if (!wallet) return;
    await api
      .marketHistory(wallet)
      .then((r) => setTrades(r.trades))
      .catch(() => {
        /*
         * SAY SO, rather than reporting an empty history.
         *
         * This swallowed the failure into `[]`, which renders as "You have not
         * traded yet" — a confident, wrong answer. It showed up immediately: a
         * request aborted by a remount left a player who had just bought
         * something looking at a tab telling them they never had. An empty list
         * and a failed load are different facts and the panel now distinguishes
         * them.
         */
        setTrades((current) => current ?? []);
        say('Could not load your history — try reopening the table.');
      });
  }, [wallet, say]);

  const reload = useCallback(() => {
    void loadBoard();
    void loadHoldings();
    void loadTrades();
  }, [loadBoard, loadHoldings, loadTrades]);

  /*
   * Loaded when the surface OPENS, and refreshed each time it does.
   *
   * A market that polls while nobody is looking is a request every few seconds
   * for a closed panel; one that loads once shows this morning's prices.
   */
  useEffect(() => {
    if (!open) return;
    setListings(null);
    reload();
  }, [open, reload]);

  const mine = useMemo(
    () => (listings ?? []).filter((l) => wallet && l.seller.toLowerCase() === wallet.toLowerCase()),
    [listings, wallet]
  );
  const others = useMemo(
    () => (listings ?? []).filter((l) => !wallet || l.seller.toLowerCase() !== wallet.toLowerCase()),
    [listings, wallet]
  );

  /**
   * What this wallet can put on the board.
   *
   * EQUIPPED GEAR IS EXCLUDED, and worn cosmetics with it. The server refuses
   * both, so offering them would only produce a rejection a moment later — and
   * a shop that lists things it will not sell you is worse than one that lists
   * fewer things.
   */
  const sellables = useMemo<Sellable[]>(() => {
    const out: Sellable[] = [];
    for (const crate of op?.crates ?? []) {
      out.push({
        kind: 'crate',
        id: crate.id,
        label: crate.crateType === 'treasury_allocation' ? 'Treasury Allocation' : 'Equity Allocation',
        detail: 'Sealed',
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

  const buy = useCallback(
    async (listing: MarketListing) => {
      if (!wallet) return say('Connect a wallet first');
      setBusy(listing.id);
      try {
        // A purchase can raise a wallet prompt once the token is live, and a
        // panel that goes quiet while a wallet waits offscreen is a panel
        // people click again.
        const onStep: StepHandler = (step) =>
          say(step === 'submitting' ? 'Confirm in your wallet…' : 'Working…');
        const result = await api.marketBuy(wallet, listing.id, onStep);
        reload();
        await refresh();
        // Do not claim a clean sale when the seller's payout has not landed.
        say(result.sellerPaid === false ? 'Bought — seller payout pending' : 'Bought');
      } catch (e) {
        say(e instanceof Error ? e.message : 'Purchase failed');
      } finally {
        setBusy(null);
      }
    },
    [wallet, say, reload, refresh]
  );

  const cancel = useCallback(
    async (listing: MarketListing) => {
      if (!wallet) return;
      setBusy(listing.id);
      try {
        await api.marketCancel(wallet, listing.id);
        reload();
        await refresh();
        say('Listing cancelled');
      } catch (e) {
        say(e instanceof Error ? e.message : 'Could not cancel');
      } finally {
        setBusy(null);
      }
    },
    [wallet, say, reload, refresh]
  );

  const list = useCallback(
    async (pick: Sellable, priceGreen: number) => {
      if (!wallet || !Number.isFinite(priceGreen) || priceGreen <= 0) return false;
      setBusy('list');
      try {
        await api.marketList(wallet, pick.kind, pick.id, priceGreen);
        reload();
        await refresh();
        say('Listed');
        return true;
      } catch (e) {
        say(e instanceof Error ? e.message : 'Could not list that');
        return false;
      } finally {
        setBusy(null);
      }
    },
    [wallet, say, reload, refresh]
  );

  return { listings, others, mine, trades, sellables, feeBps, busy, note, buy, cancel, list, reload };
}
