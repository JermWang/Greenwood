// Servers, and why a single-world game needs more than one.
//
// NO IMPORTS. The renderer, the region gate and the presence query all have to
// agree which shard a player is on, and two of those run in places that cannot
// reach a database handle.
//
// WHY SHARDS AT ALL
//
// Evergreen's outdoor regions are shared space: the Deep Forest shows you other
// players, lets them kill you, and drops your pack where you fall. That is the
// whole tension, and it has a population curve — too few people and the zone is
// a walking simulator, too many and every generator has a queue and every fight
// is a three-way. A region is FUN across a band, not at a number, so the answer
// is several copies of the world and a way to choose between them.
//
// It is also the pressure valve. Presence, loot piles and creature state all
// live in SQLite on one box; a zone that fills up degrades for everybody in it
// at once, and no amount of tuning fixes that from inside a single world.
//
// WHAT A SHARD IS NOT
//
// A separate save. Your fund, desks, levels, Scrip and pack are yours on every
// shard — they belong to the account, not to the world. What is per-shard is
// only what is CONTESTED: who is standing where, whose pack is on the ground,
// which creatures are dead. That split is the whole design, and it is why
// changing shard is a menu rather than a migration.

export type ShardStatus = 'open' | 'busy' | 'full' | 'offline';

export interface Shard {
  id: string;
  name: string;
  /** Rough physical home, so a player can pick one near them. */
  region: string;
  /** How many players the zone plays well with. Not a hard cap — see below. */
  soft: number;
  /**
   * The hard ceiling. Refused past this.
   *
   * Above `soft` a shard is playable but crowded and says so; above `hard` it
   * stops taking people. Two numbers rather than one because a hard cap alone
   * gives a player no warning — they queue into a shard that is technically
   * open and find a fight at every generator.
   */
  hard: number;
}

/**
 * The worlds.
 *
 * A short hand-written list rather than something auto-scaled, because each one
 * is a PLACE people will name and come back to, and a shard that appears and
 * disappears with load is a place nobody can arrange to meet in.
 */
export const SHARDS: Shard[] = [
  { id: 'evergreen-1', name: 'Evergreen I', region: 'North America', soft: 40, hard: 60 },
  { id: 'evergreen-2', name: 'Evergreen II', region: 'North America', soft: 40, hard: 60 },
  { id: 'evergreen-eu', name: 'Ashby', region: 'Europe', soft: 40, hard: 60 },
  { id: 'evergreen-ap', name: 'Cardell', region: 'Asia-Pacific', soft: 40, hard: 60 },
];

const BY_ID = new Map(SHARDS.map((s) => [s.id, s]));

export function shardById(id: string | null | undefined): Shard | null {
  return id ? BY_ID.get(id) ?? null : null;
}

/**
 * Where a player lands if they never choose.
 *
 * The first shard, deliberately, rather than the emptiest. A default that moves
 * with load scatters everybody who did not care across four worlds and leaves
 * all of them below the population the zone needs to be interesting.
 */
export const DEFAULT_SHARD = SHARDS[0].id;

/** Status from a live headcount. */
export function shardStatus(shard: Shard, players: number): ShardStatus {
  if (players >= shard.hard) return 'full';
  if (players >= shard.soft) return 'busy';
  return 'open';
}

/** May this player join? Full means full — the ceiling is the whole point. */
export function canJoinShard(shard: Shard, players: number): boolean {
  return shardStatus(shard, players) !== 'full';
}

/**
 * The shard to suggest.
 *
 * The busiest one that is still under its soft cap, not the emptiest. A game
 * about running into other people should concentrate players rather than spread
 * them — the emptiest shard is the worst experience available, and recommending
 * it is how a populated game feels dead.
 */
export function recommendShard(counts: Record<string, number>): Shard {
  const open = SHARDS.filter((s) => (counts[s.id] ?? 0) < s.soft);
  if (open.length === 0) {
    // Everything is at least busy: take whatever still has headroom at all.
    const usable = SHARDS.filter((s) => canJoinShard(s, counts[s.id] ?? 0));
    return usable[0] ?? SHARDS[0];
  }
  return open.reduce((best, s) =>
    (counts[s.id] ?? 0) > (counts[best.id] ?? 0) ? s : best
  );
}

/** Cookie the browser remembers its shard in, readable by both halves. */
export const SHARD_COOKIE = 'evergreen_shard';

/**
 * Which shard a cookie jar says this player is on.
 *
 * Takes the raw cookie STRING rather than reading it, so the same function
 * answers on both halves: the server passes `request.headers.get('cookie')` and
 * the browser passes `document.cookie`, which are the same format. That is the
 * point of this module having no imports — the renderer, the region gate and
 * the presence channel must agree on the answer, and only one of them can see a
 * database.
 *
 * Falls back to DEFAULT_SHARD rather than null. A player with no cookie is not
 * an error state, it is a first visit, and every caller would otherwise have to
 * invent the same default.
 */
export function shardFromCookie(cookie: string | null | undefined): string {
  if (!cookie) return DEFAULT_SHARD;
  const hit = cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SHARD_COOKIE}=`));
  const id = hit?.slice(SHARD_COOKIE.length + 1);
  // Validated against the table, not trusted. The cookie is client-writable, and
  // an unknown id would otherwise open a channel nobody else is listening on --
  // a private world, reached by editing devtools, which is the one way to be
  // alone in a shared region.
  return shardById(id)?.id ?? DEFAULT_SHARD;
}

/** How long a shard choice sticks. Long: it is a place you come back to. */
export const SHARD_COOKIE_MAX_AGE = 60 * 60 * 24 * 90;
