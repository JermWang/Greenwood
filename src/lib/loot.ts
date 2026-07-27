// Loot piles: what spills when you die, and who is allowed to know what is in it.
//
// The pack itself never drops (see lib/packs) — its CONTENTS do, as a plain pile
// on the ground with no owner and no reservation. Anyone may take it. The only
// protection a pile has is that nobody can see inside it from a distance.
//
// That last point is a server rule, not a UI rule, and the distinction is the
// entire reason this module exists. If the contents ship to every client that
// can see the pile and the client merely declines to draw them, then anyone
// running a patched client reads every pile on the map from cover — and the walk
// up to a pile, which is the moment you are most exposed and the only moment you
// can be ambushed, stops being a decision anybody has to make. Approach is
// supposed to BE the commitment. So contents are withheld at the source and a
// pile a player is not standing next to is returned with its items stripped.

import type { CarriedStack } from './packs';

/**
 * How close you must be to read a pile, in tiles.
 *
 * One tile — genuinely adjacent, including diagonals. Wide enough that you do
 * not have to land on the exact cell, tight enough that reading a pile means
 * standing over it in the open.
 */
export const LOOT_PEEK_RANGE = 1;

/**
 * How long a pile lasts before the forest takes it back.
 *
 * Long enough that a fight can finish and the winner can loot at leisure; short
 * enough that a region does not silently accumulate every death since launch as
 * permanent free supply. Fifteen minutes.
 */
export const LOOT_DESPAWN_MS = 15 * 60 * 1000;

export interface LootPile {
  id: string;
  regionId: string;
  x: number;
  z: number;
  /** Wallet that died here. Recorded for the kill feed, NOT for access control. */
  droppedBy: string;
  droppedAt: number;
  contents: CarriedStack[];
}

/**
 * What a client is allowed to know about a pile.
 *
 * Two shapes, and only two: near enough to read it, or not. `contents` is absent
 * rather than empty when out of range, so a caller cannot confuse "I looked and
 * it was empty" with "I was not allowed to look" — those mean opposite things to
 * a player deciding whether to walk over.
 */
export interface VisiblePile {
  id: string;
  x: number;
  z: number;
  droppedAt: number;
  /** True once the viewer is close enough for `contents` to be populated. */
  readable: boolean;
  /** Only ever present when `readable`. */
  contents?: CarriedStack[];
}

/** Chebyshev distance, so diagonals count as adjacent like every other check. */
const tilesApart = (ax: number, az: number, bx: number, bz: number) =>
  Math.max(Math.abs(ax - bx), Math.abs(az - bz));

export const canPeek = (pile: LootPile, x: number, z: number): boolean =>
  tilesApart(pile.x, pile.z, x, z) <= LOOT_PEEK_RANGE;

export const hasExpired = (pile: LootPile, now: number): boolean =>
  now - pile.droppedAt >= LOOT_DESPAWN_MS;

/**
 * Strip a pile down to what this viewer may see.
 *
 * The single place contents are attached to a response. Every read path must go
 * through here — a route that serialises a LootPile directly hands the client
 * the contents of every pile in the region, which is the exact failure this
 * module exists to prevent.
 */
export function visibleTo(pile: LootPile, viewer: { x: number; z: number }): VisiblePile {
  const readable = canPeek(pile, viewer.x, viewer.z);
  const seen: VisiblePile = {
    id: pile.id,
    x: pile.x,
    z: pile.z,
    droppedAt: pile.droppedAt,
    readable,
  };
  if (readable) seen.contents = pile.contents;
  return seen;
}

/**
 * Every pile in a region, as this viewer may see it.
 *
 * Expired piles are filtered here rather than by a sweeper, so a pile is gone
 * the moment it should be even if nothing has run a cleanup pass. A background
 * sweep can still reclaim the rows; it just is not what correctness depends on.
 */
export function pilesVisibleTo(
  piles: LootPile[],
  viewer: { x: number; z: number },
  now: number
): VisiblePile[] {
  return piles.filter((pile) => !hasExpired(pile, now)).map((pile) => visibleTo(pile, viewer));
}

/**
 * Take stacks out of a pile into a pack with limited room.
 *
 * Returns what moved, what is left behind, and why it stopped. Partial looting
 * is the normal case, not an error: a full pack standing over a rich pile is one
 * of the better decisions in the loop, and the player has to be told clearly
 * that the rest is staying on the ground for whoever comes next.
 *
 * Pure, and takes capacity as a number, so the rule can be tested without a
 * database and asserted identically on the client's optimistic pass.
 */
export function takeFromPile(
  pile: LootPile,
  wanted: CarriedStack[],
  pack: { slots: number; carried: CarriedStack[] }
): { taken: CarriedStack[]; remaining: CarriedStack[]; full: boolean } {
  const carried = pack.carried.map((stack) => ({ ...stack }));
  const remaining = pile.contents.map((stack) => ({ ...stack }));
  const taken: CarriedStack[] = [];
  let full = false;

  for (const want of wanted) {
    const index = remaining.findIndex((stack) => stack.kind === want.kind && stack.ref === want.ref);
    if (index === -1) continue;

    const existing = carried.find((stack) => stack.kind === want.kind && stack.ref === want.ref);
    if (!existing && carried.length >= pack.slots) {
      full = true;
      continue;
    }

    const stack = remaining[index];
    const quantity = Math.min(stack.quantity, want.quantity);
    if (quantity <= 0) continue;

    if (existing) existing.quantity += quantity;
    else carried.push({ kind: stack.kind, ref: stack.ref, quantity });

    taken.push({ kind: stack.kind, ref: stack.ref, quantity });
    stack.quantity -= quantity;
    if (stack.quantity <= 0) remaining.splice(index, 1);
  }

  return { taken, remaining, full };
}
