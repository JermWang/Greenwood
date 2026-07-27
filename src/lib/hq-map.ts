// Greenwood HQ — the plaza, and the tower standing on it.
//
// NO IMPORTS, the same contract lib/grounds-map and lib/deep-forest-map hold.
//
// WHY THIS REGION EXISTS
//
// The Machine Room and the Trading Floor were outbuildings on a lawn, which
// never matched "one of the last lit settlements". A settlement that runs the
// power for a region has a BUILDING — and the moment it has one, the desks and
// the exchange belong inside it on floors rather than scattered across grass.
//
// It also fixes the pacing. The route was Grounds -> Treeline -> Deep Forest,
// which meant the step after "a pleasant park" was "something moves out here".
// HQ goes between them: the most civilised place in the game, and the last one
// before the fence means anything. You should have somewhere to lose.
//
// THIS FILE IS THE EXTERIOR ONLY. The lobby, the floors and the elevator are
// their own regions reached through the tower door — see docs/greenwood-turn.md
// for why the interior matters and CLAUDE.md for the door rules. An elevator is
// the first VERTICAL door in this game and the portal table has no concept of
// floors yet; that is deliberately not being solved here.

/** The playable rectangle. Must match the hq bounds in lib/regions. */
export const BOUNDS = { minX: -20, maxX: 20, minZ: -16, maxZ: 20 } as const;

/** Seeds the scatter. Constant, so everyone walks the same plaza forever. */
export const MAP_SEED = 0x67726871; // "grhq"

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
 * The tower footprint.
 *
 * Set back at the north end so the plaza reads as its forecourt rather than as
 * a road past it. Solid on every tile — the way in is the door, and a building
 * you can walk through is scenery with a label on it.
 */
export const TOWER = { minX: -9, maxX: 9, minZ: -13, maxZ: -3 } as const;

/**
 * The fountain, dead centre of the plaza.
 *
 * Load-bearing for the fiction rather than decorative. A fountain is the single
 * most legible signal that a place is CIVIC and maintained — somebody pays for
 * the water and somebody cleans it — and this is the last such place before the
 * Treeline. It is also the thing a player will remember the shape of, which is
 * what makes the plaza navigable without a map.
 */
export const FOUNTAIN = { x: 0, z: 6, radius: 3 } as const;

/** Where a player appears, arriving from the Grounds at the south edge. */
export const ARRIVAL = { x: 0, z: BOUNDS.maxZ - 3 } as const;

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
 * The ways out.
 *
 * Three of them and they are the whole point of the region: back to the
 * Grounds, into the tower, and on to the Treeline. HQ is a junction as much as
 * a place, which is why the plaza is shaped like one.
 *
 * The tower door is present and leads to the lobby. It is the only door here
 * that goes somewhere with no scene yet — the gate refuses it politely, which
 * is the same treatment the Treeline had before it, and is better than a door
 * that is not drawn at all: a building you can see the entrance of is a
 * building you can plan to get into.
 */
export const DOORS: Doorway[] = [
  {
    id: 'grounds',
    x: 0,
    z: BOUNDS.maxZ,
    axis: 'x',
    rotation: 0,
    label: 'Greenwood Grounds',
    href: '/app/grounds',
    region: 'grounds',
    blurb: 'Back down the avenue.',
    arriveAt: null,
  },
  {
    id: 'lobby',
    // Against the tower's south wall: a footprint ending at maxZ has its face at
    // maxZ + 0.5, so the tile at maxZ + 1 begins exactly there.
    x: 0,
    z: TOWER.maxZ + 1,
    axis: 'x',
    rotation: Math.PI,
    label: 'Greenwood HQ',
    href: '/app/hq/lobby',
    region: 'hq-lobby',
    blurb: 'The lobby, the desks, and everything above them.',
    arriveAt: null,
  },
  {
    id: 'treeline',
    x: BOUNDS.maxX - 2,
    z: -8,
    axis: 'z',
    rotation: Math.PI / 2,
    label: 'The Treeline',
    href: '/app/treeline',
    region: 'treeline',
    blurb: 'Past the service gate. Bring a pack.',
    arriveAt: null,
  },
];

