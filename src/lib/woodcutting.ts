// Woodcutting: what a tree is, what fells it, and what falls out.
//
// NO IMPORTS. Which species stands on a tile has to be answerable by the
// renderer (to draw an ironbark differently from a pine) and by the SERVER (to
// validate that the thing you claim to have felled was there and that your axe
// could fell it). Same contract as the map modules, for the same reason: two
// halves that compute the answer separately can never disagree.
//
// WHY THIS EXISTS
//
// The gap in this game is not before HQ, it is after the introduction. A player
// finishes the tutorial at Total Level 11 with a level-2 desk, and the Deep
// Forest wants a desk at level 8 — so the honest answer to "what now" was "wait
// for yield to accumulate". That is where an idle game loses people.
//
// Woodcutting fills it with something you DO. It is deliberately not another
// pick-it-up-off-the-ground node: a tree takes a tool, the tool has tiers, the
// tiers gate species, and the species gate what you can build. That is a ladder
// a player can see the top of, which is the entire difference between a chore
// and a grind somebody enjoys.
//
// AND IT IS THE TURN, HIDING IN PLAIN SIGHT.
//
// A settlement that runs generators needs FUEL. Timber is fuel. Nothing in the
// game says so — the Exchange lists it as a commodity and the desks list it as a
// material — but a player who notices that the thing they burn and the thing
// that produces their "yield" are the same thing has found the twist by playing
// rather than by being told. See docs/greenwood-turn.md. Do not put a line of
// dialogue on this.

/** Seeds species selection. Constant: the same tree is the same species forever. */
const WOOD_SEED = 0x776f6f64; // "wood"

