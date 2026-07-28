// The pack: the thing you carry, and the only thing you can lose.
//
// Bought once with Scrip and kept forever. It is never dropped, never traded and
// never taken — what spills when you die is what was INSIDE it. That split is
// the whole safety model, and it is why the rule fits in one sentence: if it is
// in the pack it can be lost, and if it is at home it cannot.
//
// Capacity is the risk dial. A bigger pack does not make you stronger; it lets
// you stay out longer before you have to turn back, and it means more is sitting
// in it when somebody kills you. Deciding when to extract is the decision the
// pack exists to create, and every slot you add makes that decision harder.
//
// Priced in Scrip rather than BNTY because spendScrip already spends BOUND
// balance before BEARER. A player who earns Scrip from quests and streaks can
// supply and upgrade a pack forever without touching the token, while a player
// in a hurry can buy in — so the risk dial never becomes a paywall.

import { GameError } from './errors';

export interface PackTier {
  step: number;
  name: string;
  /** Stacks the pack can hold. One stack is one item type. */
  slots: number;
  /** Scrip to REACH this step from the one below. Step 1 is the initial purchase. */
  scripCost: number;
  /** One line, in the player's words, for the shop row. */
  blurb: string;
}

/**
 * The upgrade ladder, published in full.
 *
 * Three steps with a visible ceiling, matching how cosmetics are priced: a track
 * with a finish line is worth starting, and an open-ended one reads as a
 * treadmill.
 *
 * Costs rise far faster than slots do — the Phat Pack is roughly four times the
 * price of the Big Pack for two thirds more room, taking cost-per-slot from 167
 * to 1,200 across the ladder. The marginal slot is worth far more than the
 * first: a player deep in the forest with two slots left behaves completely
 * differently from one with fifteen, so the last few have to be paid for.
 */
export const PACK_TIERS: PackTier[] = [
  { step: 1, name: 'Pack', slots: 15, scripCost: 2_500, blurb: 'The standard run. Enough for a look around and a way back.' },
  { step: 2, name: 'Big Pack', slots: 30, scripCost: 14_000, blurb: 'Double the room. Stay out past the first substation.' },
  { step: 3, name: 'Phat Pack', slots: 50, scripCost: 60_000, blurb: 'Everything the forest will give up in one trip.' },
];

export const MAX_PACK_STEP = PACK_TIERS.length;
/** A wallet with no pack at all. */
export const NO_PACK = 0;

export function packTier(step: number): PackTier | null {
  return PACK_TIERS.find((tier) => tier.step === step) ?? null;
}

/** Slots at a given step. Zero when the player has never bought a pack. */
/**
 * Slots you have before you own anything: your pockets.
 *
 * Zero was wrong, and playing it found out how wrong. Woodcutting became
 * unreachable for a new player — the hatchet costs 400 Scrip and the cheapest
 * pack costs 2,500, so the first tool in the game was gated behind an item six
 * times its price, and the errand meant to get somebody moving could not be
 * started. Every chop answered "your pack is full" while carrying nothing.
 *
 * Four is enough for a handful of logs and useless for an expedition, which is
 * exactly the shape it should have. It does NOT make you packed: `hasPack` is
 * still step >= 1, so the Treeline and the Deep Forest are unchanged and the
 * pack keeps its real job — being the thing you can lose.
 */
export const POCKET_SLOTS = 4;

export function packSlots(step: number): number {
  return packTier(step)?.slots ?? POCKET_SLOTS;
}

export const hasPack = (step: number): boolean => step >= 1;

/** The next step up, or null at the ceiling. */
export function nextPackTier(step: number): PackTier | null {
  return packTier(step + 1);
}

/**
 * Scrip to go from `step` to the next one.
 *
 * Returns null at the ceiling rather than 0, so a caller cannot mistake "already
 * maxed" for "free" and charge nothing for an upgrade that should not happen.
 */
export function packUpgradeCost(step: number): number | null {
  return nextPackTier(step)?.scripCost ?? null;
}

/** Total Scrip sunk to reach `step` from nothing, for the shop's ladder view. */
export function packTotalCost(step: number): number {
  return PACK_TIERS.filter((tier) => tier.step <= step).reduce((sum, tier) => sum + tier.scripCost, 0);
}