// ---------------------------------------------------------------------------
// Terrain
// ---------------------------------------------------------------------------

/**
 * Paved plaza.
 *
 * Nearly all of it, unlike the Grounds where paths cut through grass. That is
 * the contrast doing the work: the Grounds are landscaped, HQ is BUILT. Walking
 * from one to the other should feel like stepping off a lawn onto a concourse.
 */
export function onPath(x: number, z: number): boolean {
  if (!inBounds(x, z)) return false;
  // The concourse: everything between the tower and the south edge.
  if (z > TOWER.maxZ && z <= BOUNDS.maxZ && Math.abs(x) <= 14) return true;
  /*
   * The east apron, running up the side of the tower.
   *
   * This is the piece that makes the Treeline gate reachable, and it was
   * missing on the first pass: the concourse stopped at the tower's south face
   * and the service run started four tiles north of it, so the gate was paved,
   * walkable, and connected to nothing. The reachability test caught it — which
   * is the entire reason that test asserts a ROUTE rather than a walkable tile.
   */
  if (x >= 10 && x <= 14 && z >= -12 && z <= BOUNDS.maxZ) return true;
  // The service run east from the apron, out to the gate.
  if (z >= -10 && z <= -6 && x >= 10) return true;
  for (const door of DOORS) {
    if (Math.abs(x - door.x) <= 1 && Math.abs(z - door.z) <= 1) return true;
  }
  return false;
}

export const inTower = (x: number, z: number) =>
  x >= TOWER.minX && x <= TOWER.maxX && z >= TOWER.minZ && z <= TOWER.maxZ;

/** Inside the fountain's basin. Walk around it, not through it. */
export const inFountain = (x: number, z: number) =>
  Math.hypot(x - FOUNTAIN.x, z - FOUNTAIN.z) <= FOUNTAIN.radius;

export type PropKind = 'planter' | 'bench' | 'lamp';

export interface MapProp {
  x: number;
  z: number;
  kind: PropKind;
  seed: number;
  solid: boolean;
}

/**
 * Street furniture, on a loose lattice rather than a scatter.
 *
 * A plaza is ARRANGED — somebody chose where the benches go — so the placement
 * is regular where the Grounds' is organic. Same trick as the buildings: the
 * difference between the two regions is legible before you have read a word.
 */
export function propAt(x: number, z: number): MapProp | null {
  const gx = Math.round(x);
  const gz = Math.round(z);
  if (!inBounds(gx, gz)) return null;
  if (inTower(gx, gz) || inFountain(gx, gz)) return null;
  // Keep thresholds and the fountain surround clear.
  for (const door of DOORS) {
    if (Math.hypot(gx - door.x, gz - door.z) < DOOR_HALF + 3) return null;
  }
  if (Math.hypot(gx - FOUNTAIN.x, gz - FOUNTAIN.z) < FOUNTAIN.radius + 2) return null;
  // The central spine stays clear so the tower door is always walkable-to.
  if (Math.abs(gx) <= 2) return null;

  // Lattice: every fourth tile, offset row to row.
  const onLattice = ((gx % 5) + 5) % 5 === 0 && ((gz % 4) + 4) % 4 === 0;
  if (!onLattice) return null;
  if (!onPath(gx, gz)) return null;

  const roll = hash(gx, gz, 2);
  const kind: PropKind = roll > 0.62 ? 'lamp' : roll > 0.3 ? 'planter' : 'bench';
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
  if (inTower(gx, gz) || inFountain(gx, gz)) return false;
  // Off the paving is off the map: the plaza is bounded by the building line
  // and the perimeter, not by an invisible wall in open ground.
  if (!onPath(gx, gz)) return false;
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
