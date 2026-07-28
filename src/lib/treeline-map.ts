// The Treeline — the rung between the settlement and the turn.
//
// NO IMPORTS, the same contract the other three map modules hold. See
// lib/deep-forest-map for why: the renderer and the server both have to answer
// "what is on this tile" and they must not be able to disagree.
//
// WHY IT EXISTS, AND WHY IT MATTERS MORE THAN IT LOOKS
//
// It was a region in the table with no place attached: gates, bounds, a blurb,
// and nothing to walk into. That was survivable while it was only a pacing step.
// It stopped being survivable when woodcutting landed, because the two woods
// worth having — black pine and ironbark — both grew ONLY in the Deep Forest,
// which wants total level 10, a desk at 8, a pack, and consents to PvP.
//
// So the crafting ladder started after the hardest gate in the game. A player
// finishes the introduction around level 11 with a level-2 desk and could reach
// exactly one tier of wood. That is backwards: a gathering skill is early-game
// content, and putting its payoff behind the endgame means nobody meets it while
// it is still the thing they need.
//
// The Treeline fixes it by being a real place at level 6 / desk 3 / pack, with
// black pine in QUANTITY. Ironbark stays deep, so the top of the ladder is still
// somewhere frightening — but the middle of it is now reachable by somebody who
// has been playing an hour rather than a week.
//
// THE MOOD IS THE MIDDLE TERM. The Grounds are lit like an afternoon and the
// Deep Forest like a bad night. This is amber dusk: still readable, still safe
// enough to work in, with the light going. Nothing here is hostile-looking. The
// hostiles are real (see the region table) and that is the point — the first
// place that can hurt you should not announce itself.

/** The playable rectangle. Must match the treeline bounds in lib/regions. */
export const BOUNDS = { minX: -26, maxX: 26, minZ: -20, maxZ: 20 } as const;

/** Seeds the scatter. Constant, so everyone walks the same wood forever. */
export const MAP_SEED = 0x74726c6e; // "trln"

export const DOOR_HALF = 1;
export const DOOR_DEPTH = 0;

const inBounds = (x: number, z: number) =>
  x >= BOUNDS.minX && x <= BOUNDS.maxX && z >= BOUNDS.minZ && z <= BOUNDS.maxZ;

