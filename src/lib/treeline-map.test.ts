import { describe, expect, it } from 'vitest';
import {
  ARRIVAL,
  BOUNDS,
  DOORS,
  DOOR_HALF,
  TRACK_HALF,
  TRACK_Z,
  allProps,
  doorAt,
  doorCells,
  isWalkable,
  onPath,
  propAt,
} from './treeline-map';
import { regionById } from './regions';
import { SPECIES, speciesAt, type SpeciesId } from './woodcutting';
// Relative, not aliased: vitest here does not resolve '@/'.
import { findPathWhere } from '../components/iso/pathing';

describe('the Treeline', () => {
  it('agrees with the region table about how big it is', () => {
    expect(regionById('treeline')!.bounds).toEqual({ ...BOUNDS });
  });

  it('spawns the player on the track', () => {
    expect(isWalkable(ARRIVAL.x, ARRIVAL.z)).toBe(true);
    expect(onPath(ARRIVAL.x, ARRIVAL.z)).toBe(true);
  });

  it('is deterministic — the same tile answers the same way every time', () => {
    for (const [x, z] of [[5, 9], [-14, -6], [22, 15]]) {
      expect(propAt(x, z)).toEqual(propAt(x, z));
    }
  });

  /**
   * The track is the safe line, and nothing grows on it.
   *
   * Everything worth cutting is off it, which is the shape the region wants:
   * walking the track is easy and gets you nothing, so stepping into the wood is
   * a decision rather than something that happens to you.
   */
  it('keeps the service track clear from end to end', () => {
    for (let x = BOUNDS.minX; x <= BOUNDS.maxX; x += 1) {
      for (let dz = -TRACK_HALF; dz <= TRACK_HALF; dz += 1) {
        expect(propAt(x, TRACK_Z + dz), `${x},${TRACK_Z + dz}`).toBeNull();
        expect(isWalkable(x, TRACK_Z + dz), `${x},${TRACK_Z + dz}`).toBe(true);
      }
    }
  });

  it('thickens away from the track rather than toward a centre', () => {
    const near = allProps().filter((p) => Math.abs(p.z - TRACK_Z) < 8).length;
    const far = allProps().filter((p) => Math.abs(p.z - TRACK_Z) >= 8).length;
    expect(far).toBeGreaterThan(near);
  });
});

describe('its gates', () => {
  it('leads to regions that exist, at the hrefs they publish', () => {
    for (const door of DOORS) {
      const region = regionById(door.region);
      expect(region, `${door.id} -> ${door.region}`).not.toBeNull();
      expect(door.href).toBe(region!.href);
      // A sign that names a different place than the one behind it is the map
      // lying. This is the general form of the fence-gate bug.
      expect(door.label).toBe(region!.name);
    }
  });

  it('connects HQ to the Deep Forest and nothing else', () => {
    // A region whose job is to be a RUNG should not also be a junction, or the
    // ladder stops reading as a ladder.
    expect(DOORS.map((d) => d.region).sort()).toEqual(['deep-forest', 'greenwood-hq']);
  });

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

  it('can be walked to from the arrival point', () => {
    for (const door of DOORS) {
      const route = findPathWhere({ ...ARRIVAL }, { x: door.x, z: door.z }, BOUNDS, isWalkable);
      const reached =
        (ARRIVAL.x === door.x && ARRIVAL.z === door.z) ||
        (route.length > 0 &&
          route[route.length - 1].x === door.x &&
          route[route.length - 1].z === door.z);
      expect(reached, `no route to ${door.id}`).toBe(true);
    }
  });
});

describe('the wood ladder opens here', () => {
  const census = () => {
    const count: Partial<Record<SpeciesId, number>> = {};
    for (const p of allProps().filter((q) => q.kind === 'tree')) {
      const s = speciesAt('treeline', p.x, p.z);
      count[s] = (count[s] ?? 0) + 1;
    }
    return count;
  };

  /**
   * THE REASON THIS REGION WAS BUILT.
   *
   * Black pine was 7% here and everything worth having grew only in the Deep
   * Forest, which wants total level 10, a desk at 8, a pack and consent to PvP.
   * That put the crafting ladder behind the hardest gate in the game — a player
   * finishing the introduction around level 11 with a level-2 desk could reach
   * exactly one tier of wood.
   *
   * A gathering skill is early-game content. Its payoff belongs where somebody
   * an hour in can get at it.
   */
  it('carries black pine in quantity, not as a rarity', () => {
    const count = census();
    const trees = Object.values(count).reduce((a, b) => a + b, 0);
    const share = (count.blackpine ?? 0) / trees;
    expect(share, `black pine is only ${(share * 100).toFixed(1)}% of the wood`).toBeGreaterThan(0.12);
  });

  it('is the best place in the game for oak', () => {
    const count = census();
    const trees = Object.values(count).reduce((a, b) => a + b, 0);
    expect((count.oak ?? 0) / trees).toBeGreaterThan(0.25);
  });

  it('leaves ironbark to the Deep Forest', () => {
    // The top of the ladder stays somewhere frightening. If ironbark ever grows
    // here, the Deep Forest loses its only gathering reason to exist.
    expect(census().ironbark ?? 0).toBe(0);
  });

  it('sits below the Deep Forest on every gate it shares with it', () => {
    const treeline = regionById('treeline')!;
    const deep = regionById('deep-forest')!;
    expect(treeline.minTotalLevel).toBeLessThan(deep.minTotalLevel);
    expect(treeline.minDeskLevel).toBeLessThan(deep.minDeskLevel);
    // Hostiles but no PvP: the first place that can hurt you, without the part
    // where another player is the thing hurting you.
    expect(treeline.hostiles).toBe(true);
    expect(treeline.pvp).toBe(false);
    expect(deep.pvp).toBe(true);
  });

  it('needs an axe two rungs up, which is the point of the ladder', () => {
    // Black pine is tier 3, so a Splitting Axe. Reaching this region and being
    // able to cut its best wood are deliberately different achievements.
    expect(SPECIES.blackpine.tier).toBe(3);
  });
});
