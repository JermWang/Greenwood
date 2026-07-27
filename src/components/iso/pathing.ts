'use client';

// Grid pathfinding for the walkable maps.
//
// Characters used to teleport, so nothing on the floor could be in the way.
// Now that they walk, the route has to go AROUND the planters and the stalls —
// a character strolling through a bench is worse than one that blinks, because
// blinking never claimed to be physical in the first place.

export interface Cell {
  x: number;
  z: number;
}

export interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export const cellId = (x: number, z: number) => `${x}:${z}`;

/**
 * Can a character stand on this cell?
 *
 * A predicate rather than a set, because the two kinds of map in this game
 * answer the question differently and both are legitimate. A room has a handful
 * of obstacles and knows them by name, so a Set is natural. An outdoor map is
 * generated — `propAt` is a pure function of the coordinate and there is no list
 * anywhere — so enumerating thousands of blocked cells to build a Set, on every
 * route, would be doing arithmetic backwards.
 *
 * One BFS takes the predicate and the Set versions adapt to it, so there is a
 * single definition of what a route is. There used to be two: this one, and a
 * near-copy inside DeepForestPlayer that had drifted — no corner rule, and a
 * hard visit cap set BELOW the size of its own map, so any walk long enough to
 * spread the search wide silently returned no route at all and clicking simply
 * did nothing.
 */
export type Walkable = (x: number, z: number) => boolean;

/** The eight steps, orthogonals first so straight runs win ties over diagonals. */
const STEPS: Array<[number, number]> = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

const inside = (x: number, z: number, b: Bounds) =>
  x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ;

/**
 * Breadth-first route from `from` to `to`, excluding the starting cell.
 *
 * BFS rather than A*: even the largest map here is under nine thousand cells,
 * which BFS clears in well under a millisecond, and it is the version that is
 * obviously correct at a glance. A* would be optimising a cost nobody is paying.
 *
 * NO VISIT CAP, deliberately. `cameFrom` already prevents revisiting, so the
 * search is bounded by the area of `bounds` and terminates on its own. A cap on
 * top of that is a second bound that can be set wrong — and was, which is the
 * bug described on Walkable above. The bounds rectangle is the honest limit.
 *
 * Returns an empty array when there is no route, so a caller that walks the
 * result simply does not move — better than a character setting off toward a
 * destination it can never reach.
 */
export function findPathWhere(from: Cell, to: Cell, bounds: Bounds, walkable: Walkable): Cell[] {
  if (from.x === to.x && from.z === to.z) return [];
  if (!inside(to.x, to.z, bounds) || !walkable(to.x, to.z)) {
    const near = nearestOpenWhere(to, bounds, walkable);
    if (!near) return [];
    to = near;
    if (from.x === to.x && from.z === to.z) return [];
  }

  const start = cellId(from.x, from.z);
  const goal = cellId(to.x, to.z);
  const cameFrom = new Map<string, string | null>([[start, null]]);
  const queue: Cell[] = [from];

  for (let head = 0; head < queue.length; head += 1) {
    const current = queue[head];
    const currentId = cellId(current.x, current.z);
    if (currentId === goal) break;
    for (const [dx, dz] of STEPS) {
      const nx = current.x + dx;
      const nz = current.z + dz;
      if (!inside(nx, nz, bounds)) continue;
      const id = cellId(nx, nz);
      if (cameFrom.has(id) || !walkable(nx, nz)) continue;
      // A diagonal may not cut a corner: both orthogonals have to be open, or
      // the character clips the corner of whatever is standing there. Outdoors
      // that reads as refusing to squeeze between two trunks, which is what a
      // player expects of a body with width.
      if (dx !== 0 && dz !== 0) {
        if (!walkable(current.x + dx, current.z)) continue;
        if (!walkable(current.x, current.z + dz)) continue;
      }
      cameFrom.set(id, currentId);
      queue.push({ x: nx, z: nz });
    }
  }

  if (!cameFrom.has(goal)) return [];
  const route: Cell[] = [];
  let cursor: string | null = goal;
  while (cursor && cursor !== start) {
    const [x, z] = cursor.split(':');
    route.push({ x: Number(x), z: Number(z) });
    cursor = cameFrom.get(cursor) ?? null;
  }
  return route.reverse();
}

