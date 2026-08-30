// Evergreen HQ — the plaza, and the tower standing on it.
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
// their own regions reached through the tower door — see docs/evergreen-turn.md
// for why the interior matters and CLAUDE.md for the door rules. An elevator is
// the first VERTICAL door in this game and the portal table has no concept of
// floors yet; that is deliberately not being solved here.

/** The playable rectangle. Must match the hq bounds in lib/regions. */
/*
 * Deliberately NOT symmetric about x = 0, and that is the composition decision
 * rather than a typo.
 *
 * The region used to be ±20 by -16..20 and only 63% of it was ground a player
 * could stand on. The rest was margin: three empty rows behind the tower, six
 * dead columns west, six more east holding nothing but the service spur.
 *
 * The two sides got opposite treatments because they had opposite problems.
 * The west now runs out to -20 because the YARD is there and earns it — blank
 * ground is fixed by giving it a reason, and cropping is only right when no
 * reason exists. The east had no such reason, so it was cropped to 17: just
 * enough to carry the spur out to the Treeline gate and stop.
 *
 * A plaza wider on its service side than its gate side is what a real compound
 * looks like. A perfectly square one is what a level editor looks like.
 */
export const BOUNDS = { minX: -20, maxX: 17, minZ: -15, maxZ: 20 } as const;

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
    label: 'Evergreen Grounds',
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
    label: 'Evergreen HQ',
    href: '/app/hq/lobby',
    region: 'hq-lobby',
    blurb: 'The lobby, the desks, and everything above them.',
    arriveAt: null,
  },
  {
    id: 'treeline',
    // ON the east edge, not two tiles shy of it. It was inset back when the map
    // just stopped at the boundary and the difference was invisible; now that
    // there is a compound wall, a gate that does not sit IN the wall is a gate
    // with a wall behind it. The grounds door uses BOUNDS.maxZ for the same
    // reason — a way out belongs in the edge it is a way out of.
    x: BOUNDS.maxX,
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
  // The west yard. Shares an edge with the concourse at x = -14, so it needs no
  // connector of its own — see YARD.
  if (inYard(x, z)) return true;
  for (const door of DOORS) {
    if (Math.abs(x - door.x) <= 1 && Math.abs(z - door.z) <= 1) return true;
  }
  return false;
}

/**
 * The west service yard.
 *
 * The west margin used to be six columns of nothing — 37% of the region was
 * unreachable ground, and most of it was over here. The temptation was to crop
 * the bounds in, which would have worked and would have made the plaza smaller
 * for no reason a player could name.
 *
 * A tower needs somewhere for its vans, and the yard is the honest answer: it
 * gives the west side a job, it explains the tower (things arrive here, people
 * work here), and it is the sort of place a player wanders into once and then
 * knows the shape of the region.
 *
 * It is NOT mirrored on the east and that is the same rule the service spur
 * follows — backs of buildings are asymmetric because their contents are.
 * Sharing the concourse's west edge at x = -14 is what connects it; there is no
 * separate link path, because two adjacent paved cells are already a route.
 */
export const YARD = { minX: -19, maxX: -15, minZ: 0, maxZ: 12 } as const;

export const inYard = (x: number, z: number) =>
  x >= YARD.minX && x <= YARD.maxX && z >= YARD.minZ && z <= YARD.maxZ;

export const inTower = (x: number, z: number) =>
  x >= TOWER.minX && x <= TOWER.maxX && z >= TOWER.minZ && z <= TOWER.maxZ;

/** Inside the fountain's basin. Walk around it, not through it. */
export const inFountain = (x: number, z: number) =>
  Math.hypot(x - FOUNTAIN.x, z - FOUNTAIN.z) <= FOUNTAIN.radius;

// ---------------------------------------------------------------------------
// The compound wall
// ---------------------------------------------------------------------------

/** Half-width of the opening left for a gate, in tiles. */
export const GATE_HALF = 2.2;

export interface WallRun {
  /** Centre of the run. */
  x: number;
  z: number;
  /** Extent. One of these is the wall's thickness. */
  w: number;
  d: number;
}

