// GREEN instrument rarity — seven tiers, and the multiplier each one is worth.
//
// Desk GRADES are a separate idea and live in lib/aura: rarity is what an
// instrument rolled, grade is how far a desk has been levelled. They were
// tangled here because the previous game drew both as glows.

export type Rarity =
  | 'common'
  | 'uncommon'
  | 'rare'
  | 'epic'
  | 'legendary'
  | 'mythic'
  | 'divine';

export const RARITIES: Rarity[] = [
  'common',
  'uncommon',
  'rare',
  'epic',
  'legendary',
  'mythic',
  'divine',
];

export interface RarityDef {
  multiplier: number;
  tint: number;
  emissive: number;
  emitStrength: number;
  bloom: number;
  aura: number | null;
  label: string;
}

/**
 * Canonical rarity table. `tint` is THE colour for a rarity — models, auras,
 * ring accents, guide legends and inventory chips all resolve back to it.
 *
 * Previously three tables disagreed on every single rarity (fx.RARITY_COLOR,
 * this tint, and a separate aura colour), so a legendary component rendered
 * gold on the model, orange in the UI, and a third gold in its aura. Anything
 * that needs a rarity colour must derive it from here rather than restate it.
 */
export const COMPONENT_RARITIES: Record<Rarity, RarityDef> = {
  common:    { multiplier: 1.0,  tint: 0xb0b0b0, emissive: 0x000000, emitStrength: 0,    bloom: 0,    aura: null,     label: 'Common' },
  uncommon:  { multiplier: 1.3,  tint: 0x4dd94d, emissive: 0x1a5c1a, emitStrength: 0.2,  bloom: 0.08, aura: 0x4dd94d, label: 'Uncommon' },
  rare:      { multiplier: 1.6,  tint: 0x4d80ff, emissive: 0x2244aa, emitStrength: 0.4,  bloom: 0.15, aura: 0x4d80ff, label: 'Rare' },
  epic:      { multiplier: 2.0,  tint: 0xb34dff, emissive: 0x6611a0, emitStrength: 0.7,  bloom: 0.3,  aura: 0xb34dff, label: 'Epic' },
  legendary: { multiplier: 2.5,  tint: 0xffd900, emissive: 0xff8800, emitStrength: 1.0,  bloom: 0.5,  aura: 0xffd900, label: 'Legendary' },
  mythic:    { multiplier: 3.5,  tint: 0xff3333, emissive: 0xff2200, emitStrength: 1.5,  bloom: 0.75, aura: 0xff3333, label: 'Mythic' },
  divine:    { multiplier: 5.0,  tint: 0xffffff, emissive: 0xeeeeff, emitStrength: 2.5,  bloom: 1.2,  aura: 0xffffff, label: 'Divine' },
};

/*
 * AURA_LEVELS and its AURA_BLOOM table lived here and were dead.
 *
 * They existed for "the ring under a rig" — a glow the previous game drew in
 * 3D under each machine, from a scene that has since been deleted. Nothing
 * imported them. They survived the reskin because a per-level record of colours
 * and bloom strengths looks like configuration somebody depends on, which is
 * exactly how dead code outlives the thing it was written for.
 *
 * Grades now live entirely in lib/aura as five bands, and the only consumers
 * are DOM chips. If a renderer ever wants a glow again it should read the band
 * colour rather than a parallel table, since two tables are how the ring and
 * the chip drift apart.
 */

export type NodeFamily = 'oil' | 'mine';

export const NODE_SLOTS: Record<NodeFamily, string[]> = {
  oil: ['derrick', 'pump_jack', 'pipeline', 'flare_stack'],
  mine: ['instrument', 'ore_cart', 'rail_track', 'elevator'],
};

/**
 * What a player sees in an instrument socket.
 *
 * The KEYS are stored in `components.slot` and stay as they are — they are the
 * oldest layer in the codebase and renaming them is a data migration for no
 * player-visible gain. The LABELS are display strings and were, until now, the
 * loudest surviving leak in the game: a level-one operator opening their first
 * allocation in a fund-management game was told they had received a
 * "Lithography Machine".
 *
 * That is worse than an inconsistency, because it leaks the turn early. The
 * reveal is supposed to land between levels three and ten, environmentally —
 * and industrial hardware named on the character sheet gets there first and
 * without the atmosphere that makes it worth anything.
 *
 * So these read as trading infrastructure, and each is a word that would also
 * be at home on a generator: a rail, a feed, an engine, a buffer. That
 * ambiguity is the point. Nothing here is a lie a player can catch, and nothing
 * here answers the question before the world does.
 */
export const SLOT_LABELS: Record<string, string> = {
  derrick: 'Execution Terminal',
  pump_jack: 'Order Router',
  pipeline: 'Market Data Feed',
  flare_stack: 'Settlement Rail',
  instrument: 'Custody Module',
  ore_cart: 'Coupon Engine',
  rail_track: 'Maturity Ladder',
  elevator: 'Liquidity Buffer',
};

/** Average multiplier across 4 slots; empty slots count as 1.0x. */
export function computeNodeMultiplier(slotRarities: (Rarity | null | undefined)[]): number {
  const filled = [...slotRarities];
  while (filled.length < 4) filled.push(null);
  return (
    filled.reduce<number>((sum, r) => sum + (r ? COMPONENT_RARITIES[r].multiplier : 1.0), 0) / 4
  );
}

export function rarityHex(r: Rarity): string {
  return `#${COMPONENT_RARITIES[r].tint.toString(16).padStart(6, '0')}`;
}
