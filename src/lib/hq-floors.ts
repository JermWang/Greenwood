// The tower's floors, and the lift that reaches them.
//
// NO IMPORTS. The floor a player is on has to be answerable from a route guard
// and from the renderer, and one of those has no database handle.
//
// WHY AN ELEVATOR IS NOT JUST ANOTHER DOOR
//
// Every door in this game so far is a FIXED pair: leave by this one, arrive at
// that one, and components/iso/portals asserts the two agree. That model is
// right for a wall with a hole in it and wrong for a lift, because a lift has
// one entrance and many destinations — its `arriveAt` is not a property of the
// door, it is a choice made at the moment of use.
//
// So the lift is modelled as a DIRECTORY plus a selection, not as a portal. The
// door table stays exactly as it is (it has survived two rooms and two outdoor
// hubs and there is no reason to generalise it for one case), and the vertical
// move is a different mechanism that happens to end in the same `enterRegion`
// call every horizontal one does.
//
// WHAT A FLOOR IS
//
// A region, with a number. That is the whole trick: a floor needs its own scene,
// its own bounds, its own gate and its own arrival cell, which is precisely the
// list of things a region already has. Giving floors a parallel type would mean
// a second gate check, a second arrival rule, and eventually a second answer to
// "may I be here" — the failure lib/regions exists to prevent.

export interface Floor {
  /** Storey number. 0 is the lobby; the directory is ordered by this. */
  level: number;
  /** The region this floor IS. Checked against lib/regions in the tests. */
  region: string;
  name: string;
  /** One line for the directory board. What you go there to do. */
  blurb: string;
}

/**
 * The directory.
 *
 * Two of these are regions that already exist and are already reachable on foot
 * from the Grounds — that is deliberate rather than an oversight. A tower with a
 * side entrance is ordinary, the rooms need no rebuilding, and it means the lift
 * has real destinations from the day it ships instead of a board full of
 * "coming soon". The floors that do NOT have a scene yet are still listed,
 * because a directory that hides the unfinished floors is a directory that lies
 * about how big the building is.
 *
 * Ordered as a lift panel is: ground at the bottom, climbing.
 */
export const FLOORS: Floor[] = [
  {
    level: 0,
    region: 'hq-lobby',
    name: 'Lobby',
    blurb: 'Reception, the boards, and the lifts.',
  },
  {
    level: 1,
    region: 'trading-floor',
    name: 'Trading Floor',
    blurb: 'Stalls, the Outfitter, and everyone else.',
  },
  {
    level: 2,
    region: 'machine-room',
    name: 'Machine Room',
    blurb: 'Your desks, and the layout that scores them.',
  },
  {
    level: 3,
    region: 'hq-lounge',
    name: 'The Lounge',
    blurb: 'Where the floor goes when the numbers are in.',
  },
];

const BY_REGION = new Map(FLOORS.map((f) => [f.region, f]));
const BY_LEVEL = new Map(FLOORS.map((f) => [f.level, f]));

export function floorOf(region: string | null | undefined): Floor | null {
  return region ? BY_REGION.get(region) ?? null : null;
}

export function floorAt(level: number): Floor | null {
  return BY_LEVEL.get(level) ?? null;
}

/** The lift panel, ground floor at the bottom — the order a real one reads in. */
export function directory(): Floor[] {
  return [...FLOORS].sort((a, b) => a.level - b.level);
}

/**
 * Where the lift car sits in a floor's own coordinates.
 *
 * The same cell on every floor, which is the point: a lift shaft is vertical, so
 * arriving on floor three and arriving on floor one should put you in the same
 * place relative to the building. A floor that moved its lift would read as a
 * different building.
 *
 * Floors whose scene does not exist yet still resolve here, so the cell is
 * settled before anybody draws the room around it rather than being retrofitted
 * to whatever the art ended up doing.
 */
export const LIFT_CELL = { x: 0, z: -6 } as const;

/**
 * Is this a move the lift can make?
 *
 * Only refuses the no-op. It deliberately does NOT decide whether the player may
 * enter the destination — that is `canEnter`'s job, checked server-side at
 * `/api/regions/enter` like every other arrival. Answering it here as well would
 * be a second opinion on the one question the region table exists to own, and
 * the two would eventually disagree.
 */
export function canRide(from: string | null, to: string): boolean {
  const target = BY_REGION.get(to);
  if (!target) return false;
  return from !== to;
}
