// Door geometry, and the one rule that makes separate scenes read as one world.
//
// These are cheap assertions about a table, which is exactly why they are worth
// having: the failure they catch is not a crash but a feeling — travel that
// reads as following links rather than walking — and nobody notices that in a
// diff. Adding the third and fourth rooms is a table entry plus a scene, and
// this is what stops entry four from quietly pointing the wrong way.

import { describe, it, expect } from 'vitest';
import {
  TRADING_FLOOR_DOORS,
  machineRoomDoors,
  arrivalCell,
  arrivalFacing,
  outwardFacing,
  doorAxis,
  doorCells,
  atDoor,
  isDoorCell,
  OPPOSITE,
  type Door,
} from './portals';
// The Grounds' own doorways, imported rather than restated — the point of the
// cross-boundary test below is that these two lists agree, which a copy would
// quietly stop proving.
import { DOORS as GROUNDS_DOORS } from '../../lib/grounds-map';

/** The Machine Room's buildable area, matching BOARD_BOUNDS in IsoBoard. */
const MACHINE_ROOM = { minX: -12, maxX: 12, minZ: -20, maxZ: 12 };

const ALL_DOORS: Door[] = [...TRADING_FLOOR_DOORS, ...machineRoomDoors(MACHINE_ROOM)];
const byId = new Map(ALL_DOORS.map((door) => [door.id, door]));

/**
 * Room-to-room doors only.
 *
 * The pairing rules below are about two doors in this table facing each other.
 * A door out to an OUTDOOR region has no counterpart here — the Grounds' ways in
 * are placed against buildings in the middle of a generated map and live in
 * lib/grounds-map. Their invariant is checked separately, and by importing that
 * module rather than by assuming it.
 */
const PAIRED = ALL_DOORS.filter((door) => !door.outdoor);

const TWO_PI = Math.PI * 2;
/** Compare angles without caring that -pi/2 and 3pi/2 are written differently. */
function sameAngle(a: number, b: number): boolean {
  const diff = Math.abs(((a - b) % TWO_PI) + TWO_PI) % TWO_PI;
  return diff < 1e-9 || Math.abs(diff - TWO_PI) < 1e-9;
}

describe('door pairing', () => {
  it('points every door at a door that exists', () => {
    for (const door of PAIRED) {
      expect(byId.get(door.arriveAt), `${door.id} arrives at unknown door ${door.arriveAt}`).toBeDefined();
    }
  });

  it('pairs doors mutually', () => {
    for (const door of PAIRED) {
      expect(byId.get(door.arriveAt)!.arriveAt, `${door.id} and ${door.arriveAt} disagree`).toBe(door.id);
    }
  });

  /**
   * The same "arrives somewhere that exists" rule, carried across the module
   * boundary rather than dropped at it.
   *
   * A door out to the Grounds stores its `arriveAt` in sessionStorage and the
   * Grounds page looks that id up in its own DOORS table. If the two ever
   * disagree, walking outside silently drops you at the default arrival point
   * instead of at the door you just came through — a bug with no error and no
   * crash, which is exactly the kind these cheap table assertions exist for.
   */
  it('points every outdoor door at a doorway the Grounds actually has', () => {
    const outdoor = ALL_DOORS.filter((door) => door.outdoor);
    expect(outdoor.length, 'the rooms should have a way back outside').toBeGreaterThan(0);
    for (const door of outdoor) {
      expect(
        GROUNDS_DOORS.some((d) => d.id === door.arriveAt),
        `${door.id} arrives at "${door.arriveAt}", which is not a doorway in the Grounds`
      ).toBe(true);
      expect(door.href).toBe('/app/grounds');
    }
  });

  /**
   * And back the other way, which is the half that is easy to forget.
   *
   * A door is only a door if it works from both sides. Getting this wrong does
   * not crash anything — you simply walk into the Machine Room and appear in the
   * middle of it, having apparently teleported, which is the exact feeling the
   * pairing rule exists to prevent and the exact bug nobody spots in a diff.
   */
  it('pairs the Grounds doorways back to the rooms they lead into', () => {
    for (const doorway of GROUNDS_DOORS) {
      if (doorway.arriveAt === null) continue; // an outdoor region; no door table
      const room = byId.get(doorway.arriveAt);
      expect(room, `Grounds doorway "${doorway.id}" arrives at unknown door ${doorway.arriveAt}`).toBeDefined();
      expect(
        room!.arriveAt,
        `${doorway.id} and ${room!.id} disagree about each other`
      ).toBe(doorway.id);
      expect(room!.href).toBe('/app/grounds');
    }
  });

  it('gives every room a way back outside', () => {
    // The Grounds are the hub. A room you can walk into and not out of turns the
    // one place navigation happens into a trap.
    for (const doorway of GROUNDS_DOORS) {
      if (doorway.arriveAt === null) continue;
      expect(
        ALL_DOORS.some((d) => d.outdoor && d.arriveAt === doorway.id),
        `nothing leads back out to the Grounds' "${doorway.id}" doorway`
      ).toBe(true);
    }
  });

  /**
   * Leaving a building means heading south.
   *
   * The settlement sits at the south end of the Grounds and the wilderness at
   * the north, so walking out of your own floor should continue the same way you
   * were already going. A north-facing exit would make stepping outside a
   * reversal, which is precisely what the opposite-sides rule exists to stop
   * between rooms — it applies just as much on the way out of one.
   */
  it('puts every way outside on a south wall', () => {
    for (const door of ALL_DOORS.filter((d) => d.outdoor)) {
      expect(door.side, `${door.id}`).toBe('south');
    }
  });

  /**
   * The load-bearing one. Leaving by a south door has to put you in the next
   * room through its north door, or you travelled south and arrived facing back
   * north — which is what made the Trading Floor and the Machine Room feel like
   * two web pages instead of two places.
   */
  it('connects opposite sides, so travel keeps its global direction', () => {
    for (const door of PAIRED) {
      const destination = byId.get(door.arriveAt)!;
      expect(
        destination.side,
        `leaving ${door.id} heads ${door.side}, so it must arrive at a ${OPPOSITE[door.side]} door — ` +
          `${destination.id} is on the ${destination.side} side`
      ).toBe(OPPOSITE[door.side]);
    }
  });

  it('keeps you walking the same way through the transition', () => {
    for (const door of PAIRED) {
      const destination = byId.get(door.arriveAt)!;
      expect(
        sameAngle(outwardFacing(door), arrivalFacing(destination)),
        `leaving ${door.id} travels ${outwardFacing(door).toFixed(2)}rad but arriving at ` +
          `${destination.id} faces ${arrivalFacing(destination).toFixed(2)}rad`
      ).toBe(true);
    }
  });
});

