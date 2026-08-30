'use client';

// Doors between rooms.
//
// One table so that every room agrees on where its exits are, what they are
// called, and which tiles belong to them. Before this the Trading Floor had a
// hard-coded exit to the Machine Room and the Machine Room had no exit at all —
// you could walk out of the social space and then had to use the nav rail to get
// back, which makes the two rooms feel like web pages rather than places.
//
// A door is defined once and consumed three times: to draw the frame and the
// ground chevrons, to TINT THE TILES so the way out is legible before you go
// looking for it, and to decide whether the player is standing in it. Deriving
// all three from one definition is what stops the painted threshold and the
// actual trigger from drifting apart.

import type { Bounds, Cell } from './pathing';

/**
 * Which edge of the room a door sits on, in world terms rather than screen ones.
 *
 * This is the source of truth for a door's geometry: its outward normal, the
 * axis its opening runs along, which way you step to get inside, and which way
 * you should be facing when you arrive are all derived from it. They used to be
 * written out per-door, which is how they drifted apart.
 *
 * The compass is global and shared by every room. +Z is south, -Z is north, +X
 * is east, -X is west. That convention is what lets travel between two separate
 * scenes read as movement through one connected world.
 */
export type Side = 'north' | 'south' | 'east' | 'west';

/**
 * Outward normal of each side: the direction you travel when you leave through
 * a door on it, as an angle about Y where 0 points toward +Z.
 */
const OUTWARD: Record<Side, number> = {
  south: 0,
  north: Math.PI,
  east: Math.PI / 2,
  west: -Math.PI / 2,
};

/** Unit step, in tiles, for each side's outward normal. */
const STEP: Record<Side, Cell> = {
  south: { x: 0, z: 1 },
  north: { x: 0, z: -1 },
  east: { x: 1, z: 0 },
  west: { x: -1, z: 0 },
};

export const OPPOSITE: Record<Side, Side> = {
  north: 'south',
  south: 'north',
  east: 'west',
  west: 'east',
};

export interface Door {
  id: string;
  /** Where it goes, for the sign and the HUD. */
  label: string;
  href: string;
  /** Centre tile of the opening. */
  x: number;
  z: number;
  /**
   * Tiles either side of centre. 1 gives a three-tile opening — wide enough to
   * be obvious from across the room and to walk into without aiming.
   */
  half: number;
  /** Which edge of the room this door is cut into. Everything else follows. */
  side: Side;
  /**
   * The door in the destination this one comes out of.
   *
   * Named explicitly rather than inferred so a third room — where a single
   * "the other door" no longer identifies anything — needs no new machinery.
   *
   * For a room-to-room door it must be on the OPPOSITE side of its room to this
   * one, or the world stops being continuous: leave by the south door and you
   * have to arrive at the destination's north door, or you have travelled south
   * and come out facing back the way you came. portals.test asserts that for
   * every pair.
   */
  arriveAt: string;
  /**
   * True when the destination is an OUTDOOR region rather than another room.
   *
   * Outdoor regions do not have edge doors — their ways in are placed against
   * buildings in the middle of a generated map, and they live in that region's
   * own map module (lib/grounds-map) rather than in this table. So the mutual
   * pairing and opposite-sides rules cannot be checked here and are not claimed.
   *
   * What still holds, and what portals.test checks by importing the other
   * module, is that `arriveAt` names a doorway that actually exists over there.
   * The invariant survives the boundary; only the place it is proven moves.
   */
  outdoor?: true;
}

/** Direction of travel when leaving through this door, radians about Y. */
export const outwardFacing = (door: Door): number => OUTWARD[door.side];

/**
 * Which axis the opening runs along.
 *
 * A door on the north or south edge is cut through a wall that runs east-west,
 * so its opening widens along X; an east or west door widens along Z.
 */
export const doorAxis = (door: Door): 'x' | 'z' =>
  door.side === 'north' || door.side === 'south' ? 'x' : 'z';

/**
 * The Trading Floor's south doors.
 *
 * On the near edge deliberately: the two far edges carry the glazed walls, and
 * an exit you cannot see is an exit nobody takes.
 */
export const TRADING_FLOOR_DOORS: Door[] = [
  {
    id: 'to-machine-room',
    label: 'Machine Room',
    href: '/app/floor',
    x: 0,
    z: 11,
    half: 1,
    side: 'south',
    arriveAt: 'to-trading-floor',
  },
  {
    id: 'tf-to-grounds',
    label: 'Outside',
    href: '/app/grounds',
    // Same south wall as the Machine Room door, offset along it. Two doors in
    // one wall is ordinary; two doors in one DOORWAY is not, and half = 1 means
    // each covers three tiles, so -7 clears x = 0 with room to spare.
    x: -7,
    z: 11,
    half: 1,
    side: 'south',
    arriveAt: 'trading-floor',
    outdoor: true,
  },
];

/**
 * The Machine Room's way back — on its NORTH edge, because the Trading Floor is
 * north of it.
 *
 * This used to sit on the south edge, matching the Trading Floor's own south
 * door, on the reasoning that two separate scenes need not agree geographically
 * and that a door on the near edge is easier to see. That was wrong, and it is
 * the thing that made travel feel like following links rather than walking:
 * you left the Trading Floor heading SOUTH, and arrived at the SOUTH end of the
 * Machine Room, which meant your first act in the new room was to turn around
 * and walk back north. The two rooms each made sense alone and the journey
 * between them did not.
 *
 * The rule now is global. Leave by a south door and you enter the next room
 * through its north one, still heading south, still walking the same way you
 * were a moment ago. Rooms are separate scenes but they occupy one compass.
 *
 * A factory rather than a constant because the buildable area grows to take in
 * desks an older layout left further out, and a door pinned to the old edge
 * would end up in the middle of the floor.
 */
