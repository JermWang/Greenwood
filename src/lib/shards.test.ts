// Shard selection, and the two judgement calls in it that are easy to get
// backwards.
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SHARD,
  SHARDS,
  canJoinShard,
  recommendShard,
  shardById,
  shardStatus,
} from './shards';

const counts = (over: Record<string, number> = {}) =>
  Object.fromEntries(SHARDS.map((s) => [s.id, over[s.id] ?? 0]));

describe('the shard list', () => {
  it('has unique ids and a default that exists', () => {
    expect(new Set(SHARDS.map((s) => s.id)).size).toBe(SHARDS.length);
    expect(shardById(DEFAULT_SHARD)).not.toBeNull();
  });

  it('keeps the soft cap below the hard one', () => {
    // Two numbers rather than one so a player gets WARNED before they get
    // refused. Equal caps collapse that back to a single wall with no notice.
    for (const s of SHARDS) expect(s.soft, s.id).toBeLessThan(s.hard);
  });

  it('resolves unknown ids to null rather than to a default', () => {
    // A stale cookie naming a retired shard must fail visibly at the menu, not
    // silently drop somebody into a world they did not pick.
    expect(shardById('evergreen-nowhere')).toBeNull();
    expect(shardById(null)).toBeNull();
  });
});

describe('status', () => {
  const shard = SHARDS[0];

  it('reports open, busy and full at the right thresholds', () => {
    expect(shardStatus(shard, 0)).toBe('open');
    expect(shardStatus(shard, shard.soft - 1)).toBe('open');
    expect(shardStatus(shard, shard.soft)).toBe('busy');
    expect(shardStatus(shard, shard.hard - 1)).toBe('busy');
    expect(shardStatus(shard, shard.hard)).toBe('full');
  });

  it('still lets people into a busy shard, but never a full one', () => {
    expect(canJoinShard(shard, shard.soft)).toBe(true);
    expect(canJoinShard(shard, shard.hard)).toBe(false);
    expect(canJoinShard(shard, shard.hard + 20)).toBe(false);
  });
});

describe('the recommendation', () => {
  /**
   * The call that is easy to get backwards.
   *
   * Sending people to the EMPTIEST shard is the obvious implementation and it is
   * wrong for this game: the Deep Forest is about running into other people, so
   * the emptiest world is the worst experience on offer. Recommending it is how
   * a populated game comes to feel dead.
   */
  it('sends players to the busiest shard that is not yet crowded', () => {
    const busiest = recommendShard(
      counts({ [SHARDS[0].id]: 3, [SHARDS[1].id]: 18, [SHARDS[2].id]: 9 })
    );
    expect(busiest.id).toBe(SHARDS[1].id);
  });

  it('skips a shard that has passed its soft cap', () => {
    const over = counts({ [SHARDS[0].id]: SHARDS[0].soft + 5, [SHARDS[1].id]: 4 });
    expect(recommendShard(over).id).toBe(SHARDS[1].id);
  });

  it('never recommends a full shard', () => {
    const packed = Object.fromEntries(SHARDS.map((s) => [s.id, s.hard]));
    // Everything is full; whatever comes back, it must not claim to be joinable.
    const picked = recommendShard(packed);
    expect(SHARDS.some((s) => s.id === picked.id)).toBe(true);
  });

  it('falls back to a joinable shard when every one is at least busy', () => {
    const busy = Object.fromEntries(
      SHARDS.map((s, i) => [s.id, i === 2 ? s.soft + 1 : s.hard])
    );
    const picked = recommendShard(busy);
    expect(canJoinShard(picked, busy[picked.id])).toBe(true);
  });

  it('picks something sane when nobody is playing at all', () => {
    expect(SHARDS.some((s) => s.id === recommendShard(counts()).id)).toBe(true);
  });
});
