// Where a player may go, and what the rules are once they are there.
//
// One table, the same way portals.ts is one table for doors. A region carries
// everything that changes between places: how big it is, what level it takes to
// enter, whether other players can kill you, and what the light looks like.
// Splitting those across a scene component, a route guard and a lighting rig is
// how a zone ends up enforcing three different answers to "may I be here".
//
// This is the front half of the world's hidden layer (see docs/greenwood-turn.md):
// Greenwood presents as a yield game and the outdoors reveals, slowly, that the
// yield is power and the desks are generators. The regions below are the pacing
// of that reveal, which is why the level gates are not evenly spaced — the
// Grounds open early and read as a park, the Treeline is the first wrongness you
// can walk into, and the Deep Forest is the turn.

export type RegionId =
  | 'machine-room'
  | 'trading-floor'
  | 'grounds'
  | 'greenwood-hq'
  | 'hq-lobby'
  | 'treeline'
  | 'deep-forest';

/**
 * The light a region is lit by.
 *
 * Named rather than numeric so the scene, the loading screen and the map legend
 * all agree, and so the progression from daylight to moonlight is legible in the
 * table itself rather than emerging from twenty scattered constants.
 *
 * The brand rule holds throughout and is not negotiable: the world is lit in
 * ordinary real-world colour, and Robin Neon is reserved for branding, signage,
 * UI and status. It has been broken twice and reverted twice. The Deep Forest is
 * where that discipline pays off — under moonlight, the only neon left in the
 * world is on working equipment, so the brand colour stops meaning "Greenwood"
 * and starts meaning "this still works".
 */
export type LightingProfile = 'interior-neutral' | 'overcast-afternoon' | 'amber-dusk' | 'moonlit-fog';

export interface Region {
  id: RegionId;
  name: string;
  /** Route that renders this region. */
  href: string;
  /** Total level (sum of XP tracks) required to enter. 0 for the starting rooms. */
  minTotalLevel: number;
  /**
   * The level your best desk must have reached. 0 for no requirement.
   *
   * A SECOND, DIFFERENT question from minTotalLevel, and the reason both exist:
   *
   * Total Level measures TENURE. It is the sum of four action-XP tracks, so it
   * answers "have you played" — and it can be reached entirely by trading, which
   * is a legitimate way to play and tells you nothing about whether the player
   * can survive an hour past the fence. Someone who ground the Exchange to level
   * 10 could walk into a PvP zone with a level-1 desk and nothing to lose, and a
   * player with nothing to lose is the ideal griefer. The tension out there
   * depends on everyone risking something.
   *
   * So this measures CAPABILITY, and deliberately measures it as the level of a
   * single desk rather than as a balance or a total. Levelling one desk is a
   * repeated action against a shared capital budget (see lib/capital), which
   * keeps region access a function of what you have DONE — the same principle
   * that keeps XP off holdings in lib/progression. Gating on BNTY held would
   * make the outdoors something you buy.
   *
   * The real payoff is coupling. Without it the idle game and the extraction
   * game are two games sharing a wallet; with it, the first is the prerequisite
   * for the second.
   */
  minDeskLevel: number;
  /** Whether other players may attack you here. */
  pvp: boolean;
  /** Whether hostiles spawn here. */
  hostiles: boolean;
  /** A pack is required to enter — see lib/packs. */
  requiresPack: boolean;
  lighting: LightingProfile;
  /**
   * Tile extent. Kept here so the gate check, the minimap and the terrain
   * streamer read one number; a region whose bounds live in its scene component
   * cannot be validated server-side, which is the whole reason movement outside
   * the room is currently unauthenticated.
   */
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** One line for the gate sign and the region card. */
  blurb: string;
}

/**
 * Every region, in the order a player meets them.
 *
 * The Deep Forest's bounds are deliberately enormous and are NOT renderable by
 * the current board — IsoBoard builds one InstancedMesh over every tile and
 * recolours all of them in an effect, which is comfortable at the Machine Room's
 * ~825 tiles and is not at ~25,000. The number is here because it is the design
 * target and because the gate logic can be correct before the renderer is; the
 * terrain streamer is its own stage of work.
 */
