// Greenwood Grounds — the hub, and the game's actual navigation.
//
// NO IMPORTS, the same contract lib/deep-forest-map holds, and for a weaker
// reason: nothing out here is contested, so the server does not strictly need to
// read this. It is written this way anyway because the day the Grounds gain
// anything worth arguing over — a gathering node, a visiting NPC, another player
// standing in a doorway — the alternative is discovering that the terrain only
// ever existed in the browser. That discovery already cost this codebase a
// rewrite once (see the header of deep-forest-map).
//
// WHY THIS PLACE EXISTS
//
// CLAUDE.md forbids a nav rail and a dock: navigation happens in the world. This
// is the room where doors are, and every door is a place you walk to rather than
// a tab you click.
//
// SO IT IS DELIBERATELY BORING. Overcast, flat, safe, nothing to fight and
// nothing to lose. It is the last place in the game that behaves the way the
// front of the fiction claims the whole world does — which is exactly what makes
// the fence at the north end land. Read docs/greenwood-turn.md before adding
// anything with teeth to it.
//
// SIZE IS SET BY CONTENT, NOT BY AMBITION.
//
// This was 81x81 tiles with everything crammed into a strip down the middle, so
// most of the region was bare grass a player could walk across for twenty
// seconds and find nothing. That is worse than a small map: it teaches people
// the world is empty, and it costs frames drawing scatter nobody will ever
// stand next to. The bounds below are drawn tight around what is actually here.
//
// Growing the world is a NEW REGION reached through a gate, not a bigger
// rectangle. Regions stream one at a time and there is no limit on how many
// exist, so there is never a reason to stretch one thin.

/**
 * The playable rectangle, in tiles, inclusive.
 *
 * Rectangular rather than a single half-extent, because the Grounds are an
 * avenue: long north-to-south, no wider than the buildings that flank it.
 * Forcing it square is what produced the empty margins.
 *
 * Must match the grounds bounds in lib/regions. They are asserted equal in
 * grounds-map.test — the Deep Forest shipped with these two numbers disagreeing
 * (±220 against ±46) and the symptom was players spawning a hundred and seventy
 * tiles outside the world with no error anywhere.
 */
export const BOUNDS = { minX: -22, maxX: 22, minZ: -20, maxZ: 24 } as const;

/** Seeds the scatter. Constant, so everyone walks the same Grounds forever. */
export const MAP_SEED = 0x67726e64; // "grnd"

/**
 * Tiles either side of a doorway's centre. 1 gives a three-tile threshold.
 *
 * Doors used to be a single cell, which made them something you had to hit
 * rather than something you walk into — and a one-tile target on a map you
 * navigate by clicking is a target you miss. Three matches the room doors in
 * components/iso/portals, which have always been `half: 1`, so a threshold is
 * the same width everywhere in the game.
 */
export const DOOR_HALF = 1;

/**
 * Slack ACROSS the threshold, in tiles.
 *
 * Zero: you are in the doorway or you are not. Walking through is what opens a
 * door now, so a tile of tolerance in front of it would fire the transition
 * while you were still approaching, and a player would be taken somewhere they
 * were only walking past.
 */
export const DOOR_DEPTH = 0;

const inBounds = (x: number, z: number) =>
  x >= BOUNDS.minX && x <= BOUNDS.maxX && z >= BOUNDS.minZ && z <= BOUNDS.maxZ;

/**
 * Deterministic hash. Inlined rather than imported, to keep the module
 * dependency-free — see the header.
 */
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

export interface Building {
  id: string;
  /** Footprint, inclusive. Solid on every tile inside it. */
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  name: string;
}

/**
 * The two buildings you can go inside, at the settlement end.
 *
 * Both face the arrival point, flanking the avenue rather than sitting on it —
 * a player who walks straight ahead without touching either one still ends up at
 * the fence, which is the thing they are eventually meant to find. Putting a
 * door in the path would make the Grounds a corridor with a decision in it; put
 * to either side, they are a place with two decisions and a horizon.
 */
