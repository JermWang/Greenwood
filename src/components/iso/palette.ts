// Evergreen's isometric art direction.
//
// Split deliberately into two groups, because conflating them is what made the
// first pass a green wash:
//
//   BRAND   - the Robinhood-style green. Signage, logos, interaction feedback,
//             positive values. Used sparingly, so that when it appears it means
//             something.
//   WORLD   - ordinary building materials under ordinary light: concrete, steel,
//             painted panel, wood, glass. These carry the scene.
//
// If you are colouring a surface because it is part of the room, take it from
// WORLD. Only take from BRAND when the thing is literally branded or is telling
// the player about state.

export const ISO = {
  // --- BRAND (Robin Neon) --------------------------------------------------
  // Extremely bright, so it never carries white text and never paints a whole
  // object — signage, status lamps and hover feedback only.
  accent: '#ccff00',
  bright: '#e2ff66',
  deep: '#a3cc00',

  // --- WORLD: surfaces -----------------------------------------------------
  // Warm neutrals, tuned to sit under the Heather greys rather than fight them.
  concrete: '#63615b',
  concreteAlt: '#5a5853',
  concreteDark: '#3a3833',
  steel: '#a09e99',
  steelDark: '#6b6963',
  paint: '#d4d2cf',
  wood: '#8a6743',
  woodDark: '#5f4830',
  glass: '#b8c6cc',
  rubber: '#26251f',

  // --- WORLD: warm/status --------------------------------------------------
  amber: '#e0a34a',
  danger: '#c0553a',

  // --- Board ---------------------------------------------------------------
  tile: '#63615b',
  tileAlt: '#5a5853',
  /** Interaction feedback is Robin Neon — the one place brand belongs on a tile. */
  tileHover: '#ccff00',
  tileOccupied: '#726f68',
  tileBlocked: '#a34a33',

  /** Room backdrop: Robin Black. */
  void: '#17160f',
  panel: '#24231a',

  // Legacy aliases kept so older call sites stay valid.
  mint: '#b1afac',
  pale: '#d4d2cf',
  metal: '#6b6963',
  metalDark: '#3a3833',
} as const;

/**
 * One tile is one world unit.
 *
 * This is what lets the board be a direct view of the saved layout:
 * normalizeLayout already rounds x/z to integers and rejects two machines in one
 * cell, so a tile at (x, z) IS the server's cell (x, z) with no mapping layer.
 */
export const TILE = 1;

/** Height of a tile's top face — desks are placed on this plane. */
export const TILE_TOP = 0.1;

/** Fixed isometric view offset (equal components = a true 35.26 degree pitch). */
export const ISO_OFFSET: [number, number, number] = [26, 26, 26];

/**
 * Zoom bounds, in pixels per world unit.
 *
 * `min` has to go this low because the full board is 25x33 tiles: a floor that
 * large only fits on a phone at around 5px per unit. The initial zoom is not a
 * constant at all — IsoScene fits it to the board and viewport on mount.
 */
export const ZOOM = { min: 4, max: 74, initial: 30 } as const;

/** The four machine silhouettes the board can render. */
export type MachineKind = 'equity' | 'rack' | 'cooling' | 'settlement';

/**
 * Declared locally rather than imported from lib/floor.
 *
 * lib/floor reaches for node:sqlite the moment it loads, so importing its types
 * into a client component drags the database into the browser bundle — the same
 * reason api-client re-declares the floor shapes instead of sharing them.
 */
export interface IsoMachine {
  id: string;
  kind: MachineKind;
  label: string;
  accent: string;
  /**
   * What this thing does, in one line.
   *
   * The book used to list names and nothing else, which made the floor a
   * memory test: you could not tell a Treasury desk from an Equity desk, or
   * know what either was worth, without leaving and going to look it up.
   */
  blurb?: string;
  /** GREEN to deploy or take to the next level. Undefined when it is maxed. */
  cost?: number;
  /** Current standing — level, rate, multiplier. Whatever ranks it. */
  detail?: string;
}

export interface PlacedIsoMachine {
  id: string;
  x: number;
  z: number;
  rotation: number;
}

/**
 * Player jacket colours.
 *
 * A character's shell is hashed out of this list from their wallet, so every
 * player is one of these six unless a cosmetic overrides it.
 *
 * Lives here rather than in Character.tsx because it is DATA that other things
 * need to reason about — lib/npcs is checked against it so a resident can never
 * be dressed as a player — and a plain module can be imported from a test that
 * has no JSX transform.
 */
export const OUTFITS = ['#3f5c86', '#7a3f4a', '#4a5a48', '#6b5b3e', '#4b4459', '#2f5c5c'];