export const REGIONS: Region[] = [
  {
    id: 'trading-floor',
    name: 'Trading Floor',
    href: '/app/trading-floor',
    minTotalLevel: 0,
    minDeskLevel: 0,
    pvp: false,
    hostiles: false,
    requiresPack: false,
    lighting: 'interior-neutral',
    bounds: { minX: -11, maxX: 11, minZ: -11, maxZ: 11 },
    blurb: 'The social floor. Stalls, the Outfitter, and everyone else.',
  },
  {
    id: 'machine-room',
    name: 'Machine Room',
    href: '/app/floor',
    minTotalLevel: 0,
    minDeskLevel: 0,
    pvp: false,
    hostiles: false,
    requiresPack: false,
    lighting: 'interior-neutral',
    bounds: { minX: -12, maxX: 12, minZ: -20, maxZ: 12 },
    blurb: 'Your floor. Desks, instruments, and the layout that scores them.',
  },
  {
    id: 'grounds',
    name: 'Greenwood Grounds',
    href: '/app/grounds',
    minTotalLevel: 0,
    // Ungated on purpose, on both axes. The first step outside is the reveal,
    // and you do not put a toll on it — it is also the only route to the Machine
    // Room and the Trading Floor, so a gate here would lock a player out of
    // their own fund.
    minDeskLevel: 0,
    pvp: false,
    hostiles: false,
    requiresPack: false,
    lighting: 'overcast-afternoon',
    /**
     * Must match BOUNDS in lib/grounds-map, and grounds-map.test asserts it.
     *
     * Drawn tight around the content. This was ±40 — 81x81 tiles with everything
     * in a strip down the middle, so most of the region was grass a player could
     * cross for twenty seconds and find nothing. Empty margin is worse than a
     * small map: it teaches people the world is empty and costs frames drawing
     * scatter nobody stands next to. More world means another REGION through a
     * gate, not a bigger rectangle.
     */
    bounds: { minX: -22, maxX: 22, minZ: -20, maxZ: 24 },
    blurb: 'Outside. Paths, tree lines, and the fence at the far end.',
  },
  {
    /**
     * Greenwood HQ — the plaza and the tower on it.
     *
     * Sits between the Grounds and the Treeline, which is the point of adding
     * it: the route used to go straight from "a pleasant park" to "something
     * moves out here", with nothing in between worth losing. HQ is the most
     * civilised place in the game and the last one before the fence means
     * anything.
     *
     * Level 3 rather than 0: it is the first place that has to be REACHED, and
     * an introduction that has already taught a player to open a desk and route
     * yield is exactly three levels long.
     */
    id: 'greenwood-hq',
    name: 'Greenwood HQ',
    href: '/app/hq',
    minTotalLevel: 3,
    minDeskLevel: 0,
    pvp: false,
    hostiles: false,
    requiresPack: false,
    lighting: 'overcast-afternoon',
    // Must match BOUNDS in lib/hq-map — asserted in hq-map.test.
    bounds: { minX: -20, maxX: 20, minZ: -16, maxZ: 20 },
    blurb: 'The plaza, the fountain, and the tower that runs the lights.',
  },
  {
    /**
     * The lobby, and everything above it.
     *
     * Declared before it has a scene ON PURPOSE. The tower door in the plaza
     * points here, so the gate refuses it with a sentence rather than the door
     * simply not being drawn — a building whose entrance you can see is one you
     * can plan to get into, and the region table is where "not yet" is said.
     *
     * The floors above are their own regions reached by the elevator, which is
     * the first VERTICAL door in this game; components/iso/portals has no
     * concept of floors and that is deliberately unsolved here.
     */
    id: 'hq-lobby',
    name: 'HQ Lobby',
    href: '/app/hq/lobby',
    minTotalLevel: 3,
    minDeskLevel: 0,
    pvp: false,
    hostiles: false,
    requiresPack: false,
    lighting: 'interior-neutral',
    bounds: { minX: -14, maxX: 14, minZ: -14, maxZ: 14 },
    blurb: 'Reception, the boards, and the lifts.',
  },
  {
    id: 'treeline',
    name: 'The Treeline',
    href: '/app/treeline',
    minTotalLevel: 6,
    // One desk past its first upgrade. A low bar deliberately: this is the rung
    // that teaches the requirement exists, and the Treeline cannot take anything
    // from you but your pack.
    minDeskLevel: 3,
    pvp: false,
    hostiles: true,
    requiresPack: true,
    lighting: 'amber-dusk',
    bounds: { minX: -70, maxX: 70, minZ: -70, maxZ: 70 },
    blurb: 'Past the fence. Something moves out here, but it will not follow you home.',
  },
  {
    id: 'deep-forest',
    name: 'The Deep Forest',
    href: '/app/deep-forest',
    minTotalLevel: 10,
    // The zone where other players can kill you, so this is where the capability
    // gate earns its keep — an established fund has something to lose, and a run
    // out here only means anything if everyone in it does.
    minDeskLevel: 8,
    pvp: true,
    hostiles: true,
    requiresPack: true,
    lighting: 'moonlit-fog',
    /**
     * Matches EXTENT in lib/deep-forest-map, and must keep matching it.
     *
     * These were ±220 — the design target — while the map actually generated at
     * ±46. Nothing warned, because the two numbers lived in different files and
     * neither was obviously wrong on its own. The symptom was that spawning used
     * maxZ - 2 and put players at z = 218: a hundred and seventy tiles past the
     * edge of the world, on ground that does not exist, with no character
     * visible anywhere. Growing the zone means growing both, together, and
     * regions.test asserts they agree.
     */
    bounds: { minX: -46, maxX: 46, minZ: -46, maxZ: 46 },
    blurb: 'Dead generators, and everyone else who wants them. You keep what you carry out.',
  },
];