export const BUILDINGS: Building[] = [
  { id: 'machine-room', name: 'Machine Room', minX: -17, maxX: -8, minZ: 8, maxZ: 15 },
  { id: 'trading-floor', name: 'Trading Floor', minX: 8, maxX: 17, minZ: 8, maxZ: 15 },
];

/** The fence line: one row of tiles across the north end. */
export const FENCE_Z = BOUNDS.minZ + 2;
/** Half-width of the opening in it. The only way through. */
export const FENCE_GAP = 2;

/** Half-width of the paved forecourt in front of the buildings. */
export const FORECOURT_HALF = 18;
/** The forecourt's near and far rows. */
export const FORECOURT_Z = { min: 16, max: 18 } as const;

/**
 * The way in, at the south end.
 *
 * There was no entrance at all: players simply materialised on the south edge on
 * open grass, which made the Grounds read as a screen rather than as a place you
 * had walked into. A settlement with a guarded perimeter at one end and nothing
 * at the other does not make sense on its own terms.
 *
 * It is a landmark and a spawn point rather than a door — there is nothing south
 * of here yet. When there is, it becomes a Doorway with no change to the model.
 */
export const ENTRANCE = { x: 0, z: BOUNDS.maxZ - 1 } as const;

/** Where a player appears. Just inside the gate, looking up the avenue. */
export const ARRIVAL = { x: 0, z: BOUNDS.maxZ - 3 } as const;

export interface Doorway {
  id: string;
  /** Centre tile of the threshold. It spans DOOR_HALF either side along `axis`. */
  x: number;
  z: number;
  /**
   * Which way the opening runs.
   *
   * 'x' for a door in a wall that runs east-west — which is all of them so far,
   * because the buildings face the forecourt and the fence runs across the north
   * end. Stated per-door anyway so the first door in a side wall does not need
   * new machinery, the same way portals derives it from `side`.
   */
  axis: 'x' | 'z';
  /** Facing, for the arch model. 0 looks down +Z. */
  rotation: number;
  label: string;
  /** Where it goes. */
  href: string;
  /**
   * The region on the other side, checked against lib/regions before the door
   * opens. Null would mean an unguarded door, and there are none — even the two
   * starting rooms go through canEnter, so the gate logic has exactly one shape.
   */
  region: string;
  /** Shown on the sign under the arch. One line, readable at a walk. */
  blurb: string;
  /**
   * The door in the destination this one comes out of.
   *
   * The other half of the pairing in components/iso/portals, which is where the
   * rule lives: leave by a door and you arrive at its counterpart, still walking
   * the same way. Without it you enter the Machine Room having apparently
   * teleported into the middle of it, and two adjacent places stop reading as
   * adjacent.
   *
   * Null when the destination keeps no door table of its own — the Treeline is
   * an outdoor region and spawns at its own arrival cell (lib/regions), the same
   * way the Grounds fall back to ARRIVAL when nothing was remembered.
   */
  arriveAt: string | null;
}

/**
 * Every way out of the Grounds.
 *
 * This array IS the game's navigation. A route that is not in here is a route a
 * player cannot take, which is the point — adding a destination means adding a
 * door somebody has to walk to, not a link somebody has to notice.
 *
 * Each door tile sits DIRECTLY against the building it belongs to. A building
 * whose footprint ends at maxZ has its front wall at maxZ + 0.5, so the tile at
 * maxZ + 1 begins exactly at that wall. Anything further out leaves a strip of
 * grass between the lit doorway on the wall and the lit tile on the ground, and
 * the two stop reading as the same thing.
 */