/**
 * The perimeter wall, derived rather than listed.
 *
 * It lives here rather than in HqScene because it is map data — a pure function
 * of BOUNDS and DOORS — and because a wall written out by hand is a wall that
 * disagrees with the map the first time either one moves. This codebase has
 * paid for that twice already: the gate sign that named the wrong region, and
 * the Deep Forest's two sets of bounds.
 *
 * Being here also makes it testable, which matters more than usual: the failure
 * mode is a wall drawn ACROSS a gate, and that is invisible to every existing
 * test (the wall has no collision — isWalkable is still the only authority on
 * where you may stand) while being immediately obvious to a player. It was in
 * fact wrong on the first pass, in exactly that way.
 *
 * The two coordinates that look interchangeable are not. The wall runs half a
 * tile OUTSIDE the boundary; the door stands ON the boundary tile. Matching one
 * against the other finds nothing and seals the compound.
 */
export function perimeter(): { runs: WallRun[]; piers: Array<[number, number]> } {
  const runs: WallRun[] = [];
  const piers: Array<[number, number]> = [];

  const side = (axis: 'x' | 'z', wallAt: number, tileAt: number, from: number, to: number) => {
    const gaps = DOORS.filter((door) => (axis === 'x' ? door.z : door.x) === tileAt)
      .map((door) => (axis === 'x' ? door.x : door.z))
      .sort((a, b) => a - b);

    let cursor = from;
    for (const gap of [...gaps, null]) {
      const end = gap === null ? to : gap - GATE_HALF;
      if (end > cursor) {
        const mid = (cursor + end) / 2;
        const len = end - cursor;
        runs.push(
          axis === 'x' ? { x: mid, z: wallAt, w: len, d: 0.5 } : { x: wallAt, z: mid, w: 0.5, d: len }
        );
        // Both ends of every run, so each gate is framed by a pair.
        for (const at of [cursor, end]) piers.push(axis === 'x' ? [at, wallAt] : [wallAt, at]);
        // Then every fourth tile between. An unbroken run of concrete at this
        // length reads as a texture rather than a structure.
        for (let p = Math.ceil(cursor / 4) * 4; p < end; p += 4) {
          if (p - cursor > 1 && end - p > 1) piers.push(axis === 'x' ? [p, wallAt] : [wallAt, p]);
        }
      }
      if (gap !== null) cursor = gap + GATE_HALF;
    }
  };

  const w = BOUNDS.minX - 0.5;
  const e = BOUNDS.maxX + 0.5;
  const n = BOUNDS.minZ - 0.5;
  const s = BOUNDS.maxZ + 0.5;
  side('x', n, BOUNDS.minZ, w, e);
  side('x', s, BOUNDS.maxZ, w, e);
  side('z', w, BOUNDS.minX, n, s);
  side('z', e, BOUNDS.maxX, n, s);
  return { runs, piers };
}

export type PropKind = 'planter' | 'bench' | 'lamp' | 'van' | 'skip' | 'pallets';

export interface MapProp {
  x: number;
  z: number;
  kind: PropKind;
  /** Quarter turns. Benches face something; a bench facing nothing is litter. */
  rotation: number;
  seed: number;
  solid: boolean;
}

/**
 * The furniture, PLACED rather than generated.
 *
 * The first pass put props on a lattice with a seeded roll picking what each one
 * was, and it looked exactly like what it was: a plaza with things on it. A
 * generator can make a convincing WOOD, because a wood has no author and its
 * only rule is that trees do not overlap. It cannot make a convincing SQUARE,
 * because every object in a square was put there by somebody for a reason, and
 * the reasons are what the eye reads.
 *
 * So this is a hand-written list, and it is composed to three rules:
 *
 *   SYMMETRY ABOUT THE APPROACH. The avenue from the south gate to the tower
 *   door runs along x = 0, and everything on it is mirrored. A civic building is
 *   approached down an axis; breaking that symmetry is what makes a place feel
 *   like a car park.
 *
 *   THE FOUNTAIN IS THE ROOM'S CENTRE, so the benches face it in a ring rather
 *   than lining the edges. People sit looking at something. Seating that faces
 *   outward reads as a bus stop.
 *
 *   LAMPS MARK THE ROUTE, not the area. They run in pairs down the approach and
 *   along the service spur to the Treeline gate, so at a glance the lit line
 *   shows you where you can go. Scattering them evenly would light the plaza and
 *   tell you nothing.
 *
 * Rotation is quarter turns only. A plaza is laid out on a grid by people with
 * set squares, and a bench at 37 degrees reads as one somebody dragged.
 */