/**
 * Validate an upgrade before any balance is touched.
 *
 * Throws rather than returning a flag because every caller is a route that must
 * refuse, and a boolean that one caller forgets to check is how a player ends up
 * with a free tier. GameError carries the player-facing sentence.
 */
export function assertCanUpgradePack(step: number): PackTier {
  const next = nextPackTier(step);
  if (!next) {
    throw new GameError(`Your ${packTier(step)?.name ?? 'pack'} is already the largest there is.`, 400);
  }
  return next;
}

// ---------------------------------------------------------------------------
// What a pack is carrying
// ---------------------------------------------------------------------------

/**
 * Item classes that may be carried, and therefore may be lost.
 *
 * An allowlist, not a denylist. The safety model depends on knowing exactly what
 * can enter a hostile region, and a denylist fails open — every item type added
 * later would be carryable, and losable, until somebody remembered to exclude
 * it. Adding a class here is a deliberate decision to put it at risk.
 */
export type CarryClass =
  | 'scrip'
  | 'component'
  | 'salvage'
  | 'ammo'
  | 'consumable'
  | 'weapon'
  /** Crafted parts -- a desk frame, and whatever the bench makes next. */
  | 'material';

export const CARRIABLE: readonly CarryClass[] = [
  'scrip',
  'component',
  'salvage',
  'ammo',
  'consumable',
  // Carried, and therefore droppable. A crafted part is worth what the wood in
  // it was worth, so it travels under the same rule as the wood did.
  'material',
  /**
   * Weapons are carried, and therefore droppable.
   *
   * The alternative — a weapon that survives death — was tempting and wrong. It
   * would make the gun the one thing in the zone with no downside to bringing,
   * so everyone would always carry their best one and the ammo scarcity in
   * docs/greenwood-turn.md would be the only brake left. Losing the weapon is
   * what makes taking the good one out a decision.
   *
   * Melee is craftable and cheap to replace, so this bites hardest on firearms,
   * which is exactly where the design wants the pressure.
   */
  'weapon',
] as const;

/**
 * Everything that may never be carried, with the reason.
 *
 * Kept as data so the refusal message can name the actual reason instead of a
 * generic "you cannot do that", and so the list is reviewable in one place
 * rather than inferred from wherever the checks happen to live.
 */
export const NOT_CARRIABLE: Record<string, string> = {
  pack: 'Your pack is part of you. It does not come off.',
  cosmetic: 'Cosmetics stay on you — they are between you and the market, not you and the forest.',
  mount: 'Mounts stay on you — they are between you and the market, not you and the forest.',
  desk: 'A desk installed on your floor is not something you can carry. Nothing on your floor is ever at risk.',
  fitted_instrument: 'That instrument is fitted to a desk. Unfit it first if you really mean to take it out there.',
  note: 'A Fixed Income Note is a position, not an object.',
  bnty: 'BNTY stays in your fund. Only Scrip travels.',
};

export const isCarriable = (kind: string): kind is CarryClass =>
  (CARRIABLE as readonly string[]).includes(kind);

export interface CarriedStack {
  kind: CarryClass;
  /** What it is — an instrument id, a salvage key, or 'scrip'. */
  ref: string;
  quantity: number;
}

/**
 * Whether a pack at `step` can accept another stack.
 *
 * Counts STACKS, not units, so a hundred rounds of ammunition is one slot. That
 * keeps the interesting decision on variety — do I take the generator core or
 * three instruments — rather than on arithmetic.
 */
export function packHasRoom(step: number, carried: CarriedStack[], incoming: CarriedStack): boolean {
  const existing = carried.find((stack) => stack.kind === incoming.kind && stack.ref === incoming.ref);
  if (existing) return true; // merges into a stack already occupying a slot
  return carried.length < packSlots(step);
}

/** Slots used and free, for the pack HUD. */
export function packUsage(step: number, carried: CarriedStack[]): { used: number; slots: number; free: number } {
  const slots = packSlots(step);
  return { used: carried.length, slots, free: Math.max(0, slots - carried.length) };
}