const BY_ID = new Map(REGIONS.map((region) => [region.id, region]));

export function regionById(id: string): Region | null {
  return BY_ID.get(id as RegionId) ?? null;
}

/** Regions where the rules change enough to warn about before entering. */
export const isHostileRegion = (region: Region) => region.pvp || region.hostiles;

export interface EntryCheck {
  allowed: boolean;
  /** Player-facing reason, already written as a sentence. Null when allowed. */
  reason: string | null;
  /** Machine-readable cause, for the client to decide what to offer next. */
  code: 'ok' | 'unknown-region' | 'level' | 'desk' | 'pack';
}

/** What `canEnter` needs to know about a player. */
export interface EntrantState {
  totalLevel: number;
  hasPack: boolean;
  /**
   * The level of their highest desk. Optional, so existing callers that only
   * care about the level and pack gates keep working — but note that OMITTING it
   * is treated as 0, which fails any region with a desk requirement. That is the
   * safe direction: a caller that forgets to pass it locks people out, which
   * gets reported, rather than letting them through, which does not.
   */
  bestDeskLevel?: number;
}

/**
 * May this player enter?
 *
 * Every reason is returned as both a sentence and a code, because the two are
 * used differently: the sentence goes on the gate, and the code decides whether
 * the client offers "buy a pack" or "come back at level 10". Returning only a
 * string forces the caller to match on prose, which breaks the moment the copy
 * is edited.
 *
 * Deliberately takes plain values rather than a wallet: the gate has to be
 * checkable from a route guard, from a test, and from the client's own
 * pre-flight, and only one of those has a database.
 */
export function canEnter(regionId: string, player: EntrantState): EntryCheck {
  const region = regionById(regionId);
  if (!region) {
    return { allowed: false, reason: 'There is no way through here.', code: 'unknown-region' };
  }
  if (player.totalLevel < region.minTotalLevel) {
    return {
      allowed: false,
      reason: `${region.name} opens at total level ${region.minTotalLevel}. You are level ${player.totalLevel}.`,
      code: 'level',
    };
  }
  // Checked after the level and before the pack, which is the order they are
  // acquired in — a player reads the first thing they are missing, and being
  // told to buy a pack for a region they cannot enter anyway is a wasted 2,500
  // Scrip and a wasted trip.
  if (region.minDeskLevel > 0 && (player.bestDeskLevel ?? 0) < region.minDeskLevel) {
    return {
      allowed: false,
      reason: `${region.name} needs a desk at level ${region.minDeskLevel}. Your best is level ${player.bestDeskLevel ?? 0} — the fund has to be able to carry a bad run.`,
      code: 'desk',
    };
  }
  if (region.requiresPack && !player.hasPack) {
    return {
      allowed: false,
      reason: `You need a pack before going past the fence. Nothing you find out there can come back without one.`,
      code: 'pack',
    };
  }
  return { allowed: true, reason: null, code: 'ok' };
}

/**
 * Where a player appears when they enter a region from the world map.
 *
 * The centre of the south edge, two tiles in — the same convention doors use
 * (see components/iso/portals): you arrive at an edge facing into the room,
 * never in the middle having apparently teleported.
 *
 * Chosen by the SERVER, not asked for. In a PvP region, letting a client name
 * its own spawn is letting it choose to arrive behind somebody.
 */
export function arrivalCellFor(region: Region): { x: number; z: number } {
  return {
    x: Math.round((region.bounds.minX + region.bounds.maxX) / 2),
    z: region.bounds.maxZ - 2,
  };
}

/** Regions this player could walk into right now, for the map and the next-step hint. */
export function availableRegions(player: EntrantState): Region[] {
  return REGIONS.filter((region) => canEnter(region.id, player).allowed);
}

/**
 * The next region that will open, and what is standing in the way.
 *
 * Returns the closest locked region by level rather than the first in the table,
 * so the hint always names the thing actually within reach.
 */
export function nextRegion(player: EntrantState): { region: Region; check: EntryCheck } | null {
  const locked = REGIONS.map((region) => ({ region, check: canEnter(region.id, player) }))
    .filter((entry) => !entry.check.allowed)
    .sort((a, b) => a.region.minTotalLevel - b.region.minTotalLevel);
  return locked[0] ?? null;
}
