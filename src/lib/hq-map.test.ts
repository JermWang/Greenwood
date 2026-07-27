import { describe, expect, it } from 'vitest';
import {
  ARRIVAL,
  BOUNDS,
  DOORS,
  DOOR_HALF,
  FOUNTAIN,
  TOWER,
  allProps,
  doorAt,
  doorCells,
  inFountain,
  inTower,
  isWalkable,
  onPath,
  propAt,
} from './hq-map';
import { REGIONS, regionById } from './regions';
// Relative, not aliased: vitest here does not resolve '@/'.
import { findPathWhere } from '../components/iso/pathing';

describe('the HQ plaza', () => {
  /**
   * The bug this exists for: the Deep Forest shipped with REGIONS saying ±220
   * and its map generating at ±46. Two numbers in two files, neither wrong on
   * its own, and players spawned outside the world with no error anywhere.
   */
  it('agrees with the region table about how big it is', () => {
    expect(regionById('greenwood-hq')!.bounds).toEqual({ ...BOUNDS });
  });

  it('spawns the player somewhere they can stand', () => {
    expect(isWalkable(ARRIVAL.x, ARRIVAL.z)).toBe(true);
    expect(onPath(ARRIVAL.x, ARRIVAL.z)).toBe(true);
  });

  it('is deterministic — the same tile answers the same way every time', () => {
    for (const [x, z] of [[5, 10], [-11, 2], [0, -6], [14, 18]]) {
      expect(propAt(x, z)).toEqual(propAt(x, z));
    }
  });

  it('keeps the tower and the fountain solid', () => {
    expect(isWalkable(0, TOWER.maxZ - 1)).toBe(false);
    expect(inTower(0, TOWER.minZ + 1)).toBe(true);
    expect(isWalkable(FOUNTAIN.x, FOUNTAIN.z)).toBe(false);
    expect(inFountain(FOUNTAIN.x, FOUNTAIN.z)).toBe(true);
  });

  it('never buries a prop in the tower, the fountain or a doorway', () => {
    for (const prop of allProps()) {
      expect(inTower(prop.x, prop.z), `${prop.x},${prop.z}`).toBe(false);
      expect(inFountain(prop.x, prop.z), `${prop.x},${prop.z}`).toBe(false);
      expect(doorAt(prop.x, prop.z), `${prop.x},${prop.z}`).toBeNull();
    }
  });
});

describe('the doors', () => {
  it('every door leads to a region that exists, at the href it publishes', () => {
    for (const door of DOORS) {
      const region = regionById(door.region);
      expect(region, `${door.id} -> ${door.region}`).not.toBeNull();
      expect(door.href).toBe(region!.href);
    }
  });

  /**
   * A threshold is three tiles wide and all of it walkable — the same shape as
   * every other door in the game. A one-tile door is something you have to hit
   * rather than something you walk into, and walking into one IS the whole
   * interaction: there is no confirm step behind it to catch a near miss.
   */
  it('makes every threshold three tiles wide and all of it walkable', () => {
    for (const door of DOORS) {
      const cells = doorCells(door);
      expect(cells.length, door.id).toBe(DOOR_HALF * 2 + 1);
      for (const cell of cells) {
        const at = `${door.id} at ${cell.x},${cell.z}`;
        expect(isWalkable(cell.x, cell.z), at).toBe(true);
        expect(doorAt(cell.x, cell.z)?.id, at).toBe(door.id);
      }
    }
  });

  it('never lets two doorways share a tile', () => {
    // doorAt returns the FIRST match, so an overlap would make one of them
    // unreachable — and which one would depend on array order.
    const seen = new Set<string>();
    for (const door of DOORS) {
      for (const cell of doorCells(door)) {
        const key = `${cell.x}:${cell.z}`;
        expect(seen.has(key), `${door.id} overlaps another door at ${key}`).toBe(false);
        seen.add(key);
      }
    }
  });

  it('puts the tower door flush against the tower', () => {
    // A footprint ending at maxZ has its face at maxZ + 0.5, so the tile at
    // maxZ + 1 begins exactly there. Any further and there is a strip of paving
    // between the lit doorway on the wall and the lit tile on the ground.
    const lobby = DOORS.find((d) => d.id === 'lobby')!;
    expect(lobby.z).toBe(TOWER.maxZ + 1);
    expect(lobby.x).toBeGreaterThanOrEqual(TOWER.minX);
    expect(lobby.x).toBeLessThanOrEqual(TOWER.maxX);
  });

  /**
   * The one test that decides whether this region works at all.
   *
   * HQ is a junction: back to the Grounds, into the tower, on to the Treeline. A
   * door that cannot be walked to is a destination that does not exist, and the
   * furniture is generated rather than placed — a lattice change could wall one
   * off without anybody touching the door.
   */
  it('every door can be walked to from the arrival point', () => {
    for (const door of DOORS) {
      const route = findPathWhere({ ...ARRIVAL }, { x: door.x, z: door.z }, BOUNDS, isWalkable);
      expect(route.length, `no route to ${door.id}`).toBeGreaterThan(0);
      const last = route[route.length - 1];
      expect({ x: last.x, z: last.z }).toEqual({ x: door.x, z: door.z });
    }
  });
});

describe('where HQ sits in the world', () => {
  /**
   * The route used to be Grounds -> Treeline -> Deep Forest, so the step after
   * "a pleasant park" was "something moves out here" with nothing in between
   * worth losing. HQ has to sit strictly between them or it is not doing its job.
   */
  it('gates below the Treeline and above the Grounds', () => {
    const hq = regionById('greenwood-hq')!;
    expect(hq.minTotalLevel).toBeGreaterThan(regionById('grounds')!.minTotalLevel);
    expect(hq.minTotalLevel).toBeLessThan(regionById('treeline')!.minTotalLevel);
  });

  it('is safe — it is the last civilised place before the fence means anything', () => {
    const hq = regionById('greenwood-hq')!;
    expect(hq.pvp).toBe(false);
    expect(hq.hostiles).toBe(false);
    expect(hq.requiresPack).toBe(false);
  });

  it('declares the lobby even though it has no scene yet', () => {
    // The tower door points at it, so the gate refuses with a sentence rather
    // than the door simply not being drawn. "Not yet" belongs in the region
    // table, where a player can see the building they are working toward.
    expect(REGIONS.some((r) => r.id === 'hq-lobby')).toBe(true);
    expect(DOORS.some((d) => d.region === 'hq-lobby')).toBe(true);
  });
});
