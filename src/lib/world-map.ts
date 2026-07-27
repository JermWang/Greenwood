// The world, as a graph you can draw.
//
// Zero imports beyond the region table, and no React — this is the SHAPE of the
// world, not a picture of it. Where regions sit relative to each other is a fact
// about the world (the Trading Floor is north of the Machine Room; the Treeline
// is past the fence at the north end of the Grounds), and facts about the world
// belong next to the other ones rather than inside a component.
//
// WHY THIS EXISTS
//
// CLAUDE.md forbids a nav rail: navigation happens in the world, and it does —
// you walk to doors. What that costs is ORIENTATION. A player three regions deep
// with no menu has no way to answer "where am I" or "how do I get back", and the
// honest answer to that is not a nav rail, it is a MAP: a diagram of a place,
// which every real settlement has pinned up somewhere. A map tells you where you
// are and leaves the walking to you. A nav rail does the walking for you, which
// is the part that would break the game.
//
// So nothing here navigates. It is a picture with a "you are here" on it.

import { REGIONS, type RegionId } from './regions';

/**
 * Where each region sits on the diagram, in abstract grid units.
 *
 * NOT world coordinates. Regions are separate scenes with their own origins and
 * wildly different extents — the Machine Room is 25x33 tiles and the Deep Forest
 * is 93x93 — so plotting them to scale would produce a map that is mostly Deep
 * Forest and unreadable. What a player needs from this is topology: what is
 * adjacent to what, and which way. The compass directions here match the ones
 * the doors actually use, so the diagram never contradicts the walk.
 *
 * +x is east, +y is SOUTH, matching the world's +Z-is-south convention. Keeping
 * the two the same means "the Treeline is up and to the left on the map" and "I
 * walked north-west to get there" agree, which is the entire point of a map.
 */
export const MAP_LAYOUT: Record<RegionId, { x: number; y: number }> = {
  'deep-forest': { x: 2, y: -3 },
  treeline: { x: 1, y: -2 },
  'hq-lobby': { x: -1, y: -2 },
  'hq-lounge': { x: -2, y: -1 },
  'greenwood-hq': { x: 0, y: -1 },
  grounds: { x: 0, y: 0 },
  'machine-room': { x: -1, y: 1 },
  'trading-floor': { x: 1, y: 1 },
};

/**
 * The walkable connections, as unordered pairs.
 *
 * Derived by hand rather than from the door tables because the door tables are
 * split across two modules by design (rooms in components/iso/portals, outdoor
 * doorways in lib/grounds-map) and neither is importable from a server context.
 * There is a test asserting this list matches the doors that actually exist, so
 * the duplication cannot silently drift.
 */
export const MAP_LINKS: Array<[RegionId, RegionId]> = [
  ['grounds', 'machine-room'],
  ['grounds', 'trading-floor'],
  ['machine-room', 'trading-floor'],
  ['grounds', 'greenwood-hq'],
  ['greenwood-hq', 'hq-lobby'],
  // The lift: every floor is one hop from the tower, not a chain through the
  // floors below it. That is what a lift IS.
  ['greenwood-hq', 'hq-lounge'],
  ['greenwood-hq', 'treeline'],
  ['treeline', 'deep-forest'],
];

/**
 * Home. Where "get me back" means.
 *
 * The Grounds rather than the Machine Room, because the Grounds are the hub —
 * every other place is one walk from them, and a player who gets back here can
 * reach anything. Routing home to a room you then have to walk out of would add
 * a step to every single recovery.
 */
export const HOME: RegionId = 'grounds';

/**
 * How each region LOOKS on the map.
 *
 * Derived from the region's lighting profile rather than invented, so the
 * diagram is tinted the colour the place actually is: the Grounds are overcast
 * green, the rooms are interior grey, the Treeline is amber dusk and the Deep
 * Forest is moonlit blue. A player who has been somewhere recognises it on the
 * map without reading the label, which is the entire difference between a map
 * and a list of names.
 *
 * `motif` picks the fill pattern — trees for the wooded regions, a floor grid
 * for the interiors. At this size that reads as texture rather than as detail,
 * and texture is what stops five rectangles looking like five buttons.
 */
