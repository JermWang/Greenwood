// The Deep Forest map — one definition, shared by the renderer and the server.
//
// This module has NO imports. That is the point of it.
//
// The map used to be generated inside the scene component, which meant the
// forest existed only in the browser. Every client computed the same trees, so
// players did see the same world — but the SERVER did not know where anything
// was, and a server that cannot see the terrain cannot validate a step. It
// cannot say "you walked through a tree", it cannot say "you are not adjacent to
// that loot pile", and in a PvP zone it cannot say "you do not have line of
// sight". Every one of those checks would have had to trust the client.
//
// So the map is defined here, in plain arithmetic with no dependencies, and both
// halves import it. The scene draws what this says. The server validates against
// what this says. They cannot disagree, because there is only one of them.
//
// Two ideas are deliberately kept apart:
//
//   PLACEMENT IS ON THE GRID. Every prop occupies exactly one integer cell. That
//   is what makes collision a set lookup instead of a geometry problem, what
//   lets the existing tile pathfinder work out here unchanged, and what stops
//   "am I behind that tree" from being a matter of opinion.
//
//   APPEARANCE IS NOT. Rotation, height, species and lean all vary continuously
//   off the same seed. A wood reads as natural because its trees are different
//   from each other, not because they sit at irrational coordinates — and a
//   half-tile offset buys nothing visually while making every spatial question
//   harder to answer.

/**
 * The map seed.
 *
 * A constant, not a per-session value. Everyone plays the same forest, forever:
 * the terrain is a place, and a place that regenerated between sessions could
 * never be learned. Learning the map — knowing where the cover is, knowing which
 * approach to a generator is open — is most of the skill this zone rewards.
 *
 * Changing this number moves every tree in the world.
 */
export const MAP_SEED = 0x67726e77; // "grnw"

/**
 * Half-width of the playable area, in tiles.
 *
 * The full map is (EXTENT * 2 + 1) squared. Well below the 220 in REGIONS,
 * which is the design target and needs chunked streaming to reach; this is what
 * one draw call can carry today. Growing it is a number change here.
 */
export const EXTENT = 46;

/** Radius of the central clearing where the generators sit. */
export const CLEARING = 11;

/** Distance from an extraction gate that counts as reaching it. */
export const GATE_RADIUS = 3;

export type PropKind = 'tree' | 'dead' | 'boulder';

export interface MapProp {
  /** Integer tile. Exactly one prop per cell. */
  x: number;
  z: number;
  kind: PropKind;
  /** Per-prop seed for appearance only — never for position. */
  seed: number;
  /** Whether a player may walk through this cell. */
  solid: boolean;
}

/**
 * Deterministic hash.
 *
 * Inlined rather than imported from mapkit so this module stays dependency-free
 * and can be loaded by the server without dragging a client module in behind it.
 * Integer-only and order-sensitive, so (3,7) and (7,3) differ.
 */
function hash(x: number, z: number, salt = 0): number {
  let h = 2166136261 ^ MAP_SEED;
  for (const v of [x | 0, z | 0, salt | 0]) {
    h ^= v + 0x9e3779b9 + (h << 6) + (h >>> 2);
    h = Math.imul(h ^ (h >>> 15), 2246822519);
  }
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

/**
 * Is there a prop on this tile, and what?
 *
 * A pure function of the coordinate, which is what makes the whole design work:
 * neither side stores a map, neither side sends one, and a client asking "what
 * is at (12, -30)" gets the same answer as the server asking the same question.
 * It also means collision costs nothing — there is no list to search.
 */
export function propAt(x: number, z: number): MapProp | null {
  const gx = Math.round(x);
  const gz = Math.round(z);

  if (Math.abs(gx) > EXTENT || Math.abs(gz) > EXTENT) return null;

  const r = Math.hypot(gx, gz);
  // The clearing is kept empty so the generators in the middle are approached
  // across open ground. The last thirty metres being exposed is what turns
  // "walk to the objective" into a decision.
  if (r < CLEARING) return null;
  if (r > EXTENT) return null;

  // Gate aprons stay clear, or a gate could be walled in by its own forest and
  // the only exit would be unreachable.
  for (const gate of GATES) {
    if (Math.hypot(gx - gate.x, gz - gate.z) < GATE_RADIUS + 2) return null;
  }

  // Density. Thinner near the clearing edge so the treeline feathers instead of
  // ending in a wall, and thicker further out.
  //
  // Cut hard from 0.16..0.46. At that range the map carried well over two
  // thousand trees, each a separate group of five meshes — roughly ten thousand
  // draw calls a frame, which dropped the zone to single-digit FPS. Even
  // instanced, that many trunks is more silhouette than a player can read: a
  // wood stops looking denser past a point and just starts looking solid.
  //
  // These numbers set how many trees EXIST, which is a gameplay question as much
  // as a performance one — every one of them is cover, and cover you cannot see
  // past is a wall.
  const t = Math.min(1, (r - CLEARING) / (EXTENT - CLEARING));
  const density = 0.03 + t * 0.05;
  if (hash(gx, gz, 1) > density) return null;

  // Minimum spacing, enforced by suppressing a prop that has a neighbour in the
  // eight cells around it.
  //
  // Density alone controls how MANY trees there are, not how they are
  // distributed — an independent roll per tile clumps, because nothing stops
  // four adjacent cells all passing. The result was thickets with bald patches
  // between them rather than a wood. Rejecting a candidate whose lower-ordered
  // neighbour already won spreads them out without needing a second pass, and
  // the ordering keeps it deterministic: whichever cell comes first in the scan
  // wins, and every client scans the same way.
  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dz = -1; dz <= 1; dz += 1) {
      if (dx === 0 && dz === 0) continue;
      if (dz > 0 || (dz === 0 && dx > 0)) continue; // only look backwards
      const nr = Math.hypot(gx + dx, gz + dz);
      if (nr < CLEARING || nr > EXTENT) continue;
      const nt = Math.min(1, (nr - CLEARING) / (EXTENT - CLEARING));
      if (hash(gx + dx, gz + dz, 1) <= 0.03 + nt * 0.05) return null;
    }
  }

  const roll = hash(gx, gz, 2);
  const kind: PropKind = roll > 0.88 ? 'dead' : roll > 0.82 ? 'boulder' : 'tree';

  return {
    x: gx,
    z: gz,
    kind,
    seed: Math.round(hash(gx, gz, 3) * 100000),
    // Everything blocks. A wood you can walk through is a field with decoration
    // in it, and cover that does not stop you is not cover.
    solid: true,
  };
}

