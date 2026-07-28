import { describe, expect, it } from 'vitest';
import {
  ARRIVAL,
  BOUNDS,
  BUILDINGS,
  DOORS,
  ENTRANCE,
  FENCE_GAP,
  FENCE_Z,
  FORECOURT_HALF,
  FORECOURT_Z,
  DOOR_HALF,
  allProps,
  doorCells,
  buildingAt,
  doorAt,
  isWalkable,
  onPath,
  propAt,
} from './grounds-map';
import { REGIONS, regionById } from './regions';
// Relative, not aliased: vitest here does not resolve '@/'.
import { findPathWhere, smoothPath } from '../components/iso/pathing';

describe('grounds map', () => {
  /**
   * The bug this exists for: the Deep Forest shipped with REGIONS saying ±220
   * and its map generating at ±46. Nothing warned, because the two numbers lived
   * in different files and neither was wrong on its own. The symptom was players
   * spawning a hundred and seventy tiles outside the world, invisible, with no
   * error anywhere.
   */
  it('agrees with the region table about how big it is', () => {
    const region = regionById('grounds')!;
    expect(region.bounds).toEqual({ ...BOUNDS });
  });

  it('spawns the player somewhere they can stand', () => {
    expect(isWalkable(ARRIVAL.x, ARRIVAL.z)).toBe(true);
    expect(ARRIVAL.z).toBeLessThanOrEqual(BOUNDS.maxZ);
    expect(ARRIVAL.z).toBeGreaterThanOrEqual(BOUNDS.minZ);
  });

  /**
   * The bounds have to be drawn round the content, not round an ambition.
   *
   * This region was 81x81 with everything in a strip down the middle, so most of
   * it was grass a player could walk across for twenty seconds and find nothing.
   * Empty margin is worse than a small map — it teaches people the world is
   * empty. More world is a NEW REGION through a gate, not a bigger rectangle.
   */
  it('keeps no more than a screen of margin around the content', () => {
    const xs = [
      ...BUILDINGS.flatMap((b) => [b.minX, b.maxX]),
      ...DOORS.map((d) => d.x),
      ENTRANCE.x,
      -FORECOURT_HALF,
      FORECOURT_HALF,
    ];
    const zs = [
      ...BUILDINGS.flatMap((b) => [b.minZ, b.maxZ]),
      ...DOORS.map((d) => d.z),
      ENTRANCE.z,
      FENCE_Z,
      FORECOURT_Z.min,
      FORECOURT_Z.max,
    ];
    const MARGIN = 6;
    expect(BOUNDS.minX).toBeGreaterThanOrEqual(Math.min(...xs) - MARGIN);
    expect(BOUNDS.maxX).toBeLessThanOrEqual(Math.max(...xs) + MARGIN);
    expect(BOUNDS.minZ).toBeGreaterThanOrEqual(Math.min(...zs) - MARGIN);
    expect(BOUNDS.maxZ).toBeLessThanOrEqual(Math.max(...zs) + MARGIN);
  });

  it('has an entrance you can stand in at the south end', () => {
    // Players used to materialise on open grass, which made the Grounds read as
    // a screen rather than as somewhere you had walked into.
    expect(isWalkable(ENTRANCE.x, ENTRANCE.z)).toBe(true);
    expect(onPath(ENTRANCE.x, ENTRANCE.z)).toBe(true);
    expect(ENTRANCE.z).toBeGreaterThan(ARRIVAL.z);
  });

  it('is deterministic — the same tile answers the same way every time', () => {
    for (const [x, z] of [[3, 12], [-20, -8], [17, 30], [0, 0]]) {
      expect(propAt(x, z)).toEqual(propAt(x, z));
    }
  });
});

