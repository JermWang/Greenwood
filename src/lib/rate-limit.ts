// Per-wallet rate limiting, in SQLite.
//
// There was none anywhere: no middleware, no throttle on any of the 56 routes.
// Claims have a one-hour cooldown and chopping has a per-tree respawn, but
// those are game rules that happen to slow things down, not limits — nothing
// stopped a script hammering /api/trees/chop, /api/craft or /api/market/list as
// fast as the server would answer. For a game paying out real tokens that is
// the whole exploit surface.
//
// SQLITE RATHER THAN A MAP, and this is the same lesson CLAUDE.md already
// records: Next bundles each route handler separately, so a Map in a lib is a
// DIFFERENT Map for /trees/chop than it is for /craft. A limiter that forgets
// between routes is not a limiter. The table is local, synchronous and costs a
// single upsert.
//
// FIXED WINDOWS, not a token bucket. A bucket needs a refill rate, a capacity
// and a last-seen timestamp, and gets the arithmetic wrong at exactly the
// boundary nobody tests. A window needs a counter and an expiry. The worst case
// is a caller getting 2x the limit across a window boundary, which for these
// numbers is irrelevant — the point is to stop a script doing thousands, not to
// meter precisely.
//
// This is NOT sybil defence. One wallet is limited; a thousand wallets are a
// thousand limits.
//
// The obvious sybil worry — 1,000 free GREEN per address against a desk costing
// exactly 1,000 — turned out not to be one, and the reasoning is worth keeping
// because it is not obvious. Once the token is live, spends are real ERC-20
// transfers and claims pay out real tokens, so the mirrored osr_balance is
// neither debited nor credited: free GREEN buys nothing and withdraws nothing.
// starterGrantFor in lib/game now scopes the grant to the demo and the
// pre-token period, which is where it was always meant to apply.
//
// What IS worth guarding at launch is pre-token farming: desks created before
// the switch keep accruing, and those accruals become real payouts afterwards.
// That is a launch-sequence problem, not a rate-limit one — wipe before the
// token address is configured.

import { getDb } from './db';
import { GameError } from './game';

export interface Limit {
  /** Requests permitted per window. */
  max: number;
  windowMs: number;
}

/**
 * What each kind of action costs a caller.
 *
 * Tuned to be invisible to a person and obvious to a script. A player chopping
 * as fast as they can click manages maybe three a second for a few seconds; 40
 * in 10s allows that and refuses a loop. The money paths are tighter because
 * they are slower by nature — nobody mints eleven desks a minute by hand.
 */
export const LIMITS = {
  /** Catch-all for any authenticated mutation with no specific rule. */
  default: { max: 120, windowMs: 60_000 },
  /** Felling, crafting, and the other repeatable world actions. */
  world: { max: 40, windowMs: 10_000 },
  /** Anything that quotes or settles a spend. */
  settle: { max: 10, windowMs: 60_000 },
  /** Claiming. The cooldown already gates it; this stops the retry storm. */
  claim: { max: 6, windowMs: 60_000 },
  /** Listing and buying, where a script could otherwise scalp every listing. */
  market: { max: 30, windowMs: 60_000 },
  /** Expedition movement, which is the highest-frequency legitimate action. */
  expedition: { max: 90, windowMs: 10_000 },
  /**
   * Talking in world chat.
   *
   * The only bucket that is a MODERATION control as much as a load one. Chat
   * reaches every player on the shard at once, so the failure it prevents is
   * not a busy server, it is one person making the room unusable for forty
   * others. Eight in ten seconds is a fast conversation and an impossible
   * flood -- a person typing flat out manages perhaps three.
   *
   * Spent per WALLET, after the session check, like every other bucket. That
   * is the strongest thing available: the send gap in the browser is a
   * courtesy against a stuck key and nothing more, because the browser is no
   * longer what decides whether a line reaches the room. See api/chat/say.
   */
  chat: { max: 8, windowMs: 10_000 },
  /**
   * Sign-in nonce requests, keyed by IP rather than wallet.
   *
   * The only unauthenticated write in the app, so it is the only bucket a
   * caller can spend without proving anything first. Generous enough for a
   * shared office or a phone on CGNAT retrying a flaky signature, tight enough
   * that nobody is filling the nonce table from a laptop.
   */
  signIn: { max: 20, windowMs: 60_000 },
} as const satisfies Record<string, Limit>;

export type LimitName = keyof typeof LIMITS;

function ensureTable() {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS rate_limits (
      key TEXT PRIMARY KEY,
      count INTEGER NOT NULL,
      window_start INTEGER NOT NULL
    );
  `);
}

/**
 * Count one request against a bucket.
 *
 * Returns what is left rather than throwing, so callers can decide — the route
 * helper below turns it into a 429, but a background task might prefer to skip.
 *
 * The whole thing is one statement under a transaction so two concurrent
 * requests cannot both read a count of 9 and both write 10. That is the same
 * conditional-write discipline the crate and listing code uses, and it is the
 * only reason this is worth having: a limiter with a read-then-write race is a
 * limiter that a parallel script walks straight through.
 */
export function consume(key: string, limit: Limit, now = Date.now()): { allowed: boolean; remaining: number; resetMs: number } {
  ensureTable();
  const db = getDb();
  const windowStart = now - (now % limit.windowMs);

  db.exec('BEGIN IMMEDIATE');
  try {
    const row = db.prepare('SELECT count, window_start FROM rate_limits WHERE key = ?').get(key) as
      | { count: number; window_start: number }
      | undefined;

    let count: number;
    if (!row || row.window_start !== windowStart) {
      db.prepare(
        `INSERT INTO rate_limits (key, count, window_start) VALUES (?,1,?)
         ON CONFLICT(key) DO UPDATE SET count = 1, window_start = excluded.window_start`
      ).run(key, windowStart);
      count = 1;
    } else {
      count = row.count + 1;
      db.prepare('UPDATE rate_limits SET count = ? WHERE key = ?').run(count, key);
    }
    db.exec('COMMIT');

    return {
      allowed: count <= limit.max,
      remaining: Math.max(0, limit.max - count),
      resetMs: windowStart + limit.windowMs - now,
    };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

/**
 * Enforce a limit, or refuse with a 429.
 *
 * 429 rather than 400 because it is transient and the client should be able to
 * tell the difference: a retry will work, and the message says roughly when.
 */
export function enforce(wallet: string, name: LimitName, now = Date.now()): void {
  const limit = LIMITS[name];
  const verdict = consume(`${name}:${wallet.toLowerCase()}`, limit, now);
  if (!verdict.allowed) {
    const seconds = Math.max(1, Math.ceil(verdict.resetMs / 1000));
    throw new GameError(`Slow down — too many requests. Try again in ${seconds}s.`, 429);
  }
}

/**
 * Drop windows nobody is in any more.
 *
 * Without this the table grows one row per wallet per bucket forever. Called
 * from the same activity hook as snapshots; cheap enough to run often.
 */
export function pruneRateLimits(now = Date.now()): number {
  ensureTable();
  const oldest = Math.max(...Object.values(LIMITS).map((l) => l.windowMs));
  const result = getDb()
    .prepare('DELETE FROM rate_limits WHERE window_start < ?')
    .run(now - oldest * 2);
  return Number(result.changes ?? 0);
}
