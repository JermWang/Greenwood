// Rate limiting, including the two properties that make it worth having.
//
// Own data directory per run, matching settlement.test — these write a real
// SQLite file and must not touch the developer's data/ or each other.
import { describe, test, expect, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'osr-ratelimit-test-'));
process.env.OSR_DATA_DIR = DATA_DIR;
delete process.env.VERCEL;

const { consume, enforce, pruneRateLimits, LIMITS } = await import('./rate-limit');
const { GameError } = await import('./game');

afterAll(() => {
  try {
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
  } catch {
    /* Windows holds the handle; this is under the OS temp root. */
  }
});

const wallet = (n: number) => `0x${String(n).padStart(40, '0')}`;

describe('counting requests', () => {
  test('allows up to the limit and refuses past it', () => {
    const limit = { max: 3, windowMs: 60_000 };
    const key = `t1:${wallet(1)}`;
    const now = 1_000_000;
    expect(consume(key, limit, now).allowed).toBe(true);
    expect(consume(key, limit, now).allowed).toBe(true);
    expect(consume(key, limit, now).allowed).toBe(true);
    expect(consume(key, limit, now).allowed).toBe(false);
  });

  test('reports how many are left', () => {
    const limit = { max: 5, windowMs: 60_000 };
    const key = `t2:${wallet(2)}`;
    expect(consume(key, limit, 2_000_000).remaining).toBe(4);
    expect(consume(key, limit, 2_000_000).remaining).toBe(3);
  });

  test('starts fresh in the next window', () => {
    const limit = { max: 2, windowMs: 1_000 };
    const key = `t3:${wallet(3)}`;
    const now = 5_000_000;
    consume(key, limit, now);
    consume(key, limit, now);
    expect(consume(key, limit, now).allowed).toBe(false);
    // Next window.
    expect(consume(key, limit, now + 1_000).allowed).toBe(true);
  });

  /**
   * One wallet's budget is its own.
   *
   * A shared counter would mean a single busy player throttling everyone else,
   * which is a denial of service with extra steps.
   */
  test('keeps wallets independent', () => {
    const limit = { max: 1, windowMs: 60_000 };
    const now = 9_000_000;
    expect(consume(`t4:${wallet(10)}`, limit, now).allowed).toBe(true);
    expect(consume(`t4:${wallet(10)}`, limit, now).allowed).toBe(false);
    expect(consume(`t4:${wallet(11)}`, limit, now).allowed).toBe(true);
  });

  /** Different actions must not share a budget either. */
  test('keeps buckets independent', () => {
    const limit = { max: 1, windowMs: 60_000 };
    const now = 11_000_000;
    expect(consume(`world:${wallet(20)}`, limit, now).allowed).toBe(true);
    expect(consume(`market:${wallet(20)}`, limit, now).allowed).toBe(true);
  });
});

describe('enforcing', () => {
  test('throws a 429, not a 400, so a client knows to retry', () => {
    const w = wallet(30);
    for (let i = 0; i < LIMITS.claim.max; i += 1) enforce(w, 'claim');
    try {
      enforce(w, 'claim');
      throw new Error('should have refused');
    } catch (error) {
      expect(error).toBeInstanceOf(GameError);
      expect((error as InstanceType<typeof GameError>).status).toBe(429);
    }
  });

  test('says roughly when to come back', () => {
    const w = wallet(31);
    for (let i = 0; i < LIMITS.claim.max; i += 1) enforce(w, 'claim');
    expect(() => enforce(w, 'claim')).toThrow(/Try again in \d+s/);
  });

  test('is case-insensitive about the wallet', () => {
    const lower = `0x${'a'.repeat(40)}`;
    const upper = `0X${'A'.repeat(40)}`;
    const limit = LIMITS.claim.max;
    for (let i = 0; i < limit; i += 1) enforce(lower, 'claim');
    // Same wallet in different case must hit the same bucket, or the limit is
    // bypassed by changing capitalisation.
    expect(() => enforce(upper, 'claim')).toThrow();
  });
});

describe('the limits themselves', () => {
  /**
   * A limit of zero refuses everything, including the first legitimate request.
   * A window of zero divides by zero in the bucket maths.
   */
  test('every configured bucket is usable', () => {
    for (const [name, limit] of Object.entries(LIMITS)) {
      expect(limit.max, `${name}.max`).toBeGreaterThan(0);
      expect(limit.windowMs, `${name}.windowMs`).toBeGreaterThan(0);
    }
  });

  /**
   * Hand-play headroom.
   *
   * The point is to stop scripts without ever refusing a person. Chopping is
   * the fastest thing a human does, at roughly three clicks a second, so the
   * world bucket must comfortably clear that.
   */
  test('leaves room for a fast human', () => {
    const perSecond = (l: { max: number; windowMs: number }) => l.max / (l.windowMs / 1000);
    expect(perSecond(LIMITS.world)).toBeGreaterThanOrEqual(3);
    expect(perSecond(LIMITS.expedition)).toBeGreaterThanOrEqual(3);
  });
});

describe('housekeeping', () => {
  test('prunes windows nobody is in any more', () => {
    const limit = { max: 5, windowMs: 1_000 };
    consume(`old:${wallet(40)}`, limit, 1_000_000);
    const removed = pruneRateLimits(1_000_000 + 5 * 60_000 * 10);
    expect(removed).toBeGreaterThan(0);
  });

  test('leaves live windows alone', () => {
    const now = 50_000_000;
    consume(`live:${wallet(41)}`, { max: 5, windowMs: 60_000 }, now);
    pruneRateLimits(now);
    // Still counted: the second call should be the second in the window.
    expect(consume(`live:${wallet(41)}`, { max: 5, windowMs: 60_000 }, now).remaining).toBe(3);
  });
});