export const DOORS: Doorway[] = [
  {
    id: 'machine-room',
    axis: 'x',
    x: -12,
    z: 16,
    rotation: 0,
    label: 'Machine Room',
    href: '/app/floor',
    region: 'machine-room',
    blurb: 'Your desks, and the layout that scores them.',
    arriveAt: 'mr-to-grounds',
  },
  {
    id: 'trading-floor',
    axis: 'x',
    x: 12,
    z: 16,
    rotation: 0,
    label: 'Trading Floor',
    href: '/app/trading-floor',
    region: 'trading-floor',
    blurb: 'Stalls, the Outfitter, and everyone else.',
    arriveAt: 'tf-to-grounds',
  },
  {
    /**
     * The north gate now leads to HQ, not straight to the Treeline.
     *
     * The route used to be Grounds -> Treeline -> Deep Forest, so the step
     * after "a pleasant park" was "something moves out here" with nothing in
     * between worth losing. HQ goes here: the most civilised place in the game,
     * and the last one before the fence means anything. The Treeline is reached
     * from HQ's service gate instead — see lib/hq-map.
     */
    id: 'greenwood-hq',
    axis: 'x',
    x: 0,
    z: FENCE_Z + 1,
    rotation: Math.PI,
    label: 'Greenwood HQ',
    href: '/app/hq',
    region: 'greenwood-hq',
    blurb: 'The plaza and the tower. Where the lights are run from.',
    // The Treeline has no scene yet, and will not want a door table when it
    // does: outdoor regions spawn at their own arrival cell.
    arriveAt: null,
  },
];

// ---------------------------------------------------------------------------
// Terrain
// ---------------------------------------------------------------------------

/**
 * Is this tile paved?
 *
 * Paths do three jobs at once and it is worth being explicit about them, because
 * a later change that "tidies up" the shape will break at least one:
 *
 *   1. They are where props never spawn, so a route is never blocked.
 *   2. They are drawn in a different colour, so the way to the fence is legible
 *      from the entrance without a marker or an arrow.
 *   3. They are the tutorial. A player who has been told nothing at all still
 *      walks along a path, and this one leads somewhere.
 */
export function onPath(x: number, z: number): boolean {
  // The avenue: entrance to the fence gate, dead straight.
  if (Math.abs(x) <= 2 && z >= FENCE_Z + 1 && z <= BOUNDS.maxZ) return true;
  // The forecourt in front of the two buildings.
  if (z >= FORECOURT_Z.min && z <= FORECOURT_Z.max && Math.abs(x) <= FORECOURT_HALF) return true;
  // Short spurs to each doorway.
  for (const door of DOORS) {
    if (Math.abs(x - door.x) <= 1 && Math.abs(z - door.z) <= 1) return true;
  }
  return false;
}

/** The building this tile is inside, if any. */
export function buildingAt(x: number, z: number): Building | null {
  return (
    BUILDINGS.find((b) => x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) ?? null
  );
}

/** Is this tile part of the perimeter fence? The gap is the only way through. */
export function onFence(x: number, z: number): boolean {
  return z === FENCE_Z && Math.abs(x) > FENCE_GAP;
}

export type PropKind = 'tree' | 'boulder' | 'planter';

export interface MapProp {
  x: number;
  z: number;
  kind: PropKind;
  seed: number;
  solid: boolean;
}

/** Density at a tile. Rises from the settlement end toward the treeline. */
function density(z: number): number {
  const t = Math.min(1, Math.max(0, (BOUNDS.maxZ - z) / (BOUNDS.maxZ - FENCE_Z)));
  return 0.05 + t * t * 0.26;
}

/**
 * What is standing on this tile.
 *
 * Same pure-function-of-coordinate design the Deep Forest uses, and the same
 * split: placement is on the grid, appearance is not. A tree occupies exactly
 * one integer cell so collision is arithmetic rather than geometry, while its
 * height, lean, species and rotation all vary continuously off its own seed.
 *
 * The density curve is the whole mood of the place. Near the buildings it is a
 * landscaped car park with planters in it; past the middle it thickens; the last
 * few rows before the fence are a genuine wall of trees. Walking north is
 * therefore a slow, unannounced transition from "office grounds" to "edge of a
 * forest", and nothing in the UI has to say so.
 */