export const REGION_STYLE: Record<
  RegionId,
  { fill: string; edge: string; motif: 'grid' | 'trees' | 'dense' }
> = {
  'greenwood-hq': { fill: '#4a4d47', edge: '#9aa08f', motif: 'grid' },
  'hq-lobby': { fill: '#3f423c', edge: '#8d9184', motif: 'grid' },
  'hq-lounge': { fill: '#46403a', edge: '#94897c', motif: 'grid' },
  'machine-room': { fill: '#3a3a34', edge: '#6f6d64', motif: 'grid' },
  'trading-floor': { fill: '#43403a', edge: '#7d786e', motif: 'grid' },
  grounds: { fill: '#4a5c3c', edge: '#7d9a63', motif: 'trees' },
  treeline: { fill: '#4d3f2c', edge: '#a8763f', motif: 'trees' },
  'deep-forest': { fill: '#1e2b33', edge: '#4a648a', motif: 'dense' },
};

export interface MapNode {
  id: RegionId;
  name: string;
  x: number;
  y: number;
  href: string;
  /** True when this is where the player is standing. */
  here: boolean;
  /** True when the player could walk in right now. */
  open: boolean;
  /** Why not, when they cannot. */
  locked: string | null;
  /** Drawn as a warning pip. Somewhere that can hurt you should look like it. */
  dangerous: boolean;
  fill: string;
  edge: string;
  motif: 'grid' | 'trees' | 'dense';
}

/**
 * Shortest hop-count route between two regions, as region ids.
 *
 * Breadth-first over MAP_LINKS. The world is five nodes and will not be
 * thousands, so the obvious algorithm is the right one — and unlike the tile
 * pathfinder this one is answering "which doors do I go through", not "which
 * cells do I cross".
 *
 * Returns an empty array when there is no route at all, which is different from
 * a route of length zero (already there). Callers have to tell those apart: one
 * means "you are home", the other means the map is broken.
 */
export function routeBetween(from: RegionId, to: RegionId): RegionId[] {
  if (from === to) return [from];
  const neighbours = new Map<RegionId, RegionId[]>();
  for (const [a, b] of MAP_LINKS) {
    if (!neighbours.has(a)) neighbours.set(a, []);
    if (!neighbours.has(b)) neighbours.set(b, []);
    neighbours.get(a)!.push(b);
    neighbours.get(b)!.push(a);
  }

  const cameFrom = new Map<RegionId, RegionId | null>([[from, null]]);
  const queue: RegionId[] = [from];
  for (let head = 0; head < queue.length; head += 1) {
    const at = queue[head];
    if (at === to) break;
    for (const next of neighbours.get(at) ?? []) {
      if (cameFrom.has(next)) continue;
      cameFrom.set(next, at);
      queue.push(next);
    }
  }
  if (!cameFrom.has(to)) return [];

  const route: RegionId[] = [];
  let cursor: RegionId | null = to;
  while (cursor) {
    route.unshift(cursor);
    cursor = cameFrom.get(cursor) ?? null;
  }
  return route;
}

/** The next region to walk to on the way home, or null when already there. */
export function stepHome(from: RegionId): RegionId | null {
  const route = routeBetween(from, HOME);
  return route.length > 1 ? route[1] : null;
}

/** Every region as a drawable node, given who is asking and where they are. */
export function mapNodes(
  at: RegionId | null,
  verdicts: Array<{ id: string; allowed: boolean; reason: string | null }>
): MapNode[] {
  const byId = new Map(verdicts.map((v) => [v.id, v]));
  return REGIONS.map((region) => {
    const verdict = byId.get(region.id);
    return {
      id: region.id,
      name: region.name,
      ...MAP_LAYOUT[region.id],
      href: region.href,
      here: region.id === at,
      // Unknown verdicts read as OPEN rather than locked. The map is a
      // convenience; the door is the authority, and a map that greys out places
      // a player can actually reach is worse than one that occasionally offers a
      // walk that ends in a polite refusal at the gate.
      open: verdict ? verdict.allowed : true,
      locked: verdict && !verdict.allowed ? verdict.reason : null,
      dangerous: region.pvp || region.hostiles,
      ...REGION_STYLE[region.id],
    };
  });
}