function hash(x: number, z: number, salt = 0): number {
  let h = 2166136261 ^ WOOD_SEED;
  for (const v of [x | 0, z | 0, salt | 0]) {
    h ^= v + 0x9e3779b9 + (h << 6) + (h >>> 2);
    h = Math.imul(h ^ (h >>> 15), 2246822519);
  }
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

export type SpeciesId = 'pine' | 'birch' | 'oak' | 'blackpine' | 'ironbark';

export interface Species {
  id: SpeciesId;
  name: string;
  /** Tier, 1..4. An axe fells anything at or below its own tier. */
  tier: number;
  /** Logs a successful chop yields. */
  logs: number;
  /** Scouting XP per chop. */
  xp: number;
  /** Seconds before the stump regrows. */
  respawn: number;
  /** Foliage colour, so the renderer can tell them apart at a glance. */
  needle: string;
  /** Trunk colour. Ironbark is the one that reads as wrong. */
  bark: string;
  blurb: string;
}

/**
 * The species ladder.
 *
 * Respawn climbs with tier, which is what stops the best tree being the only
 * tree anybody cuts: an ironbark is worth four pines and makes you wait eight
 * times as long, so a player clearing a stand of pine is not being foolish.
 *
 * XP climbs faster than logs do. Logs are the economy and XP is the progression,
 * and they should not be the same curve — otherwise the fastest way to level is
 * always the fastest way to earn, and there is never a decision.
 */
export const SPECIES: Record<SpeciesId, Species> = {
  pine: {
    id: 'pine',
    name: 'Pine',
    tier: 1,
    logs: 1,
    xp: 12,
    respawn: 45,
    needle: '#4a6b3c',
    bark: '#4a3b2c',
    blurb: 'Soft, fast, everywhere. What the Grounds are planted with.',
  },
  birch: {
    id: 'birch',
    name: 'Birch',
    tier: 1,
    logs: 1,
    xp: 18,
    respawn: 60,
    needle: '#6d8a4a',
    bark: '#b8b2a4',
    blurb: 'Pale bark, burns hot and quick. Worth more than it looks.',
  },
  oak: {
    id: 'oak',
    name: 'Oak',
    tier: 2,
    logs: 2,
    xp: 42,
    respawn: 150,
    needle: '#3f5a33',
    bark: '#5f4830',
    blurb: 'Dense and slow. The first tree that needs a real axe.',
  },
  blackpine: {
    id: 'blackpine',
    name: 'Black Pine',
    tier: 3,
    logs: 3,
    xp: 95,
    respawn: 320,
    needle: '#2b3a2c',
    bark: '#33302a',
    blurb: 'Grows where the light does not reach. Heavier than it should be.',
  },
  ironbark: {
    id: 'ironbark',
    name: 'Ironbark',
    tier: 4,
    logs: 4,
    xp: 220,
    respawn: 700,
    needle: '#3a4a44',
    // Deliberately metallic. It is the one tree that does not look like a tree,
    // and nothing in the game explains why.
    bark: '#6b6f72',
    blurb: 'Rings when you strike it. Nobody has a good answer about that.',
  },
};

export const ALL_SPECIES: Species[] = Object.values(SPECIES);

export type AxeId = 'hatchet' | 'felling' | 'splitting' | 'ironbark-axe';

export interface Axe {
  id: AxeId;
  name: string;
  /** Fells any species of this tier or below. */
  tier: number;
  /**
   * Damage when swung at something living.
   *
   * An axe is a TOOL FIRST and a weapon second, and the numbers say so: the
   * best axe in the game hits for less than a purpose-made weapon of the same
   * tier. It exists so a player's first weapon is something they bought to
   * work with and discovered they could fight with — which is a far better
   * first combat than being handed a sword.
   */
  damage: number;
  scripCost: number;
  blurb: string;
}

export const AXES: Record<AxeId, Axe> = {
  hatchet: {
    id: 'hatchet',
    name: 'Hatchet',
    tier: 1,
    damage: 14,
    scripCost: 400,
    blurb: 'A hand axe. Pine and birch, and not much else.',
  },
  felling: {
    id: 'felling',
    name: 'Felling Axe',
    tier: 2,
    damage: 20,
    scripCost: 2_200,
    blurb: 'Two hands and a proper head. Takes oak.',
  },
  splitting: {
    id: 'splitting',
    name: 'Splitting Axe',
    tier: 3,
    damage: 27,
    scripCost: 9_000,
    blurb: 'Heavy enough for black pine. Heavy enough for most things.',
  },
  'ironbark-axe': {
    id: 'ironbark-axe',
    name: 'Ironbark Axe',
    tier: 4,
    damage: 35,
    scripCost: 38_000,
    blurb: 'Ironbark head, ironbark haft. It is the only thing that cuts it.',
  },
};

export const ALL_AXES: Axe[] = Object.values(AXES);

/** Can this axe fell this species? Tier at or above, and nothing else. */
export function canFell(axe: AxeId | null | undefined, species: SpeciesId): boolean {
  if (!axe) return false;
  const tool = AXES[axe];
  const tree = SPECIES[species];
  if (!tool || !tree) return false;
  return tool.tier >= tree.tier;
}

/**
 * Which species stands on this tile.
 *
 * A pure function of the coordinate AND the region, so the renderer draws what
 * the server will validate. The region matters because the ladder is a MAP of
 * the world's danger: pine in the settlement, oak at the treeline, and the two
 * that are worth having only where things can kill you.
 *
 * That is the whole progression design in one function. The best wood is not
 * gated behind a level — it is gated behind being somewhere frightening, which
 * is a gate a player feels rather than reads.
 */
export function speciesAt(region: string, x: number, z: number): SpeciesId {
  const roll = hash(x, z, 1);
  if (region === 'deep-forest') {
    // Rare even here. An ironbark should be a thing you tell somebody about.
    if (roll > 0.965) return 'ironbark';
    if (roll > 0.72) return 'blackpine';
    if (roll > 0.4) return 'oak';
    return 'pine';
  }
  if (region === 'treeline') {
    if (roll > 0.93) return 'blackpine';
    if (roll > 0.55) return 'oak';
    if (roll > 0.3) return 'birch';
    return 'pine';
  }
  // The settlement. Planted, tended, and worth almost nothing.
  return roll > 0.78 ? 'birch' : 'pine';
}

/**
 * A tree's stable id.
 *
 * Region plus tile, because the same coordinate exists in every region and a
 * stump recorded without one would regrow in the wrong forest. Matches the shape
 * salvage nodes already use.
 */
export const treeId = (region: string, x: number, z: number) => `${region}:${x}:${z}`;

/** Milliseconds a felled tree stays a stump. */
export const respawnMs = (species: SpeciesId) => SPECIES[species].respawn * 1000;

/** Has a stump felled at `at` regrown by `now`? */
export function hasRegrown(species: SpeciesId, at: number, now: number): boolean {
  return now - at >= respawnMs(species);
}

/**
 * What one chop is worth.
 *
 * Returned together rather than as two lookups so a caller cannot award the XP
 * and forget the logs, which is the sort of thing that only shows up as a
 * complaint about the economy three weeks later.
 */
export function chopReward(species: SpeciesId): { logs: number; xp: number; ref: string } {
  const tree = SPECIES[species];
  return { logs: tree.logs, xp: tree.xp, ref: `log-${tree.id}` };
}