export function propAt(x: number, z: number): MapProp | null {
  const gx = Math.round(x);
  const gz = Math.round(z);

  if (!inBounds(gx, gz)) return null;
  if (onPath(gx, gz) || buildingAt(gx, gz) || onFence(gx, gz)) return null;
  // Nothing grows immediately outside a doorway or the entrance arch, or either
  // could be walled in by its own landscaping.
  for (const door of DOORS) {
    if (Math.hypot(gx - door.x, gz - door.z) < DOOR_HALF + 3) return null;
  }
  if (Math.hypot(gx - ENTRANCE.x, gz - ENTRANCE.z) < 4) return null;
  // Keep the strip in front of the fence clear so the fence is READ as a fence
  // rather than glimpsed between trunks. It is the single most important prop in
  // the region — see FenceSection in components/iso/OutdoorDressing.
  if (gz > FENCE_Z && gz < FENCE_Z + 4) return null;

  if (hash(gx, gz, 1) > density(gz)) return null;

  // Minimum spacing: a candidate whose already-scanned neighbour won is dropped.
  // Density alone controls how many props exist, not how they are spread — an
  // independent roll per tile clumps into thickets with bald patches between
  // them. Only looking backwards keeps it deterministic and single-pass.
  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dz = -1; dz <= 1; dz += 1) {
      if (dx === 0 && dz === 0) continue;
      if (dz > 0 || (dz === 0 && dx > 0)) continue;
      const nx = gx + dx;
      const nz = gz + dz;
      if (!inBounds(nx, nz)) continue;
      if (onPath(nx, nz) || buildingAt(nx, nz) || onFence(nx, nz)) continue;
      if (hash(nx, nz, 1) <= density(nz)) return null;
    }
  }

  const roll = hash(gx, gz, 2);
  // Planters only near the buildings: they are landscaping, and landscaping
  // stops where the maintenance does. Where it stops is the first quiet sign
  // that the settlement's reach has an edge.
  const kind: PropKind =
    gz > FORECOURT_Z.min - 8 && roll > 0.55 ? 'planter' : roll > 0.86 ? 'boulder' : 'tree';

  return { x: gx, z: gz, kind, seed: Math.round(hash(gx, gz, 3) * 100000), solid: true };
}

/** Every prop on the map. Small enough that one pass is cheap. */
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

/**
 * May a player stand here?
 *
 * The doorway tiles are walkable even though they sit against a building — the
 * door is the one part of the wall you are meant to reach.
 *
 * THE FENCE LINE IS THE EDGE OF THE REGION, gap included. The gap is drawn open
 * because it is a gate and a gate you cannot see is a gate you cannot plan a
 * route to; but walking through it does not lead anywhere, because what is on
 * the other side is the Treeline, which is a separate region reached through the
 * arch on THIS side. Leaving the opening passable let a player wander into the
 * strip past the fence — no content, no way on, and no way back except
 * retracing. A pocket of nothing reads as a broken map, not as a boundary.
 */
export function isWalkable(x: number, z: number): boolean {
  const gx = Math.round(x);
  const gz = Math.round(z);
  if (!inBounds(gx, gz)) return false;
  if (gz <= FENCE_Z) return false;
  if (DOORS.some((d) => d.x === gx && d.z === gz)) return true;
  if (buildingAt(gx, gz)) return false;
  const prop = propAt(gx, gz);
  return !prop || !prop.solid;
}

/** Every tile a threshold covers. Three, centred on the doorway. */
export function doorCells(door: Doorway): Array<{ x: number; z: number }> {
  const out: Array<{ x: number; z: number }> = [];
  for (let o = -DOOR_HALF; o <= DOOR_HALF; o += 1) {
    out.push(door.axis === 'x' ? { x: door.x + o, z: door.z } : { x: door.x, z: door.z + o });
  }
  return out;
}

/**
 * The doorway this position is standing in, if any.
 *
 * Rectangular rather than a radius: a door is a gap in a wall, so it is wide
 * along the wall and has no depth at all. The old circular test made the tile
 * directly IN FRONT of a door count as being in it, which was harmless while a
 * door needed a button press and is not now that walking through one is what
 * opens it — you would be taken somewhere you were only walking past.
 */
export function doorAt(x: number, z: number): Doorway | null {
  return (
    DOORS.find((d) =>
      d.axis === 'x'
        ? Math.abs(x - d.x) <= DOOR_HALF && Math.abs(z - d.z) <= DOOR_DEPTH
        : Math.abs(z - d.z) <= DOOR_HALF && Math.abs(x - d.x) <= DOOR_DEPTH
    ) ?? null
  );
}