describe('doors', () => {
  it('every door leads to a region that exists', () => {
    for (const door of DOORS) {
      expect(regionById(door.region), `${door.id} -> ${door.region}`).not.toBeNull();
    }
  });

  /**
   * A sign must name the place behind it.
   *
   * The fence gate read "The Treeline" long after it had been repointed at
   * Greenwood HQ, because the label existed twice — once as data and once
   * hardcoded in the scene — and only one was updated. A sign naming a
   * different place is worse than no sign: it is the map lying, and a player who
   * walks through expecting a forest and arrives at a plaza stops trusting every
   * other label in the game.
   */
  it('labels every door with the name of the region it opens onto', () => {
    for (const door of DOORS) {
      expect(door.label, `${door.id} is mislabelled`).toBe(regionById(door.region)!.name);
    }
  });

  it('every door points at the href its region publishes', () => {
    // Two sources for one route is two routes eventually. The region table owns
    // where a place lives; a door only says which place.
    for (const door of DOORS) {
      expect(door.href).toBe(regionById(door.region)!.href);
    }
  });

  /**
   * A door tile has to touch the wall it belongs to.
   *
   * A building whose footprint ends at maxZ has its front face at maxZ + 0.5, so
   * the tile at maxZ + 1 begins exactly there. One tile further out and there is
   * a strip of grass between the lit doorway on the wall and the lit tile on the
   * ground, and the two stop reading as the same thing.
   */
  it('puts every building door flush against its building', () => {
    for (const b of BUILDINGS) {
      const door = DOORS.find((d) => d.id === b.id);
      expect(door, `${b.id} has no door`).toBeDefined();
      expect(door!.z, `${b.id} door is not against the wall`).toBe(b.maxZ + 1);
      expect(door!.x).toBeGreaterThanOrEqual(b.minX);
      expect(door!.x).toBeLessThanOrEqual(b.maxX);
    }
  });

  it('every door is stood on a walkable tile', () => {
    for (const door of DOORS) {
      expect(isWalkable(door.x, door.z), door.id).toBe(true);
      expect(doorAt(door.x, door.z)?.id).toBe(door.id);
    }
  });

  /**
   * Where you land when you come back OUT of a door.
   *
   * The Grounds page spawns two tiles outward, clear of the threshold — which
   * matters far more now that standing in a doorway transitions you. Land on one
   * and you would be sent straight back where you came from, in a loop, with no
   * way to break it. The walkability half is one prop roll away from breaking
   * with no error if it does: you would simply arrive standing in a tree.
   */
  it('leaves somewhere to stand two tiles out of every doorway', () => {
    for (const door of DOORS) {
      const cell = { x: door.x, z: door.z + 2 };
      expect(isWalkable(cell.x, cell.z), `outside ${door.id}`).toBe(true);
      expect(doorAt(cell.x, cell.z), `${door.id} re-triggers on arrival`).toBeNull();
    }
  });

  it('never lets two doorways share a tile', () => {
    // doorAt returns the FIRST match, so overlapping thresholds would make one
    // of them unreachable — and which one would depend on array order.
    const seen = new Set<string>();
    for (const door of DOORS) {
      for (const cell of doorCells(door)) {
        const key = `${cell.x}:${cell.z}`;
        expect(seen.has(key), `${door.id} overlaps another door at ${key}`).toBe(false);
        seen.add(key);
      }
    }
  });

  /**
   * A threshold is three tiles wide, matching the room doors in
   * components/iso/portals. A one-tile door is something you have to hit rather
   * than something you walk into, and walking into one is now the entire
   * interaction — there is no confirm step behind it to catch a near miss.
   */
  it('makes every threshold three tiles wide and all of it walkable', () => {
    for (const door of DOORS) {
      const cells = doorCells(door);
      expect(cells.length, door.id).toBe(DOOR_HALF * 2 + 1);
      for (const cell of cells) {
        const at = `${door.id} at ${cell.x},${cell.z}`;
        expect(isWalkable(cell.x, cell.z), at).toBe(true);
        expect(doorAt(cell.x, cell.z)?.id, at).toBe(door.id);
        expect(onPath(cell.x, cell.z), at).toBe(true);
      }
    }
  });

  /**
   * A threshold has width but no DEPTH.
   *
   * The old test was a radius, which made the tile in front of a door count as
   * being in it. Harmless while a door needed a button press; not now that
   * walking onto one transitions you, because a player crossing the forecourt
   * would be taken somewhere they were only walking past.
   */
  it('does not trigger from the tile in front of a door', () => {
    for (const door of DOORS) {
      for (const dz of [-1, 1]) {
        const at = doorAt(door.x, door.z + dz);
        expect(at?.id, `${door.id} fires from z=${door.z + dz}`).not.toBe(door.id);
      }
    }
  });

  /**
   * The one test that decides whether this region does its job.
   *
   * The Grounds exist to be the game's navigation. A door that cannot be walked
   * to is a destination that does not exist, and because the scatter is
   * generated rather than placed, a density change could wall one off without
   * anybody touching the door itself.
   */
  it('every door can actually be walked to from the arrival point', () => {
    for (const door of DOORS) {
      const route = findPathWhere({ ...ARRIVAL }, { x: door.x, z: door.z }, BOUNDS, isWalkable);
      expect(route.length, `no route to ${door.id}`).toBeGreaterThan(0);
      const last = route[route.length - 1];
      expect({ x: last.x, z: last.z }).toEqual({ x: door.x, z: door.z });
    }
  });
});

