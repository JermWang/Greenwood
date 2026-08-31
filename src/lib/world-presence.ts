// How busy each world is.
//
// The count behind the shard picker, and the thing that makes lib/shards' soft
// and hard numbers mean something rather than being a table nobody consults.
//
// WHY THIS IS NOT WHERE POSITION LIVES. Two systems already answer "where is
// that player standing", and both are right for their region: Supabase presence
// for the shared rooms, because it is ephemeral and vanishes with the tab, and
// expedition_state for the contested ones, because out there a position decides
// who reaches the loot first and has to be the server's opinion rather than the
// client's. This answers a slower question -- which world are you in -- and
// writes on a heartbeat measured in tens of seconds.
//
// A player who closes the tab is not removed; they age out. That is deliberate:
// a goodbye is the one message you cannot rely on arriving, so a count that
// depends on it drifts upward forever and every shard eventually reads full.

import { getDb } from './db';
import { SHARDS, canJoinShard, shardById, recommendShard, type Shard, type ShardStatus, shardStatus } from './shards';

/**
 * How long a heartbeat counts for.
 *
 * Comfortably more than the client's interval, so one dropped request does not
 * make a player flicker out of the population and back in. Short enough that a
 * closed tab stops being counted before somebody picking a world is misled by
 * it.
 */
export const PRESENCE_TTL_MS = 90_000;

/** Record that this wallet is in this world, now. */
export function heartbeat(wallet: string, shardId: string, regionId: string, now = Date.now()): void {
  // Validated against the table rather than stored as sent. The shard arrives
  // from a cookie the client can edit, and an unknown id would create a world
  // that exists only in the population count.
  const shard = shardById(shardId);
  if (!shard) return;
  getDb()
    .prepare(
      `INSERT INTO world_presence (wallet, shard_id, region_id, seen_at) VALUES (?,?,?,?)
         ON CONFLICT(wallet) DO UPDATE SET
           shard_id = excluded.shard_id,
           region_id = excluded.region_id,
           seen_at = excluded.seen_at`
    )
    .run(wallet.toLowerCase(), shard.id, regionId, now);
}

/** Live population per shard id. Shards with nobody in them are absent. */
export function shardCounts(now = Date.now()): Record<string, number> {
  const rows = getDb()
    .prepare('SELECT shard_id, COUNT(*) AS n FROM world_presence WHERE seen_at > ? GROUP BY shard_id')
    .all(now - PRESENCE_TTL_MS) as unknown as Array<{ shard_id: string; n: number }>;
  const counts: Record<string, number> = {};
  for (const row of rows) counts[row.shard_id] = Number(row.n);
  return counts;
}

export interface ShardView extends Shard {
  players: number;
  status: ShardStatus;
  /** Whether a player may join right now. False above the hard ceiling. */
  joinable: boolean;
}

/** Every world, with how full it is, for the picker. */
export function shardViews(now = Date.now()): { shards: ShardView[]; recommended: string } {
  const counts = shardCounts(now);
  const shards = SHARDS.map((shard) => {
    const players = counts[shard.id] ?? 0;
    return {
      ...shard,
      players,
      status: shardStatus(shard, players),
      joinable: canJoinShard(shard, players),
    };
  });
  return { shards, recommended: recommendShard(counts).id };
}

/**
 * Whether this wallet may enter that shard.
 *
 * Checked server-side as well as shown in the picker, because the picker is a
 * suggestion and the cookie behind it is client-writable. Without this the hard
 * ceiling is decoration.
 */
export function mayJoinShard(shardId: string, now = Date.now()): boolean {
  const shard = shardById(shardId);
  if (!shard) return false;
  return canJoinShard(shard, shardCounts(now)[shard.id] ?? 0);
}
