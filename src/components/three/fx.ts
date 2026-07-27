// Rarity visual-FX tables — ported from the original deployed build
// (reverse-engineered constants; 7-element arrays indexed by tier 0..6:
// common, uncommon, rare, epic, legendary, mythic, divine).

import { RARITIES, rarityHex, type Rarity } from '@/lib/rarity';

export const RARITY_ORDER = RARITIES;

/**
 * Rarity colour for every renderer surface — model tint, motes, point lights,
 * aura. Derived from the canonical table rather than restated: this used to be
 * its own palette, so a legendary component was gold on the model and orange
 * everywhere the UI mentioned it.
 */
export const RARITY_COLOR: Record<Rarity, string> = Object.fromEntries(
  RARITIES.map((rarity) => [rarity, rarityHex(rarity)])
) as Record<Rarity, string>;

export const ACCENT_COLOR: Record<Rarity, string> = {
  common: '#6b7280',
  uncommon: '#16a34a',
  rare: '#1d4ed8',
  epic: '#7c3aed',
  legendary: '#b45309',
  mythic: '#0a0a0a',
  divine: '#fff7d6',
};

export const BODY_TINT = [0, 0.12, 0.26, 0.42, 0.58, 0.74, 0.9];
export const MOTION_SPEED = [0.8, 1.1, 1.5, 2.1, 2.9, 4, 5.4];
export const PULSE_AMP = [0.03, 0.07, 0.12, 0.18, 0.25, 0.34, 0.45];
export const PULSE_SPEED = [0.6, 0.9, 1.2, 1.6, 2.1, 2.7, 3.4];
export const RIM_INTENSITY = [0, 1.6, 2.6, 3.6, 4.6, 4, 4.6];
export const RIM_POWER = [1, 3.4, 3, 2.7, 2.4, 2.1, 2.3];
export const SLOT_BODY_TINT = [0, 0.4, 0.52, 0.64, 0.76, 0.8, 0.82];
export const STRUCT_BODY_TINT = [0, 0.55, 0.66, 0.74, 0.8, 0.84, 0.88];
export const SWEEP_INTENSITY = [0, 0, 0, 0.8, 1.3, 1.7, 2.2];

export const GLOW = [0, 0.7, 1.4, 2.3, 3.3, 4.2, 5.2];
export const LIGHT = [0, 0.6, 1.3, 2.2, 3.2, 4, 4.8];
export const MOTES = [0, 4, 12, 22, 32, 40, 52];
export const MOTE_SPEED = [0, 0, 0.2, 0.3, 0.4, 0.55, 0.7];
export const METAL = [0, 0.05, 0.12, 0.22, 0.34, 0.5, 0.66];
export const ROUGH = [0, 0.04, 0.1, 0.18, 0.28, 0.4, 0.52];

export const STRUCT_FACTORS = {
  tower: { tint: 1, rim: 0.8, emissive: 0.18 },
  base: { tint: 0.92, rim: 0.5, emissive: 0.12 },
} as const;

export function rarityTier(r: Rarity | string): number {
  const i = RARITY_ORDER.indexOf(r as Rarity);
  return Math.max(0, i);
}

export function rimColor(r: Rarity): string {
  return r === 'divine' ? '#fff4d6' : RARITY_COLOR[r] ?? '#9ca3af';
}

export interface RarityFxRecord {
  color: string;
  accent: string;
  glow: number;
  light: number;
  motes: number;
  moteSpeed: number;
  metal: number;
  rough: number;
}

export function rarityFx(r: Rarity): RarityFxRecord {
  const t = rarityTier(r);
  return {
    color: RARITY_COLOR[r],
    accent: ACCENT_COLOR[r],
    glow: GLOW[t],
    light: LIGHT[t],
    motes: MOTES[t],
    moteSpeed: MOTE_SPEED[t],
    metal: METAL[t],
    rough: ROUGH[t],
  };
}

// Level "era" theming — node level 1..10 changes the material character of the
// whole rig (rough steel -> reinforced -> hightech -> gold prestige).
export interface LevelTheme {
  era: 'rough' | 'reinforced' | 'hightech' | 'prestige';
  pigment: string;
  pigmentTint: number;
  metal: number;
  rough: number;
  emissive: number;
  ring: number;
  scale: number;
}

export function levelTheme(levelIn: number): LevelTheme {
  const level = Math.min(10, Math.max(1, levelIn));
  const scale = 0.95 + (level - 1) * 0.026;
  if (level >= 10)
    return { era: 'prestige', pigment: '#d9a93a', pigmentTint: 0.34, metal: 0.5, rough: 0.42, emissive: 0.5, ring: 1, scale };
  if (level >= 7)
    return { era: 'hightech', pigment: '#79e0b0', pigmentTint: 0.14, metal: 0.45, rough: 0.45, emissive: 0.2, ring: 0.7, scale };
  if (level >= 4)
    return { era: 'reinforced', pigment: '#7d756a', pigmentTint: 0.12, metal: 0.46, rough: 0.54, emissive: 0.06, ring: 0.45, scale };
  return { era: 'rough', pigment: '#6a655c', pigmentTint: 0.18, metal: 0.18, rough: 0.82, emissive: 0, ring: 0, scale };
}