describe('arrival', () => {
  it('puts you inside the room, never through the wall', () => {
    // The bug the old fixed-axis version had: it always stepped toward -Z (or
    // -X), which walks you out through the wall of any door on a minimum edge.
    const machineRoom = machineRoomDoors(MACHINE_ROOM);
    for (const door of machineRoom) {
      const cell = arrivalCell(door);
      expect(cell.x).toBeGreaterThanOrEqual(MACHINE_ROOM.minX);
      expect(cell.x).toBeLessThanOrEqual(MACHINE_ROOM.maxX);
      expect(cell.z).toBeGreaterThanOrEqual(MACHINE_ROOM.minZ);
      expect(cell.z).toBeLessThanOrEqual(MACHINE_ROOM.maxZ);
    }
  });

  it('clears the door trigger, so arriving does not bounce you back', () => {
    // atDoor allows a tile of slack. Landing inside that slack would re-fire the
    // transition on the frame you arrived, ping-ponging between two rooms with
    // no way out but closing the tab.
    for (const door of ALL_DOORS) {
      const cell = arrivalCell(door);
      expect(atDoor(door, cell.x, cell.z), `arriving at ${door.id} lands back on its trigger`).toBe(false);
    }
  });

  it('lands you square in the doorway, not off to one side', () => {
    for (const door of ALL_DOORS) {
      const cell = arrivalCell(door);
      // Whichever axis the opening runs along, the arrival must share the door's
      // centre on it — otherwise you enter beside the door you came through.
      if (doorAxis(door) === 'x') expect(cell.x).toBe(door.x);
      else expect(cell.z).toBe(door.z);
    }
  });

  it('faces you into the room, not back out of the door', () => {
    for (const door of ALL_DOORS) {
      expect(
        sameAngle(arrivalFacing(door), outwardFacing(door)),
        `${door.id} spawns you facing back out through itself`
      ).toBe(false);
    }
  });
});

describe('door geometry', () => {
  it('runs the opening across the wall it is cut into', () => {
    for (const door of ALL_DOORS) {
      expect(doorAxis(door)).toBe(door.side === 'north' || door.side === 'south' ? 'x' : 'z');
    }
  });

  it('covers 2*half + 1 tiles, all of which read as door tiles', () => {
    for (const door of ALL_DOORS) {
      const cells = doorCells(door);
      expect(cells).toHaveLength(door.half * 2 + 1);
      for (const cell of cells) expect(isDoorCell(door, cell.x, cell.z)).toBe(true);
    }
  });

  it('sits on the edge of the room it belongs to', () => {
    // A door in the middle of the floor is the symptom of a bounds change that
    // did not carry the door with it.
    for (const door of machineRoomDoors(MACHINE_ROOM)) {
      const onEdge =
        door.z === MACHINE_ROOM.minZ ||
        door.z === MACHINE_ROOM.maxZ ||
        door.x === MACHINE_ROOM.minX ||
        door.x === MACHINE_ROOM.maxX;
      expect(onEdge, `${door.id} is not on any edge of the room`).toBe(true);
    }
  });
});

describe('the Trading Floor sits north of the Machine Room', () => {
  // Stated as a test because it is the geography the two door tables encode,
  // and it is the thing a reader needs in order to judge whether a third room's
  // doors are pointing the right way.
  it('leaves the Trading Floor heading south and enters the Machine Room heading south', () => {
    const out = TRADING_FLOOR_DOORS.find((d) => d.id === 'to-machine-room')!;
    const inbound = machineRoomDoors(MACHINE_ROOM).find((d) => d.id === 'to-trading-floor')!;
    expect(out.side).toBe('south');
    expect(inbound.side).toBe('north');
    // Facing 0 is +Z, which is south.
    expect(outwardFacing(out)).toBeCloseTo(0);
    expect(arrivalFacing(inbound)).toBeCloseTo(0);
    // And you land north of where you will be walking, at the top of the room.
    expect(arrivalCell(inbound).z).toBe(MACHINE_ROOM.minZ + 2);
  });

  it('makes the return trip head north', () => {
    const out = machineRoomDoors(MACHINE_ROOM).find((d) => d.id === 'to-trading-floor')!;
    const inbound = TRADING_FLOOR_DOORS.find((d) => d.id === 'to-machine-room')!;
    expect(sameAngle(outwardFacing(out), Math.PI)).toBe(true);
    expect(sameAngle(arrivalFacing(inbound), Math.PI)).toBe(true);
    expect(arrivalCell(inbound).z).toBe(inbound.z - 2);
  });
});