/** Every prop in a rectangle. Used by the renderer; the server never needs it. */
export function propsIn(minX: number, maxX: number, minZ: number, maxZ: number): MapProp[] {
  const out: MapProp[] = [];
  for (let x = Math.ceil(minX); x <= Math.floor(maxX); x += 1) {
    for (let z = Math.ceil(minZ); z <= Math.floor(maxZ); z += 1) {
      const prop = propAt(x, z);
      if (prop) out.push(prop);
    }
  }
  return out;
}

/** The whole map. Fine at EXTENT 46; replace with propsIn once streaming lands. */
export function allProps(): MapProp[] {
  return propsIn(-EXTENT, EXTENT, -EXTENT, EXTENT);
}

/**
 * May a player stand here?
 *
 * The one function the server needs from this module. Everything else is for
 * drawing.
 */
export function isWalkable(x: number, z: number): boolean {
  const gx = Math.round(x);
  const gz = Math.round(z);
  if (Math.abs(gx) > EXTENT || Math.abs(gz) > EXTENT) return false;
  const prop = propAt(gx, gz);
  return !prop || !prop.solid;
}

// ---------------------------------------------------------------------------
// Fixed features
// ---------------------------------------------------------------------------

/**
 * Extraction gates, on the four compass edges.
 *
 * Hand-placed rather than scattered. Extraction has to be predictable — a player
 * cannot plan a route out to a gate whose position they must first discover, and
 * planning the route out is the entire second half of a run.
 */
export const GATES: Array<{ x: number; z: number; rotation: number; name: string }> = [
  { x: 0, z: EXTENT - 3, rotation: 0, name: 'South Gate' },
  { x: 0, z: -(EXTENT - 3), rotation: Math.PI, name: 'North Gate' },
  { x: EXTENT - 3, z: 0, rotation: Math.PI / 2, name: 'East Gate' },
  { x: -(EXTENT - 3), z: 0, rotation: -Math.PI / 2, name: 'West Gate' },
];

/**
 * The generator field in the central clearing.
 *
 * One still running. It is the only neon in the world besides an extraction
 * gate and the player's own equipment, which is what makes finding it read as
 * significant without any text saying so.
 */
export const GENERATORS: Array<{ x: number; z: number; seed: number; live: boolean }> = [
  { x: 0, z: 0, seed: 1, live: true },
  { x: -6, z: 4, seed: 2, live: false },
  { x: 5, z: -5, seed: 3, live: false },
  { x: 7, z: 6, seed: 4, live: false },
];

export type GatherKind = 'scrap' | 'timber' | 'cable';

export interface MapNode {
  id: string;
  x: number;
  z: number;
  kind: GatherKind;
  seed: number;
}

/**
 * Salvage nodes, on the same deterministic basis as everything else.
 *
 * Each carries a stable `id` derived from its tile, so the server can record
 * "this node is on cooldown" against a key both sides already agree on — no
 * node table, no synchronisation, no way for a client to invent a node.
 */
export function salvageNodes(): MapNode[] {
  const kinds: GatherKind[] = ['scrap', 'cable', 'timber'];
  const out: MapNode[] = [];
  const step = 7;
  for (let x = -EXTENT + 5; x <= EXTENT - 5; x += step) {
    for (let z = -EXTENT + 5; z <= EXTENT - 5; z += step) {
      if (hash(x, z, 11) > 0.4) continue;
      // Nudged onto a nearby tile so the lattice does not show, then rounded —
      // a node still lands on exactly one cell.
      const nx = x + Math.round((hash(x, z, 12) - 0.5) * 5);
      const nz = z + Math.round((hash(x, z, 13) - 0.5) * 5);
      if (Math.hypot(nx, nz) < CLEARING * 0.7) continue;
      if (Math.abs(nx) > EXTENT - 2 || Math.abs(nz) > EXTENT - 2) continue;
      // A node inside a tree is a node nobody can reach.
      if (propAt(nx, nz)) continue;
      out.push({
        id: `${nx}:${nz}`,
        x: nx,
        z: nz,
        kind: kinds[Math.floor(hash(x, z, 14) * kinds.length)],
        seed: Math.round(hash(x, z, 15) * 100000),
      });
    }
  }
  return out;
}

/** Which gate, if any, this position is close enough to extract at. */
export function gateAt(x: number, z: number) {
  return GATES.find((g) => Math.hypot(x - g.x, z - g.z) <= GATE_RADIUS) ?? null;
}
