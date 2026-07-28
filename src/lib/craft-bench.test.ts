import { describe, expect, it } from 'vitest';
import { BENCH_CELL, BENCH_REACH, atBench } from './craft-bench';
// FLOOR_BOUNDS rather than IsoBoard's BOARD_BOUNDS: they are the same numbers
// by design — the board's own comment says it mirrors this — and this is the
// SERVER's authority, which is the one worth asserting against. It is also the
// only one a node test can read, since IsoBoard is a .tsx with no JSX transform
// available here.
import { FLOOR_BOUNDS } from './floor';
import { machineRoomDoors, doorTileAt } from '../components/iso/portals';

describe('the craft bench', () => {
  /**
   * A bench outside the room would be invisible and unreachable, with nothing
   * to say so — the scene would draw it past the wall and the floor would never
   * report standing next to it. Exactly the failure the Deep Forest's ±220 vs
   * ±46 bounds mismatch produced.
   */
  it('stands inside the Machine Room', () => {
    expect(BENCH_CELL.x).toBeGreaterThan(FLOOR_BOUNDS.minX);
    expect(BENCH_CELL.x).toBeLessThan(FLOOR_BOUNDS.maxX);
    expect(BENCH_CELL.z).toBeGreaterThan(FLOOR_BOUNDS.minZ);
    expect(BENCH_CELL.z).toBeLessThan(FLOOR_BOUNDS.maxZ);
  });

  /**
   * Not in a doorway.
   *
   * Doors transition you the moment you stand in them, so a bench sharing a
   * door tile could never be used — you would be in the next room before the
   * panel opened. It is also just bad manners to put a workbench in a doorway.
   */
  it('does not stand in a doorway', () => {
    const doors = machineRoomDoors(FLOOR_BOUNDS);
    for (let dx = -BENCH_REACH; dx <= BENCH_REACH; dx += 1) {
      for (let dz = -BENCH_REACH; dz <= BENCH_REACH; dz += 1) {
        const x = BENCH_CELL.x + dx;
        const z = BENCH_CELL.z + dz;
        expect(doorTileAt(doors, x, z), `bench reach covers a door at ${x},${z}`).toBeFalsy();
      }
    }
  });

  it('is not on the central service lane', () => {
    // The lane is the walkway nobody builds over — a bench on it would be the
    // first thing every player collides with on the way in.
    expect(Math.abs(BENCH_CELL.x)).toBeGreaterThan(1);
  });

  /**
   * One tile, Chebyshev — the same reach felling, desks and doors all use.
   * There is exactly one idea of "next to" in this game and it is worth keeping
   * that way: a player who has learned it once should not have to learn it
   * again for a different object.
   */
  it('uses the same reach as everything else you walk up to', () => {
    expect(BENCH_REACH).toBe(1);
    expect(atBench(BENCH_CELL.x, BENCH_CELL.z)).toBe(true);
    expect(atBench(BENCH_CELL.x + 1, BENCH_CELL.z + 1)).toBe(true);
    expect(atBench(BENCH_CELL.x + 2, BENCH_CELL.z)).toBe(false);
    expect(atBench(BENCH_CELL.x, BENCH_CELL.z - 2)).toBe(false);
  });
});
