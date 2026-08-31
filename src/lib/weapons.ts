// What a weapon does when you swing it.
//
// NO IMPORTS THAT REACH A DATABASE. The renderer needs these numbers to draw a
// weapon and label it, the server needs them to resolve a hit, and the market
// needs them to describe a lot. Same discipline as lib/packs and lib/shards.
//
// THIS IS THE THING creatures.ts WAS WAITING FOR. UNARMED_DAMAGE carried a note
// saying it was "deliberately not a weapon lookup — weapons are a carriable
// class but have no stats yet, so anything reading them would be inventing
// numbers. When they land, this is the one place that changes." They have
// landed. Crossbows were craftable, carriable and droppable, and did nothing at
// all; axes had a `damage` field that only ever felled trees.
//
// FELLING DAMAGE IS NOT COMBAT DAMAGE, and the two are deliberately separate
// numbers. AXES already carry a `damage` used against tree health, and reusing
// it here would have silently coupled the woodcutting ladder to the combat
// ladder: retuning how long an oak takes would change how many swings a
// shambler takes. They are different questions and they get different columns.
//
// The ladder is tuned against what is actually out there — a shambler is 60
// health and hits for 18 on a 2.2s cadence, a wolf is 28 and hits for 7 on
// 0.9s, and a player has 100. Unarmed at 12 means five swings on a shambler and
// four bites back, which is the fight a weapon is supposed to fix.

import { AXES, type AxeId } from './woodcutting';

export type WeaponClass = 'axe' | 'crossbow';

export interface Weapon {
  id: string;
  name: string;
  weaponClass: WeaponClass;
  /** Shares the crafting ladder's tier, so 4 is ironbark in both places. */
  tier: number;
  /** Damage per hit, against creatures and players alike. */
  damage: number;
  /**
   * How far it reaches, in tiles.
   *
   * The real difference between melee and ranged, and the reason a crossbow is
   * worth feeding. A shambler reaches 1 tile: at reach 4 it cannot answer you
   * at all, so the fight stops being a trade of blows and becomes a question of
   * whether you brought enough bolts.
   */
  reach: number;
  /** The pack ref this weapon consumes per shot, if any. */
  ammo: string | null;
  blurb: string;
}

/**
 * Melee, and the same four rungs the axe shop already sells.
 *
 * Deliberately NOT a separate set of weapons. An axe is the tool a player
 * already owns and already upgraded for wood, and discovering that it also
 * swings at a shambler is a better moment than being sold a sword — it makes
 * the woodcutting ladder mean something outdoors without adding a second
 * economy to climb.
 */
const AXE_COMBAT: Record<AxeId, { damage: number; blurb: string }> = {
  hatchet: { damage: 18, blurb: 'Short, light, and better than your hands.' },
  felling: { damage: 24, blurb: 'Two hands. Three swings puts a shambler down.' },
  splitting: { damage: 30, blurb: 'Heavy head. It does not get stuck.' },
  'ironbark-axe': { damage: 38, blurb: 'Ironbark through ironbark. Two swings, most things.' },
};

/**
 * Ranged, from the crafting bench.
 *
 * Every one costs a bolt per shot. That is the design's own limiter — "ranged
 * weapons be limited by ammunition rather than by rate of fire"
 * (docs/evergreen-turn.md) — and it is what turns ironbark from a one-off craft
 * into something worth going back for.
 */
const CROSSBOWS: Array<Omit<Weapon, 'weaponClass'>> = [
  {
    id: 'hunting-crossbow',
    name: 'Hunting Crossbow',
    tier: 2,
    damage: 26,
    reach: 4,
    ammo: 'ironbark-bolts',
    blurb: 'Oak stock, steel prod. Three tiles further than anything can reach back.',
  },
  {
    id: 'heavy-crossbow',
    name: 'Heavy Crossbow',
    tier: 3,
    damage: 34,
    reach: 5,
    ammo: 'ironbark-bolts',
    blurb: 'Slow to span. It does not care what it is pointed at.',
  },
  {
    id: 'ironbark-crossbow',
    name: 'Ironbark Crossbow',
    tier: 4,
    damage: 44,
    reach: 6,
    ammo: 'ironbark-bolts',
    blurb: 'Ironbark prod. One bolt is usually the whole conversation.',
  },
];

/** Every weapon in the game, by id. */
export const WEAPONS: Record<string, Weapon> = {
  ...Object.fromEntries(
    Object.values(AXES).map((axe) => [
      axe.id,
      {
        id: axe.id,
        name: axe.name,
        weaponClass: 'axe' as const,
        tier: axe.tier,
        damage: AXE_COMBAT[axe.id].damage,
        // Melee is the same one tile a shambler has. Reaching further with an
        // axe than a creature can bite would remove the whole reason to want a
        // crossbow.
        reach: 1,
        ammo: null,
        blurb: AXE_COMBAT[axe.id].blurb,
      },
    ])
  ),
  ...Object.fromEntries(
    CROSSBOWS.map((bow) => [bow.id, { ...bow, weaponClass: 'crossbow' as const }])
  ),
};

export const ALL_WEAPONS: Weapon[] = Object.values(WEAPONS);

export function weaponById(id: string | null | undefined): Weapon | null {
  return id ? WEAPONS[id] ?? null : null;
}

/** True for a ref the pack should treat as a weapon. Used by the market too. */
export function isWeaponRef(ref: string): boolean {
  return Object.hasOwn(WEAPONS, ref);
}

/**
 * The best of what a player is holding.
 *
 * Takes the axe they own and the refs in their pack rather than reading either,
 * so this module stays free of the database and can be tested on plain data.
 *
 * BEST BY DAMAGE, and a crossbow with no bolts is not a candidate at all — it
 * is an empty weapon, and picking it would leave a player swinging a stock at a
 * wolf while a perfectly good axe sat in their hand. `hasAmmo` is passed in for
 * the same reason the refs are.
 */
export function bestWeapon(
  axe: string | null | undefined,
  packRefs: readonly string[],
  hasAmmo: boolean
): Weapon | null {
  const candidates: Weapon[] = [];
  const owned = weaponById(axe);
  if (owned) candidates.push(owned);
  for (const ref of packRefs) {
    const weapon = weaponById(ref);
    if (!weapon) continue;
    if (weapon.ammo && !hasAmmo) continue;
    candidates.push(weapon);
  }
  if (!candidates.length) return null;
  return candidates.reduce((best, w) => (w.damage > best.damage ? w : best));
}
