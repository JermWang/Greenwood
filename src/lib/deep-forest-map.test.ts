// The map is the same for everyone, everywhere, forever.
//
// These assertions are cheap and the property they protect is not: if the client
// and the server ever disagree about where a tree is, cover becomes a lie and a
// PvP fight is decided by whose machine drew what. The module has no imports and
// no state precisely so this can be true; the tests are here to keep it true.

import { describe, it, expect } from 'vitest';
import {
  EXTENT,
  CLEARING,
  GATES,
  GATE_RADIUS,
  GENERATORS,
  propAt,
  propsIn,
  allProps,
  isWalkable,
  salvageNodes,
  gateAt,
} from './deep-forest-map';
import { regionById, arrivalCellFor } from './regions';

describe('the map is deterministic', () => {
  it('returns the same prop for the same tile, every time', () => {
    for (const [x, z] of [[12, -30], [-40, 7], [33, 33], [0, 20]]) {
      const first = propAt(x, z);
      for (let i = 0; i < 20; i += 1) {
        expect(propAt(x, z)).toEqual(first);
      }
    }
  });

  it('is a pure function of the coordinate, with no ordering effects', () => {
    // Reading a neighbour first must not change the answer. If it did, a client
    // that rendered in a different order from the server would see a different
    // forest — which is the whole failure this module exists to prevent.
    const direct = propAt(9, -14);
    propAt(0, 0);
    propAt(-40, 40);
    propsIn(-5, 5, -5, 5);
    expect(propAt(9, -14)).toEqual(direct);
  });

  it('gives the same answer through every entry point', () => {
    // propsIn and allProps must agree with propAt, or the renderer and the
    // collision check would be reading two different maps.
    const window = propsIn(10, 20, 10, 20);
    for (const prop of window) {
      expect(propAt(prop.x, prop.z)).toEqual(prop);
    }
    for (let x = 10; x <= 20; x += 1) {
      for (let z = 10; z <= 20; z += 1) {
        const here = propAt(x, z);
        const inWindow = window.find((p) => p.x === x && p.z === z) ?? null;
        expect(inWindow).toEqual(here);
      }
    }
  });

  it('rounds fractional positions to one tile, so a step cannot land between props', () => {
    expect(propAt(12.4, -29.6)).toEqual(propAt(12, -30));
    expect(isWalkable(12.4, -29.6)).toBe(isWalkable(12, -30));
  });
});