describe('the fence', () => {
  /**
   * Solid along its whole length INCLUDING the gap, which is drawn open because
   * it is a gate — a gate you cannot see is a gate you cannot plan a route to —
   * but is not walked through. The Treeline is a separate region entered at the
   * arch on this side.
   *
   * This started out permitting the gap, and the reachability test below caught
   * it: a player could walk into the strip past the fence, which has no content,
   * no way on, and no way back except retracing.
   */
  it('is solid along its whole length, gap included', () => {
    for (let x = BOUNDS.minX; x <= BOUNDS.maxX; x += 1) {
      expect(isWalkable(x, FENCE_Z), `x=${x}`).toBe(false);
    }
    // The gap is still a gap to look at, which is what the scene draws.
    expect(FENCE_GAP).toBeGreaterThan(0);
  });

  it('leaves the far side unreachable on foot', () => {
    const beyond = { x: 0, z: FENCE_Z - 4 };
    const route = findPathWhere({ ...ARRIVAL }, beyond, BOUNDS, isWalkable);
    // findPathWhere falls back to the nearest open cell, so a route may exist —
    // it must simply never END past the fence.
    if (route.length) {
      const last = route[route.length - 1];
      expect(last.z).toBeGreaterThan(FENCE_Z);
    }
  });
});

describe('buildings', () => {
  it('are solid, except where their doorway is', () => {
    for (const b of BUILDINGS) {
      for (let x = b.minX; x <= b.maxX; x += 1) {
        for (let z = b.minZ; z <= b.maxZ; z += 1) {
          expect(isWalkable(x, z), `${b.id} at ${x},${z}`).toBe(false);
        }
      }
    }
  });

  it('never overlap each other', () => {
    for (const a of BUILDINGS) {
      for (const b of BUILDINGS) {
        if (a === b) continue;
        const overlaps =
          a.minX <= b.maxX && a.maxX >= b.minX && a.minZ <= b.maxZ && a.maxZ >= b.minZ;
        expect(overlaps, `${a.id} / ${b.id}`).toBe(false);
      }
    }
  });

  it('never swallow a doorway tile', () => {
    for (const door of DOORS) {
      expect(buildingAt(door.x, door.z), door.id).toBeNull();
    }
  });
});

