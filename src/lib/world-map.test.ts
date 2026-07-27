// The map has to describe the world that exists, not the one it was drawn for.
//
// A diagram that disagrees with the doors is worse than no diagram: it sends a
// player walking toward a connection that is not there, and the failure is
// silent — they simply never arrive and conclude the game is broken.
import { describe, expect, it } from 'vitest';
import { MAP_LAYOUT, MAP_LINKS, HOME, routeBetween, stepHome, mapNodes } from './world-map';
import { REGIONS, type RegionId } from './regions';
import { DOORS } from './grounds-map';
import { TRADING_FLOOR_DOORS, machineRoomDoors } from '../components/iso/portals';

describe('the map covers the world', () => {
  it('places every region exactly once', () => {
    for (const region of REGIONS) {
      expect(MAP_LAYOUT[region.id], `${region.id} is not on the map`).toBeDefined();
    }
    const seen = new Set(Object.values(MAP_LAYOUT).map((p) => `${p.x}:${p.y}`));
    expect(seen.size, 'two regions share a cell').toBe(REGIONS.length);
  });

  it('knows about no region that does not exist', () => {
    const ids = new Set<string>(REGIONS.map((r) => r.id));
    for (const id of Object.keys(MAP_LAYOUT)) expect(ids.has(id), id).toBe(true);
    for (const [a, b] of MAP_LINKS) {
      expect(ids.has(a), a).toBe(true);
      expect(ids.has(b), b).toBe(true);
    }
  });
});

describe('the links match the doors', () => {
  /**
   * MAP_LINKS is written by hand because the door tables are split across two
   * modules by design and neither is reachable from a server context. That
   * duplication is fine as long as something checks it, which is this.
   */
  const linked = (a: string, b: string) =>
    MAP_LINKS.some(([x, y]) => (x === a && y === b) || (x === b && y === a));

  it('draws a link for every door out of the Grounds', () => {
    for (const door of DOORS) {
      expect(linked('grounds', door.region), `grounds <-> ${door.region}`).toBe(true);
    }
  });

  it('draws a link for every door between the rooms', () => {
    const rooms = [
      ...TRADING_FLOOR_DOORS.map((d) => ['trading-floor', d.href] as const),
      ...machineRoomDoors({ minX: -12, maxX: 12, minZ: -20, maxZ: 12 }).map(
        (d) => ['machine-room', d.href] as const
      ),
    ];
    const byHref = new Map(REGIONS.map((r) => [r.href, r.id]));
    for (const [from, href] of rooms) {
      const to = byHref.get(href);
      expect(to, `no region serves ${href}`).toBeDefined();
      expect(linked(from, to!), `${from} <-> ${to}`).toBe(true);
    }
  });
});

describe('finding the way home', () => {
  it('reaches every region from home', () => {
    // An unreachable region is content nobody can get to, and the map would be
    // the only place it was visible — which is the worst way to find out.
    for (const region of REGIONS) {
      const route = routeBetween(HOME, region.id);
      expect(route.length, `${region.id} is cut off from ${HOME}`).toBeGreaterThan(0);
    }
  });

  it('reports being home as no step, not as no route', () => {
    // These are different answers and callers have to tell them apart: one means
    // "you have arrived", the other means the map is broken.
    expect(routeBetween(HOME, HOME)).toEqual([HOME]);
    expect(stepHome(HOME)).toBeNull();
  });

  it('names the next region on the way, not the destination', () => {
    // The Deep Forest is two hops out. A player standing in it should be told to
    // head for the Treeline — the door they can actually walk to from here.
    expect(stepHome('deep-forest')).toBe('treeline');
    expect(stepHome('treeline')).toBe(HOME);
  });

  it('takes the shortest route rather than the first one found', () => {
    const route = routeBetween('deep-forest', HOME);
    expect(route).toEqual(['deep-forest', 'treeline', 'grounds']);
  });
});

describe('drawing it', () => {
  const verdict = (id: string, allowed: boolean) => ({
    id,
    allowed,
    reason: allowed ? null : 'Not yet.',
  });

  it('marks exactly one node as here', () => {
    const nodes = mapNodes('grounds', []);
    expect(nodes.filter((n) => n.here).map((n) => n.id)).toEqual(['grounds']);
  });

  it('marks nothing as here when the player is not in a region', () => {
    expect(mapNodes(null, []).some((n) => n.here)).toBe(false);
  });

  it('carries the gate reason through so a locked node can say why', () => {
    const node = mapNodes('grounds', [verdict('deep-forest', false)]).find(
      (n) => n.id === 'deep-forest'
    )!;
    expect(node.open).toBe(false);
    expect(node.locked).toBe('Not yet.');
  });

  /**
   * Unknown reads as open, deliberately.
   *
   * The map is a convenience and the door is the authority. Greying out a place
   * the player can actually reach is a worse failure than offering a walk that
   * ends in a polite refusal at the gate — one loses them content, the other
   * costs them thirty seconds.
   */
  it('treats an unknown verdict as open rather than locked', () => {
    for (const node of mapNodes('grounds', [])) expect(node.open, node.id).toBe(true);
  });

  it('never reports a locked reason for a region it says is open', () => {
    const nodes = mapNodes('grounds', REGIONS.map((r) => verdict(r.id, r.id !== 'deep-forest')));
    for (const node of nodes) {
      if (node.open) expect(node.locked, node.id).toBeNull();
      else expect(node.locked, node.id).not.toBeNull();
    }
  });
});

describe('the diagram agrees with the compass', () => {
  /**
   * The layout uses +y for SOUTH, matching the world's +Z-is-south convention,
   * so "up and to the left on the map" and "I walked north-west" describe the
   * same move. If these ever disagree the map becomes actively misleading, which
   * is worse than not having one.
   */
  it('puts the Treeline north of the Grounds, the way the doors do', () => {
    expect(MAP_LAYOUT.treeline.y).toBeLessThan(MAP_LAYOUT.grounds.y);
  });

  it('puts the Deep Forest further out than the Treeline', () => {
    const home = MAP_LAYOUT[HOME as RegionId];
    const near = Math.hypot(MAP_LAYOUT.treeline.x - home.x, MAP_LAYOUT.treeline.y - home.y);
    const far = Math.hypot(MAP_LAYOUT['deep-forest'].x - home.x, MAP_LAYOUT['deep-forest'].y - home.y);
    expect(far).toBeGreaterThan(near);
  });

  it('puts both rooms on the settlement side', () => {
    expect(MAP_LAYOUT['machine-room'].y).toBeGreaterThan(MAP_LAYOUT.grounds.y);
    expect(MAP_LAYOUT['trading-floor'].y).toBeGreaterThan(MAP_LAYOUT.grounds.y);
  });
});
