// How a listing describes itself, in one place.
//
// The Exchange page grew these as local helpers, and then the market panel in
// the HUD needed exactly the same four answers: what is this, what makes this
// copy worth more than that one, what colour is it, and who is selling it. Two
// copies of "an Epic Order Router is 2.0x" is two places for that to stop being
// true — and this codebase has a test whose entire job is catching the second
// copy of something (see codebase.test.ts).
//
// The BOARD, not the item. These read a listing's `item` payload, which the
// server fills in from whichever table the kind points at (see describeItem in
// lib/market). Everything here treats that payload as possibly absent or
// possibly wrong-shaped, because it comes back from a route as
// Record<string, unknown> and a listing whose underlying row has gone should
// render as something rather than throw the board away.

import { COMPONENT_RARITIES, SLOT_LABELS, rarityHex, type Rarity } from './rarity';
import { auraHex, auraLabel } from './aura';

/** The shape this module needs. Deliberately narrower than MarketListing. */
export interface ListingLike {
  itemKind: string;
  seller: string;
  sellerName?: string | null;
  item: Record<string, unknown> | null;
}

const fields = (listing: ListingLike) =>
  (listing.item ?? {}) as Record<string, string | number | undefined>;

/** What the thing IS. One line, no rarity or level — that is the subtitle's job. */
export function listingTitle(listing: ListingLike): string {
  const item = fields(listing);
  if (listing.itemKind === 'crate') {
    return item.crate_type === 'treasury_allocation'
      ? 'Treasury Allocation'
      : 'Equity Allocation';
  }
  if (listing.itemKind === 'component') {
    return SLOT_LABELS[String(item.slot)] ?? String(item.slot ?? 'Instrument');
  }
  if (listing.itemKind === 'cosmetic') {
    return String(item.name ?? item.cosmetic_key ?? 'Cosmetic');
  }
  return item.family === 'mine' ? 'Treasury Desk' : 'Equity Desk';
}

/**
 * What makes THIS copy worth what it is being asked for.
 *
 * Every branch leads with the thing a buyer is actually pricing: rarity and its
 * multiplier for an instrument, rank for a cosmetic, level for a desk. "Epic"
 * on its own is a word; "Epic · 3.6x" is the reason for the price.
 */
export function listingSubtitle(listing: ListingLike): string {
  const item = fields(listing);
  if (listing.itemKind === 'crate') return 'Unopened';
  if (listing.itemKind === 'component') {
    const rarity = item.rarity as Rarity | undefined;
    const def = rarity ? COMPONENT_RARITIES[rarity] : undefined;
    return def ? `${def.label} · ${def.multiplier}×` : String(rarity ?? 'Instrument');
  }
  if (listing.itemKind === 'cosmetic') {
    return `${item.rank ?? 'Stock'} · rank ${Number(item.upgrade_level) || 0}/5`;
  }
  const level = Number(item.level) || 1;
  return `L${level} · ${auraLabel(level)}`;
}

/**
 * The colour this listing is drawn in.
 *
 * Rarity for instruments, the aura ramp for desks, and amber for everything
 * with no scale of its own. The point is that the colour on a listing row is
 * the SAME colour the thing is tinted with in the world, so an item you have
 * seen on a floor is recognisable on the board without reading it.
 */
export function listingAccent(listing: ListingLike): string {
  const item = fields(listing);
  if (listing.itemKind === 'node') return auraHex(Number(item.level) || 1);
  const rarity = item.rarity as Rarity | undefined;
  if (rarity && COMPONENT_RARITIES[rarity]) return rarityHex(rarity);
  return '#f5a623';
}

/**
 * Who is selling, as a person where possible.
 *
 * A shortened address is a fallback, not a name — it is what somebody who has
 * not set a profile gets, and what everybody gets if the registry is down.
 * Clamped because a display name is player-chosen and a long one would push
 * the price off a narrow row.
 */
export function sellerLabel(listing: ListingLike): string {
  const name = listing.sellerName?.trim();
  if (name) return name.slice(0, 22);
  return `${listing.seller.slice(0, 6)}…${listing.seller.slice(-4)}`;
}