export function machineRoomDoors(bounds: Bounds): Door[] {
  return [
    {
      id: 'to-trading-floor',
      label: 'Trading Floor',
      href: '/app/trading-floor',
      x: Math.round((bounds.minX + bounds.maxX) / 2),
      z: bounds.minZ,
      half: 1,
      side: 'north',
      arriveAt: 'to-machine-room',
    },
    /**
     * The way outside.
     *
     * On the SOUTH edge because the settlement sits at the south end of the
     * Grounds and the wilderness at the north — so leaving a building means
     * heading south into the forecourt, and every arrival in the Grounds faces
     * that way. Putting it anywhere else would make walking out of your own
     * floor a change of direction.
     *
     * Without this door the Grounds are a trap: you can walk into the Machine
     * Room and the only way back out is the URL bar, which is the exact failure
     * the no-nav-rail rule is supposed to prevent rather than cause.
     */
    {
      id: 'mr-to-grounds',
      label: 'Outside',
      href: '/app/grounds',
      x: Math.round((bounds.minX + bounds.maxX) / 2),
      z: bounds.maxZ,
      half: 1,
      side: 'south',
      arriveAt: 'machine-room',
      outdoor: true,
    },
  ];
}

/**
 * Which door a room should spawn you at, remembered across the transition.
 *
 * Rooms are separate scenes, so without this you materialise at a fixed point
 * in the middle of the next one — you walk out of the south doors of the
 * Trading Floor and appear in the centre of the Machine Room, having apparently
 * teleported. Arriving at the matching threshold and stepping in is what makes
 * two scenes read as two connected places.
 *
 * sessionStorage rather than a route param: it survives the client-side
 * navigation, it is per-tab, and a stale value cannot do anything worse than
 * put you at a door you did in fact use last.
 */
const ARRIVAL_KEY = 'evergreen:arrived-from';

export function rememberExit(doorId: string) {
  try {
    window.sessionStorage.setItem(ARRIVAL_KEY, doorId);
  } catch {
    // Private mode and blocked storage both land here. Spawning at the default
    // point is a worse entrance, not a broken one.
  }
}

/** Consumed on arrival, so a later reload spawns normally rather than re-entering. */
export function takeArrival(): string | null {
  try {
    const value = window.sessionStorage.getItem(ARRIVAL_KEY);
    window.sessionStorage.removeItem(ARRIVAL_KEY);
    return value;
  } catch {
    return null;
  }
}

/**
 * How far inside the threshold you land.
 *
 * Two tiles, not one. `atDoor` allows a tile of slack so that stopping just
 * short of a door still opens it, which means a single step inside is still
 * "at" the door — you would arrive and immediately be sent back where you came
 * from. Two clears the slack with nothing to spare.
 */
const ARRIVAL_INSET = 2;

/**
 * Where to stand after coming through a door.
 *
 * Stepped inward along the door's own normal rather than along a fixed axis.
 * The previous version subtracted from z (or x) whichever side the door was on,
 * which is only correct for doors on a room's maximum edge — a door on the
 * north or west edge would put you two tiles OUTSIDE the room, through the wall.
 * That was survivable only because every door happened to sit on a max edge,
 * and it broke the moment one did not.
 */
export function arrivalCell(door: Door): Cell {
  const step = STEP[door.side];
  return { x: door.x - step.x * ARRIVAL_INSET, z: door.z - step.z * ARRIVAL_INSET };
}

/**
 * Which way to face on arrival: inward, along the same global heading you were
 * travelling when you left the previous room.
 *
 * Without this the character always spawned at angle 0 — facing +Z — whatever
 * door they came through, so arriving through a south door put you looking back
 * out of the doorway you had just walked in from. Because a door is entered by
 * its opposite number, "inward" here is exactly the direction you were already
 * moving, which is what makes the transition read as one continuous walk.
 */
export const arrivalFacing = (door: Door): number => OUTWARD[OPPOSITE[door.side]];

/** Every tile the opening covers. */
export function doorCells(door: Door): Cell[] {
  const out: Cell[] = [];
  for (let offset = -door.half; offset <= door.half; offset += 1) {
    out.push(
      doorAxis(door) === 'x' ? { x: door.x + offset, z: door.z } : { x: door.x, z: door.z + offset }
    );
  }
  return out;
}

const within = (door: Door, x: number, z: number, slack: number) =>
  doorAxis(door) === 'x'
    ? Math.abs(x - door.x) <= door.half && Math.abs(z - door.z) <= slack
    : Math.abs(z - door.z) <= door.half && Math.abs(x - door.x) <= slack;

/** True on the painted threshold itself — used to tint the tiles. */
export const isDoorCell = (door: Door, x: number, z: number) => within(door, x, z, 0);

/**
 * True when the player is close enough to use it.
 *
 * One tile of slack, so stopping just short still counts. A door that only fires
 * on the exact centre tile reads as broken.
 */
export const atDoor = (door: Door, x: number, z: number) => within(door, x, z, 1);

/** The door the player is standing in, if any. */
export function doorAt(doors: Door[], x: number, z: number): Door | null {
  return doors.find((door) => atDoor(door, x, z)) ?? null;
}

/** Whether any door covers this tile, for the ground-tint pass. */
export function doorTileAt(doors: Door[], x: number, z: number): Door | null {
  return doors.find((door) => isDoorCell(door, x, z)) ?? null;
}