/**
 * The closest open cell to a blocked one.
 *
 * Clicking a stall should walk you to the stall, not refuse because the stall
 * is standing on the cell you clicked. Searching outward in rings means you end
 * up on the near side of it rather than somewhere arbitrary.
 */
export function nearestOpenWhere(target: Cell, bounds: Bounds, walkable: Walkable): Cell | null {
  for (let radius = 1; radius <= 6; radius += 1) {
    let best: Cell | null = null;
    let bestScore = Infinity;
    for (let dx = -radius; dx <= radius; dx += 1) {
      for (let dz = -radius; dz <= radius; dz += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== radius) continue;
        const x = target.x + dx;
        const z = target.z + dz;
        if (!inside(x, z, bounds) || !walkable(x, z)) continue;
        const score = dx * dx + dz * dz;
        if (score < bestScore) {
          bestScore = score;
          best = { x, z };
        }
      }
    }
    if (best) return best;
  }
  return null;
}

/**
 * Can you walk from a to b in a straight line?
 *
 * Samples the segment densely enough that no cell between the two can be missed,
 * and rejects a diagonal whose two flanking cells are not both open — the same
 * corner rule the search uses, so smoothing can never produce a shortcut the
 * search itself would have refused.
 */
function clearLine(a: Cell, b: Cell, walkable: Walkable): boolean {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const steps = Math.max(Math.abs(dx), Math.abs(dz)) * 2;
  if (steps === 0) return true;
  let px = a.x;
  let pz = a.z;
  for (let i = 1; i <= steps; i += 1) {
    const x = Math.round(a.x + (dx * i) / steps);
    const z = Math.round(a.z + (dz * i) / steps);
    if (!walkable(x, z)) return false;
    if (x !== px && z !== pz && (!walkable(x, pz) || !walkable(px, z))) return false;
    px = x;
    pz = z;
  }
  return true;
}

/**
 * Pull a route straight.
 *
 * BFS returns the SHORTEST route, which is not the same as the route a person
 * would walk. On an eight-way grid a great many routes tie for shortest, and the
 * one the queue happens to reach first is a staircase — one step across, one
 * step down, repeated — because the search expands orthogonals before diagonals.
 * The character then walked that staircase literally, turning at every tile, and
 * it read as drunk rather than as pathfinding.
 *
 * String-pulling fixes it: keep the last committed waypoint, extend to the
 * furthest cell still reachable in a straight line, commit that, repeat. The
 * route covers the same ground and ends in the same place, but as a handful of
 * long legs instead of thirty short ones.
 *
 * That also happens to be most of the frame-rate fix. Every waypoint reached
 * fires `onStep`, which on the outdoor maps sets React state — so a forty-tile
 * walk was forty re-renders of the whole scene. Smoothing typically cuts a route
 * of that length to three or four legs.
 */
export function smoothPath(route: Cell[], from: Cell, walkable: Walkable): Cell[] {
  if (route.length < 2) return route;
  const out: Cell[] = [];
  let anchor = from;
  let i = 0;
  while (i < route.length) {
    // Furthest cell still on a clear line from the anchor. Scanning backwards
    // takes the longest leg available rather than the first one that happens to
    // work, which is what turns a staircase into a single diagonal.
    let best = i;
    for (let j = route.length - 1; j > i; j -= 1) {
      if (clearLine(anchor, route[j], walkable)) {
        best = j;
        break;
      }
    }
    out.push(route[best]);
    anchor = route[best];
    i = best + 1;
  }
  return out;
}

/** Set-backed route, for the rooms — they know their obstacles by name. */
export function findPath(from: Cell, to: Cell, bounds: Bounds, blocked: Set<string>): Cell[] {
  return findPathWhere(from, to, bounds, (x, z) => !blocked.has(cellId(x, z)));
}

/** Set-backed nearest-open, for the rooms. */
export function nearestOpen(target: Cell, bounds: Bounds, blocked: Set<string>): Cell | null {
  return nearestOpenWhere(target, bounds, (x, z) => !blocked.has(cellId(x, z)));
}
