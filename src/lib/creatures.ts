// What lives in the Deep Forest, where it lives, and what it does to you.
//
// Same contract as lib/deep-forest-map: NO IMPORTS beyond the map itself, so the
// renderer and the server read one definition and cannot disagree about where a
// wolf is standing. In a zone where a creature is both a threat and cover for
// another player, "my client drew it somewhere else" is not a cosmetic bug.
//
// SPAWN POINTS ARE DETERMINISTIC; CREATURE STATE IS NOT. Where a den sits is a
// pure function of its coordinate — no table, nothing sent over the wire, and a
// player can learn that the ridge east of the clearing always has wolves. What
// is mutable is health and aggro, and that lives on the server only.

import { CLEARING, EXTENT, isWalkable, propAt } from './deep-forest-map';

export type CreatureKind = 'shambler' | 'wolf';

export interface CreatureDef {
  kind: CreatureKind;
  name: string;
  maxHealth: number;
  /** Damage per hit landed on a player. */
  damage: number;
  /** Tiles per attack — how close it has to be to hurt you. */
  reach: number;
  /** Tiles at which it notices you. */
  senses: number;
  /** Seconds between its attacks. */
  cadence: number;
  /** What killing it drops, as a salvage ref. */
  drop: string;
  blurb: string;
}

/**
 * The two creatures, deliberately opposite on every axis that matters.
 *
 * A shambler is slow, tough, blind until close, and hits hard — it punishes
 * standing still and is trivially avoided by anyone paying attention. A wolf is
 * fast, fragile, senses you from a long way off, and chips at you — it punishes
 * crossing open ground and cannot be outrun.
 *
 * If both were "a thing that walks at you and bites", there would be one threat
 * with two models. The point is that the correct response differs: you walk away
 * from a shambler and you fight a wolf, and knowing which is which at a glance is
 * what the silhouettes in components/iso/Creatures are for.
 */
export const CREATURES: Record<CreatureKind, CreatureDef> = {
  shambler: {
    kind: 'shambler',
    name: 'Shambler',
    maxHealth: 60,
    damage: 18,
    reach: 1,
    senses: 4,
    cadence: 2.2,
    drop: 'rotten-cell',
    blurb: 'Slow, tough, and blind until you are almost on it. Walk around.',
  },
  wolf: {
    kind: 'wolf',
    name: 'Wolf',
    maxHealth: 28,
    damage: 7,
    reach: 1,
    senses: 11,
    cadence: 0.9,
    drop: 'pelt',
    blurb: 'Fast, fragile, and it saw you first. You will not outrun it.',
  },
};

export interface Spawn {
  /** Stable across sessions: derived from the tile, so cooldowns can key on it. */
  id: string;
  kind: CreatureKind;
  x: number;
  z: number;
  seed: number;
}

/** Dependency-free hash, matching deep-forest-map's approach. */
function hash(x: number, z: number, salt = 0): number {
  let h = 2166136261 ^ 0x63727472; // "crtr"
  for (const v of [x | 0, z | 0, salt | 0]) {
    h ^= v + 0x9e3779b9 + (h << 6) + (h >>> 2);
    h = Math.imul(h ^ (h >>> 15), 2246822519);
  }
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

/**
 * Every spawn point on the map.
 *
 * Walked on a coarse lattice so creatures are spread rather than clustered, then
 * nudged onto a nearby walkable tile. A spawn inside a tree would be a creature
 * nothing can reach and that cannot reach anything.
 *
 * Nothing spawns in the clearing. The generators are the objective, and an
 * objective you cannot approach without a fight every single time stops being a
 * decision — the risk should come from what you meet on the way.
 */
export function spawns(): Spawn[] {
  const out: Spawn[] = [];
  const step = 9;
  for (let x = -EXTENT + 4; x <= EXTENT - 4; x += step) {
    for (let z = -EXTENT + 4; z <= EXTENT - 4; z += step) {
      if (hash(x, z, 1) > 0.42) continue;

      const sx = x + Math.round((hash(x, z, 2) - 0.5) * 5);
      const sz = z + Math.round((hash(x, z, 3) - 0.5) * 5);
      if (Math.hypot(sx, sz) < CLEARING + 2) continue;
      if (Math.abs(sx) > EXTENT - 2 || Math.abs(sz) > EXTENT - 2) continue;
      if (propAt(sx, sz) || !isWalkable(sx, sz)) continue;

      // Wolves further out, shamblers nearer in. Distance from the clearing is
      // the difficulty axis, so the thing that hunts you belongs at the far end
      // of it — and a player pushing deep should feel the change.
      const far = Math.hypot(sx, sz) / EXTENT;
      const kind: CreatureKind = hash(x, z, 4) < 0.25 + far * 0.4 ? 'wolf' : 'shambler';

      out.push({ id: `${sx}:${sz}`, kind, x: sx, z: sz, seed: Math.round(hash(x, z, 5) * 100000) });
    }
  }
  return out;
}

const BY_ID = new Map(spawns().map((s) => [s.id, s]));

export function spawnById(id: string): Spawn | null {
  return BY_ID.get(id) ?? null;
}

/** Chebyshev distance, matching the movement rule's idea of adjacency. */
export const tilesApart = (ax: number, az: number, bx: number, bz: number) =>
  Math.max(Math.abs(ax - bx), Math.abs(az - bz));

/**
 * Damage a player's swing does.
 *
 * Flat for now, and deliberately not a weapon lookup — weapons are a carriable
 * class but have no stats yet, so anything reading them would be inventing
 * numbers. When they land, this is the one place that changes.
 */
export const UNARMED_DAMAGE = 12;

/** How close a player must be to swing. Same reach a shambler has. */
export const PLAYER_REACH = 1;
