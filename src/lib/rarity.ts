// GPU rarity system — 7 component tiers + 10 node aura levels.
// Multipliers/colors match the original game spec (ORS MODELS/rarity_system.js).

import { AURA_TIERS, auraLabel } from './aura';

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

/** Renderer-only glow strength per aura level. Declared before AURA_LEVELS,
 *  which reads it at module init. */
const AURA_BLOOM: Record<number, number> = {
  1: 0.05, 2: 0.1, 3: 0.15, 4: 0.2, 5: 0.3, 6: 0.4, 7: 0.55, 8: 0.7, 9: 0.9, 10: 1.2,
};

/**
 * Level aura tiers, derived from the single table in ./aura so the ring under a
 * rig, the guide's aura legend, and the level chip cannot drift apart. Bloom is
 * this file's concern (it only means anything to the renderer); name and colour
 * are not restated here.
 */
export const AURA_LEVELS: Record<number, { name: string; color: number; bloom: number }> =
  Object.fromEntries(
    Object.entries(AURA_TIERS).map(([level, tier]) => [
      Number(level),
      {
        name: auraLabel(Number(level)),
        color: Number.parseInt(tier.color.slice(1), 16),
        bloom: AURA_BLOOM[Number(level)] ?? 0.05,
      },
    ])
  );

export type NodeFamily = 'oil' | 'mine';

export const NODE_SLOTS: Record<NodeFamily, string[]> = {
  oil: ['derrick', 'pump_jack', 'pipeline', 'flare_stack'],
  mine: ['drill_bit', 'ore_cart', 'rail_track', 'elevator'],
};

export const SLOT_LABELS: Record<string, string> = {
  derrick: 'Lithography Machine',
  pump_jack: 'Wafer Stack',
  pipeline: 'Etch Chamber',
  flare_stack: 'Power Bus',
  drill_bit: 'Dicing Saw',
  ore_cart: 'Packaging Line',
  rail_track: 'Test Handler',
  elevator: 'Cooling Array',
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