const PLACED: Array<Omit<MapProp, 'seed' | 'solid'>> = [
  // Benches ringing the fountain, each turned to face it.
  { x: -5, z: 6, kind: 'bench', rotation: Math.PI / 2 },
  { x: 5, z: 6, kind: 'bench', rotation: -Math.PI / 2 },
  { x: 0, z: 11, kind: 'bench', rotation: Math.PI },
  { x: -4, z: 10, kind: 'bench', rotation: Math.PI },
  { x: 4, z: 10, kind: 'bench', rotation: Math.PI },

  // Planters framing the tower approach, in mirrored pairs stepping north.
  { x: -4, z: 1, kind: 'planter', rotation: 0 },
  { x: 4, z: 1, kind: 'planter', rotation: 0 },
  { x: -6, z: -1, kind: 'planter', rotation: 0 },
  { x: 6, z: -1, kind: 'planter', rotation: 0 },

  // Planters softening the south entrance, same pairing.
  { x: -7, z: 15, kind: 'planter', rotation: 0 },
  { x: 7, z: 15, kind: 'planter', rotation: 0 },
  { x: -10, z: 17, kind: 'planter', rotation: 0 },
  { x: 10, z: 17, kind: 'planter', rotation: 0 },

  // Lamps down the approach, in pairs. The lit line IS the route.
  { x: -4, z: 17, kind: 'lamp', rotation: 0 },
  { x: 4, z: 17, kind: 'lamp', rotation: 0 },
  { x: -4, z: 13, kind: 'lamp', rotation: 0 },
  { x: 4, z: 13, kind: 'lamp', rotation: 0 },
  { x: -7, z: 6, kind: 'lamp', rotation: 0 },
  { x: 7, z: 6, kind: 'lamp', rotation: 0 },
  { x: -8, z: 1, kind: 'lamp', rotation: 0 },
  { x: 8, z: 1, kind: 'lamp', rotation: 0 },

  /*
   * The service spur is DELIBERATELY one-sided.
   *
   * Everything above is mirrored about the approach, because that is how a
   * civic front is composed. This is the back of the building: a working route
   * to a gate, on the east side only, because that is where the gate is. Making
   * it symmetrical would mean lighting a path to nowhere on the west — decorum
   * applied where nobody was decorating.
   *
   * hq-map.test scopes its symmetry assertion to the concourse for this reason.
   */
  { x: 12, z: 2, kind: 'lamp', rotation: 0 },
  { x: 12, z: -4, kind: 'lamp', rotation: 0 },
  { x: 14, z: -8, kind: 'lamp', rotation: 0 },

  /*
   * The west yard, and it breaks the mirror on purpose for the same reason the
   * spur does. This is where the vans live.
   *
   * The vans are parked nose-east in a rank, quarter-turned like everything
   * else, because a yard where vehicles sit at angles reads as abandoned and
   * this one is in use. They are solid: you walk around a van.
   *
   * The single lamp is at the yard MOUTH rather than inside it. Lamps mark the
   * route here, and what a player needs shown is the turning off the concourse,
   * not the far corner of a car park.
   */
  { x: -15, z: 6, kind: 'lamp', rotation: 0 },
  { x: -17, z: 2, kind: 'van', rotation: Math.PI / 2 },
  { x: -17, z: 4, kind: 'van', rotation: Math.PI / 2 },
  { x: -17, z: 7, kind: 'van', rotation: Math.PI / 2 },
  { x: -18, z: 10, kind: 'skip', rotation: 0 },
  { x: -16, z: 11, kind: 'pallets', rotation: 0 },
  { x: -18, z: 12, kind: 'pallets', rotation: Math.PI / 2 },
];

/** Placed furniture, keyed by cell so collision stays a lookup. */
const PLACED_BY_CELL = new Map(
  PLACED.map((p) => [
    `${p.x}:${p.z}`,
    { ...p, seed: Math.round(hash(p.x, p.z, 3) * 100000), solid: true } as MapProp,
  ])
);

/**
 * What is standing on this tile.
 *
 * A lookup rather than a generator now — see PLACED. Still a pure function of
 * the coordinate, so collision costs nothing and the server could read it.
 */
export function propAt(x: number, z: number): MapProp | null {
  return PLACED_BY_CELL.get(`${Math.round(x)}:${Math.round(z)}`) ?? null;
}

export function allProps(): MapProp[] {
  return [...PLACED_BY_CELL.values()];
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