function hash(x: number, z: number, salt = 0): number {
  let h = 2166136261 ^ MAP_SEED;
  for (const v of [x | 0, z | 0, salt | 0]) {
    h ^= v + 0x9e3779b9 + (h << 6) + (h >>> 2);
    h = Math.imul(h ^ (h >>> 15), 2246822519);
  }
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

// ---------------------------------------------------------------------------
// Fixed features
// ---------------------------------------------------------------------------

/**
 * The service track, running west to east.
 *
 * The only built thing out here, and it is barely built — two ruts and some
 * gravel. It connects the gate you arrive at to the gate you leave by, and
 * everything interesting is OFF it. That is the shape the region wants: a safe
 * line through a place that is not, so stepping off the track is a decision
 * rather than something that happens to you.
 */
export const TRACK_Z = 0;
/** Half-width of the track. Three tiles: wide enough to walk, not to hide in. */
export const TRACK_HALF = 1;

export const ARRIVAL = { x: BOUNDS.minX + 3, z: TRACK_Z } as const;

export interface Doorway {
  id: string;
  x: number;
  z: number;
  axis: 'x' | 'z';
  rotation: number;
  label: string;
  href: string;
  region: string;
  blurb: string;
  arriveAt: string | null;
}

/**
 * Both ends of the track.
 *
 * West back to HQ, east on to the Deep Forest. Deliberately the only two ways
 * out: a region whose job is to be a rung should not also be a junction, or the
 * ladder stops reading as a ladder.
 */
export const DOORS: Doorway[] = [
  {
    id: 'greenwood-hq',
    x: BOUNDS.minX,
    z: TRACK_Z,
    axis: 'z',
    rotation: -Math.PI / 2,
    label: 'Greenwood HQ',
    href: '/app/hq',
    region: 'greenwood-hq',
    blurb: 'Back down the track to the plaza.',
    arriveAt: null,
  },
  {
    id: 'deep-forest',
    x: BOUNDS.maxX,
    z: TRACK_Z,
    axis: 'z',
    rotation: Math.PI / 2,
    label: 'The Deep Forest',
    href: '/app/deep-forest',
    region: 'deep-forest',
    blurb: 'Past the last of the lights. Other funds hunt out here.',
    arriveAt: null,
  },
];

// ---------------------------------------------------------------------------
// Terrain
// ---------------------------------------------------------------------------

/** Is this tile on the service track? */
export function onPath(x: number, z: number): boolean {
  if (!inBounds(x, z)) return false;
  if (Math.abs(z - TRACK_Z) <= TRACK_HALF) return true;
  for (const door of DOORS) {
    if (Math.abs(x - door.x) <= 1 && Math.abs(z - door.z) <= 1) return true;
  }
  return false;
}

export type PropKind = 'tree' | 'dead' | 'boulder';

export interface MapProp {
  x: number;
  z: number;
  kind: PropKind;
  seed: number;
  solid: boolean;
}

/**
 * What is standing here.
 *
 * Density climbs with DISTANCE FROM THE TRACK rather than from a centre, which
 * is the one structural difference from the other outdoor maps and the reason
 * this region reads the way it does. The Deep Forest thickens toward its edges
 * around a clearing; here the wood closes in on you from both sides of a line
 * you are walking down. Walking the track is easy and safe and gets you nothing;
 * everything worth cutting is far enough off it to be a decision.
 */
export function propAt(x: number, z: number): MapProp | null {
  const gx = Math.round(x);
  const gz = Math.round(z);
  if (!inBounds(gx, gz)) return null;
  if (onPath(gx, gz)) return null;
  // Gate aprons stay clear, or an exit could be walled in by its own wood.
  for (const door of DOORS) {
    if (Math.hypot(gx - door.x, gz - door.z) < DOOR_HALF + 3) return null;
  }

  // t is 0 beside the track and 1 at the north or south edge.
  const t = Math.min(1, (Math.abs(gz - TRACK_Z) - TRACK_HALF) / (BOUNDS.maxZ - TRACK_HALF));
  const density = 0.05 + t * 0.13;
  if (hash(gx, gz, 1) > density) return null;

  // Minimum spacing: a candidate whose already-scanned neighbour won is dropped.
  // Density alone controls how many props exist, not how they are spread — an
  // independent roll per tile clumps into thickets with bald patches between.
  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dz = -1; dz <= 1; dz += 1) {
      if (dx === 0 && dz === 0) continue;
      if (dz > 0 || (dz === 0 && dx > 0)) continue;
      const nx = gx + dx;
      const nz = gz + dz;
      if (!inBounds(nx, nz) || onPath(nx, nz)) continue;
      const nt = Math.min(1, (Math.abs(nz - TRACK_Z) - TRACK_HALF) / (BOUNDS.maxZ - TRACK_HALF));
      if (hash(nx, nz, 1) <= 0.05 + nt * 0.13) return null;
    }
  }

  const roll = hash(gx, gz, 2);
  // A few dead ones, and more of them further out. A wood that is entirely
  // healthy reads as a park; three dead trees read as a wood something happened
  // to, which is the only foreshadowing this region does.
  const kind: PropKind = roll > 0.93 - t * 0.08 ? 'dead' : roll > 0.86 ? 'boulder' : 'tree';

  return { x: gx, z: gz, kind, seed: Math.round(hash(gx, gz, 3) * 100000), solid: true };
}

export function allProps(): MapProp[] {
  const out: MapProp[] = [];
  for (let x = BOUNDS.minX; x <= BOUNDS.maxX; x += 1) {
    for (let z = BOUNDS.minZ; z <= BOUNDS.maxZ; z += 1) {
      const prop = propAt(x, z);
      if (prop) out.push(prop);
    }
  }
  return out;
}

export function isWalkable(x: number, z: number): boolean {
  const gx = Math.round(x);
  const gz = Math.round(z);
  if (!inBounds(gx, gz)) return false;
  if (DOORS.some((d) => d.x === gx && d.z === gz)) return true;
  const prop = propAt(gx, gz);
  return !prop || !prop.solid;
}

export function doorCells(door: Doorway): Array<{ x: number; z: number }> {
  const out: Array<{ x: number; z: number }> = [];
  for (let o = -DOOR_HALF; o <= DOOR_HALF; o += 1) {
    out.push(door.axis === 'x' ? { x: door.x + o, z: door.z } : { x: door.x, z: door.z + o });
  }
  return out;
}

export function doorAt(x: number, z: number): Doorway | null {
  return (
    DOORS.find((d) =>
      d.axis === 'x'
        ? Math.abs(x - d.x) <= DOOR_HALF && Math.abs(z - d.z) <= DOOR_DEPTH
        : Math.abs(z - d.z) <= DOOR_HALF && Math.abs(x - d.x) <= DOOR_DEPTH
    ) ?? null
  );
}
