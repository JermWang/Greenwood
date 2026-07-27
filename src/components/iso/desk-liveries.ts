// How each desk and plinth cosmetic changes the model — the data, no JSX.
//
// Split out of DeskModels.tsx for the same reason avatar-skins.ts was split out
// of Character.tsx: the test suite runs under `jsx: preserve` and cannot import
// a .tsx file, so nothing could check that a purchasable livery is actually
// drawn. That check matters more here than anywhere else in the catalogue,
// because the failure is completely silent — the player buys a livery, equips
// it, and their floor looks exactly the same.
//
// It was also already happening. The render points used to compare the equipped
// key against string literals (`livery?.desk === 'desk_brushed_steel'`), so
// every livery added to lib/cosmetics without someone remembering to add a
// matching branch here was invisible by construction.
//
// Each entry describes the livery in terms the renderer understands, rather than
// naming it. A new livery that is a recolour is now a row in this file; only a
// livery needing genuinely new geometry needs a change in the component.

import { ISO } from './palette';

/** A physically-shaded surface, with an optional response to the polish track. */
export interface LiverySurface {
  color: string;
  roughness: number;
  metalness: number;
  /** How much of `roughness` is removed at full refinement. */
  polishRoughness?: number;
  /** How much is ADDED to `metalness` at full refinement. */
  polishMetalness?: number;
}

/** Extra geometry a livery can ask for, beyond recolouring what is already there. */
export type DeskFeature =
  /** A lit band round the foot of the body. */
  | 'band'
  /** Stepped bars climbing one face of the housing. */
  | 'candles'
  /** A thin crawl strip wrapping the base. */
  | 'crawl'
  /** Mismatched panel patches and a taped seam. */
  | 'patches';

export interface DeskLiveryDef {
  /** Replaces the painted body panel. Absent leaves the default paint. */
  body?: LiverySurface;
  feature?: DeskFeature;
  /** Colour for whatever `feature` draws. */
  featureColor?: string;
  /** Whether the feature is emissive. A lit strip needs to read at night. */
  featureLit?: boolean;
}

export type PlinthFeature = 'plate' | 'chevrons' | 'slats' | 'trench';

export interface PlinthLiveryDef {
  /** Replaces the plinth's own surface. */
  surface?: LiverySurface;
  feature?: PlinthFeature;
  featureColor?: string;
}

/**
 * Every desk livery, keyed exactly as in lib/cosmetics.
 *
 * cosmetics-catalog.test.ts fails if a `desk`-slot cosmetic has no row here.
 */
export const DESK_LIVERIES: Record<string, DeskLiveryDef> = {
  desk_brushed_steel: {
    body: { color: '#c3c0b8', roughness: 0.46, metalness: 0.5, polishRoughness: 0.3, polishMetalness: 0.42 },
  },
  desk_neon_trim: {
    feature: 'band',
    featureColor: ISO.accent,
    featureLit: true,
  },
  desk_ticker_tape: {
    feature: 'crawl',
    featureColor: ISO.amber,
    featureLit: true,
  },
  desk_green_candles: {
    feature: 'candles',
    featureColor: ISO.bright,
    featureLit: true,
  },
  desk_field_repair: {
    // Deliberately the drabbest thing in the shop. It is the piece that reads
    // completely differently after the turn — an ironic "honest work" skin now,
    // and simply what the machines look like out past the fence later.
    body: { color: '#6d6a61', roughness: 0.92, metalness: 0.04 },
    feature: 'patches',
    featureColor: '#8a8378',
  },
  desk_gm: {
    feature: 'band',
    featureColor: '#e8d9a0',
    featureLit: true,
  },
};

/** Every plinth livery, keyed exactly as in lib/cosmetics. */
export const PLINTH_LIVERIES: Record<string, PlinthLiveryDef> = {
  plinth_marble: {
    surface: { color: '#d8d5cd', roughness: 0.35, metalness: 0.04, polishRoughness: 0.2 },
  },
  plinth_founders: {
    // Sits UNDER the plinth rather than replacing it: the shop calls it "an
    // engraved plate under every desk", and a cosmetic that does something other
    // than what it sold is worse than none.
    feature: 'plate',
    featureColor: '#c9a227',
  },
  plinth_astroturf: {
    surface: { color: '#4f7a3a', roughness: 0.98, metalness: 0 },
  },
  plinth_pallet: {
    surface: { color: '#8a6b42', roughness: 0.95, metalness: 0.02 },
    feature: 'slats',
    featureColor: '#6d5333',
  },
  plinth_hazard_deck: {
    surface: { color: '#5e5b54', roughness: 0.85, metalness: 0.06 },
    feature: 'chevrons',
    featureColor: ISO.amber,
  },
  plinth_substation: {
    surface: { color: '#8d8a82', roughness: 0.9, metalness: 0.05 },
    feature: 'trench',
    featureColor: '#3a382f',
  },
};

/**
 * Resolve a surface against the refinement track.
 *
 * `polish` runs 0 to 1. A livery that declares no polish response simply ignores
 * it, which is what keeps a matte finish matte no matter how far it is refined —
 * Astroturf should never become glossy.
 */
export function resolveSurface(surface: LiverySurface, polish: number) {
  return {
    color: surface.color,
    roughness: Math.max(0, surface.roughness - (surface.polishRoughness ?? 0) * polish),
    metalness: Math.min(1, surface.metalness + (surface.polishMetalness ?? 0) * polish),
  };
}