describe('everything sits on the grid', () => {
  it('places every prop on an integer tile', () => {
    for (const prop of allProps()) {
      expect(Number.isInteger(prop.x), `${prop.x}`).toBe(true);
      expect(Number.isInteger(prop.z), `${prop.z}`).toBe(true);
    }
  });

  it('never puts two props on one tile', () => {
    const seen = new Set<string>();
    for (const prop of allProps()) {
      const key = `${prop.x}:${prop.z}`;
      expect(seen.has(key), `two props at ${key}`).toBe(false);
      seen.add(key);
    }
  });

  it('places every salvage node on an integer tile, and never inside a prop', () => {
    for (const node of salvageNodes()) {
      expect(Number.isInteger(node.x)).toBe(true);
      expect(Number.isInteger(node.z)).toBe(true);
      // A node inside a tree is a node nobody can reach.
      expect(propAt(node.x, node.z), `node ${node.id} is inside a prop`).toBeNull();
    }
  });

  it('gives every salvage node a stable id derived from its tile', () => {
    // The id is what a cooldown is recorded against. If it were an index, adding
    // a node would silently re-key every node after it.
    for (const node of salvageNodes()) {
      expect(node.id).toBe(`${node.x}:${node.z}`);
    }
    const ids = salvageNodes().map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('the map is navigable', () => {
  it('keeps the central clearing empty', () => {
    for (let x = -CLEARING + 1; x < CLEARING; x += 1) {
      for (let z = -CLEARING + 1; z < CLEARING; z += 1) {
        if (Math.hypot(x, z) >= CLEARING) continue;
        expect(propAt(x, z), `prop at ${x},${z} inside the clearing`).toBeNull();
      }
    }
  });

  it('keeps every gate apron clear, so no exit can be walled in', () => {
    for (const gate of GATES) {
      for (let dx = -GATE_RADIUS; dx <= GATE_RADIUS; dx += 1) {
        for (let dz = -GATE_RADIUS; dz <= GATE_RADIUS; dz += 1) {
          expect(propAt(gate.x + dx, gate.z + dz), `${gate.name} blocked`).toBeNull();
        }
      }
    }
  });

  it('puts every generator in the clearing, reachable', () => {
    for (const gen of GENERATORS) {
      expect(Math.hypot(gen.x, gen.z)).toBeLessThan(CLEARING);
      expect(isWalkable(gen.x, gen.z)).toBe(true);
    }
  });

  it('has exactly one live generator — the only neon in the world', () => {
    expect(GENERATORS.filter((g) => g.live)).toHaveLength(1);
  });

  it('treats everything outside the bounds as unwalkable', () => {
    expect(isWalkable(EXTENT + 1, 0)).toBe(false);
    expect(isWalkable(0, -(EXTENT + 1))).toBe(false);
    expect(isWalkable(0, 0)).toBe(true);
  });

  it('leaves most of the map walkable', () => {
    // A forest dense enough to be impassable is a wall with trees drawn on it.
    let walkable = 0;
    let total = 0;
    for (let x = -EXTENT; x <= EXTENT; x += 1) {
      for (let z = -EXTENT; z <= EXTENT; z += 1) {
        total += 1;
        if (isWalkable(x, z)) walkable += 1;
      }
    }
    expect(walkable / total).toBeGreaterThan(0.6);
  });
});

describe('the map and the region agree about how big the world is', () => {
  /**
   * The bug this exists for: REGIONS said the Deep Forest was ±220 (the design
   * target) while the map generated at ±46. Spawning uses the region's maxZ, so
   * players were placed at z = 218 — a hundred and seventy tiles past the edge
   * of the world, standing on ground that does not exist, with no character
   * visible anywhere and nothing in any log to say why.
   *
   * Two numbers in two files, each defensible alone. Only a test that reads both
   * can catch it.
   */
  it('gives the region the same extent the map generates at', () => {
    const region = regionById('deep-forest')!;
    expect(region.bounds.maxX).toBe(EXTENT);
    expect(region.bounds.maxZ).toBe(EXTENT);
    expect(region.bounds.minX).toBe(-EXTENT);
    expect(region.bounds.minZ).toBe(-EXTENT);
  });

  it('spawns players on ground that exists, and on a walkable tile', () => {
    const spawn = arrivalCellFor(regionById('deep-forest')!);
    expect(Math.abs(spawn.x)).toBeLessThanOrEqual(EXTENT);
    expect(Math.abs(spawn.z)).toBeLessThanOrEqual(EXTENT);
    expect(isWalkable(spawn.x, spawn.z)).toBe(true);
  });

  it('spawns players at a gate, so the way out is the way in', () => {
    const spawn = arrivalCellFor(regionById('deep-forest')!);
    const nearest = Math.min(...GATES.map((g) => Math.hypot(spawn.x - g.x, spawn.z - g.z)));
    expect(nearest).toBeLessThanOrEqual(GATE_RADIUS);
  });
});

describe('extraction', () => {
  it('recognises standing at a gate', () => {
    for (const gate of GATES) {
      expect(gateAt(gate.x, gate.z)?.name).toBe(gate.name);
      expect(gateAt(gate.x, gate.z + GATE_RADIUS)?.name).toBe(gate.name);
    }
  });

  it('does not recognise a gate from across the map', () => {
    expect(gateAt(0, 0)).toBeNull();
    expect(gateAt(GATES[0].x, GATES[0].z - GATE_RADIUS - 2)).toBeNull();
  });

  it('puts a gate on all four sides, so no run is cornered', () => {
    expect(GATES).toHaveLength(4);
    expect(GATES.some((g) => g.z > 0 && g.x === 0)).toBe(true);
    expect(GATES.some((g) => g.z < 0 && g.x === 0)).toBe(true);
    expect(GATES.some((g) => g.x > 0 && g.z === 0)).toBe(true);
    expect(GATES.some((g) => g.x < 0 && g.z === 0)).toBe(true);
  });
});