describe('paths', () => {
  it('are never blocked by scenery', () => {
    for (const prop of allProps()) {
      expect(onPath(prop.x, prop.z), `prop at ${prop.x},${prop.z}`).toBe(false);
    }
  });

  /**
   * GroundsScene draws the paving as a handful of quads rather than per-tile
   * geometry, so the rectangles it draws and the tiles `onPath` reports are two
   * statements of one fact. These assertions pin the rectangles; if `onPath`
   * changes shape, this fails and points at the scene that has to change with it.
   */
  it('cover the rectangles the scene paves', () => {
    for (let z = FENCE_Z + 1; z <= BOUNDS.maxZ; z += 1) {
      for (let x = -2; x <= 2; x += 1) {
        expect(onPath(x, z), `avenue ${x},${z}`).toBe(true);
      }
    }
    for (let z = FORECOURT_Z.min; z <= FORECOURT_Z.max; z += 1) {
      for (let x = -FORECOURT_HALF; x <= FORECOURT_HALF; x += 1) {
        expect(onPath(x, z), `forecourt ${x},${z}`).toBe(true);
      }
    }
  });

  it('run all the way from the arrival point to the fence gate', () => {
    const route = findPathWhere({ ...ARRIVAL }, { x: 0, z: FENCE_Z + 1 }, BOUNDS, isWalkable);
    expect(route.length).toBeGreaterThan(0);
    // Straight up the avenue, so the walk is the tutorial: a player who has been
    // told nothing still follows a path, and this one leads somewhere.
    for (const cell of route) expect(Math.abs(cell.x)).toBeLessThanOrEqual(2);
  });
});

describe('walking', () => {
  const route = (from: { x: number; z: number }, to: { x: number; z: number }) => {
    const raw = findPathWhere(from, to, BOUNDS, isWalkable);
    return { raw, smooth: smoothPath(raw, from, isWalkable) };
  };

  /**
   * BFS returns the SHORTEST route, which is not the route a person would walk.
   *
   * On an eight-way grid many routes tie for shortest, and the one the queue
   * reaches first is a staircase — across, down, across, down — because the
   * search expands orthogonals before diagonals. The character walked it
   * literally, turning at every tile, and it read as drunk.
   */
  it('straightens a route instead of walking a staircase', () => {
    const { raw, smooth } = route({ x: 0, z: 22 }, { x: 0, z: 17 });
    expect(raw.length).toBeGreaterThan(0);
    expect(smooth.length).toBeLessThanOrEqual(raw.length);
    // Open ground down the avenue should collapse to a single leg.
    expect(smooth.length).toBeLessThanOrEqual(2);
  });

  it('still ends exactly where the route ended', () => {
    for (const door of DOORS) {
      const { raw, smooth } = route({ ...ARRIVAL }, { x: door.x, z: door.z });
      if (!raw.length) continue;
      expect(smooth[smooth.length - 1]).toEqual(raw[raw.length - 1]);
    }
  });

  /**
   * The safety property. Smoothing removes waypoints, so every leg it creates
   * has to be one the character can actually walk — otherwise it cuts a corner
   * through a building and the walk that looked nicer is the walk that clips.
   */
  it('never creates a leg that passes through something solid', () => {
    for (const door of DOORS) {
      const { smooth } = route({ ...ARRIVAL }, { x: door.x, z: door.z });
      let at: { x: number; z: number } = { ...ARRIVAL };
      for (const leg of smooth) {
        const steps = Math.max(Math.abs(leg.x - at.x), Math.abs(leg.z - at.z)) * 4;
        for (let i = 1; i <= steps; i += 1) {
          const x = Math.round(at.x + ((leg.x - at.x) * i) / steps);
          const z = Math.round(at.z + ((leg.z - at.z) * i) / steps);
          expect(isWalkable(x, z), `leg ${at.x},${at.z} -> ${leg.x},${leg.z} at ${x},${z}`).toBe(true);
        }
        at = leg;
      }
    }
  });
});

describe('the region table', () => {
  it('opens the Grounds to a brand-new fund', () => {
    // The first step outside is the reveal, and you do not put a toll on it.
    const grounds = REGIONS.find((r) => r.id === 'grounds')!;
    expect(grounds.minTotalLevel).toBe(0);
    expect(grounds.requiresPack).toBe(false);
    expect(grounds.pvp).toBe(false);
    expect(grounds.hostiles).toBe(false);
  });
});
