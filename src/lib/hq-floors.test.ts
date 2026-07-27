// The lift, and the one thing that makes it different from a door.
//
// Every other connection in this game is a fixed pair: leave by this door,
// arrive at that one. A lift has one entrance and many destinations, so its
// destination is a CHOICE rather than a property — and these assertions are
// mostly about that choice staying honest.
import { describe, expect, it } from 'vitest';
import { FLOORS, LIFT_CELL, canRide, directory, floorAt, floorOf } from './hq-floors';
import { REGIONS, regionById } from './regions';
import { MAP_LINKS } from './world-map';

describe('the directory', () => {
  it('names a region that exists for every floor', () => {
    for (const floor of FLOORS) {
      expect(regionById(floor.region), `floor ${floor.level} -> ${floor.region}`).not.toBeNull();
    }
  });

  it('gives each floor its own storey number and its own region', () => {
    expect(new Set(FLOORS.map((f) => f.level)).size).toBe(FLOORS.length);
    expect(new Set(FLOORS.map((f) => f.region)).size).toBe(FLOORS.length);
  });

  it('puts the lobby on the ground', () => {
    // 0 is the ground floor everywhere a lift has ever been built. Getting this
    // backwards would make every other number on the panel wrong.
    expect(floorAt(0)?.region).toBe('hq-lobby');
  });

  it('returns floors climbing, so the panel can reverse them itself', () => {
    const levels = directory().map((f) => f.level);
    expect(levels).toEqual([...levels].sort((a, b) => a - b));
  });

  it('resolves a region to its floor, and anything else to null', () => {
    expect(floorOf('trading-floor')?.level).toBe(1);
    expect(floorOf('grounds')).toBeNull();
    expect(floorOf(null)).toBeNull();
    expect(floorOf(undefined)).toBeNull();
  });
});

describe('riding', () => {
  it('refuses the no-op', () => {
    expect(canRide('trading-floor', 'trading-floor')).toBe(false);
  });

  it('refuses a floor that is not in the building', () => {
    expect(canRide('hq-lobby', 'deep-forest')).toBe(false);
    expect(canRide('hq-lobby', 'nowhere')).toBe(false);
  });

  it('allows any floor to any other, without passing through the ones between', () => {
    // That is what a lift IS. Modelling it as a chain of doors would make the
    // third floor three gate checks away from the ground.
    expect(canRide('hq-lobby', 'hq-lounge')).toBe(true);
    expect(canRide('hq-lounge', 'hq-lobby')).toBe(true);
    expect(canRide(null, 'machine-room')).toBe(true);
  });

  /**
   * The lift deliberately does NOT decide whether the player may enter.
   *
   * That is canEnter's job, checked server-side at /api/regions/enter like every
   * other arrival. A second opinion here would be a second answer to the one
   * question the region table exists to own, and the two would eventually
   * disagree — with the client's copy being the one that is wrong.
   */
  it('does not answer the gate question', () => {
    const gated = FLOORS.find((f) => regionById(f.region)!.minTotalLevel > 0);
    expect(gated, 'expected at least one gated floor to make this meaningful').toBeDefined();
    // Rideable regardless of level, because riding is not entering.
    expect(canRide('greenwood-hq', gated!.region)).toBe(true);
  });
});

describe('the shaft', () => {
  /**
   * A lift shaft is vertical, so the car has to be in the same place on every
   * floor. A floor that moved its lift would read as a different building.
   */
  it('puts the car on one cell for the whole tower', () => {
    for (const floor of FLOORS) {
      const bounds = regionById(floor.region)!.bounds;
      expect(LIFT_CELL.x, `${floor.region} cannot hold the shaft`).toBeGreaterThanOrEqual(bounds.minX);
      expect(LIFT_CELL.x, floor.region).toBeLessThanOrEqual(bounds.maxX);
      expect(LIFT_CELL.z, floor.region).toBeGreaterThanOrEqual(bounds.minZ);
      expect(LIFT_CELL.z, floor.region).toBeLessThanOrEqual(bounds.maxZ);
    }
  });
});

describe('the map agrees the lift exists', () => {
  /**
   * Every floor is ONE hop from the tower on the diagram, not a chain through
   * the floors below it — otherwise the map would tell a player on floor three
   * to walk down through two rooms to reach the ground, which is not how they
   * got there and not how they will leave.
   */
  it('links every floor straight to the plaza', () => {
    const linked = (a: string, b: string) =>
      MAP_LINKS.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
    for (const floor of FLOORS) {
      // The two floors that are also reachable on foot from the Grounds are
      // linked there instead; what matters is that no floor is unreachable.
      const viaTower = linked('greenwood-hq', floor.region);
      const viaGrounds = linked('grounds', floor.region);
      expect(viaTower || viaGrounds, `${floor.region} is cut off`).toBe(true);
    }
  });

  it('keeps every floor on the region table', () => {
    const ids = new Set(REGIONS.map((r) => r.id));
    for (const floor of FLOORS) expect(ids.has(floor.region as never), floor.region).toBe(true);
  });
});
