// The profile registry going down must not take the game down with it.
//
// This is the test that was missing when it did. Supabase holds a PROJECTION of
// state the local database already owns, and every reader has a local fallback —
// but the fallbacks were written to trigger on `null` (not configured) while a
// registry that IS configured and unreachable threw instead. Nothing covered the
// third state, because a test either sets the variables or does not.
//
// The cost of that gap was disproportionate: `/api/leaderboard` is Railway's
// healthcheck path, so an unreachable Supabase project failed the healthcheck
// and restarted a container serving a perfectly working game. And `/api/profiles`
// is what /start blocks on before it lets anyone name a fund, so the same outage
// left new players unable to get past the first screen of the game.
//
// Unreachability is produced by rejecting `fetch`, not by pointing at a dead
// address. Both were tried; a closed port made supabase-js hang until the test
// timed out rather than fail, which would have made this a slow test that
// asserted the wrong thing. The rejection raised here is the exact error a
// paused Supabase project produced in the logs — `TypeError: fetch failed` — so
// what is covered is the real fault, and it needs no network at all.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** A syntactically valid project URL. Nothing ever reaches it — fetch is stubbed. */
const UNREACHABLE_URL = 'https://unreachable.supabase.co';

const ENV_KEYS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_SECRET_KEY',
] as const;

let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  // The clients are cached in module scope, so a fresh copy of the module graph
  // is the only way to make it pick up these values.
  vi.resetModules();
  // Errors here are the expected outcome, not a surprise. Kept quiet so a
  // passing run does not look like a failing one.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function configureUnreachable() {
  vi.stubGlobal('fetch', () => Promise.reject(new TypeError('fetch failed')));
  process.env.NEXT_PUBLIC_SUPABASE_URL = UNREACHABLE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key';
  process.env.SUPABASE_SECRET_KEY = 'test-secret-key';
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
}

function configureAbsent() {
  for (const key of ENV_KEYS) delete process.env[key];
}

const WALLET = '0x7a3b9c1d4e5f60718293a4b5c6d7e8f901234567';

describe('profile registry unreachable', () => {
  it('gives up on a hung read instead of holding the request open', async () => {
    // A rejection is not the only shape an outage takes. A connection that
    // accepts and then never answers would hang forever without the deadline,
    // and supabase-js retries for about seven seconds even on a clean
    // rejection — long enough to matter in a single-threaded process.
    vi.stubGlobal('fetch', () => new Promise<never>(() => {}));
    process.env.NEXT_PUBLIC_SUPABASE_URL = UNREACHABLE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key';

    const { globalLeaderboard } = await import('./profiles');
    const started = Date.now();
    await expect(globalLeaderboard('compound_level')).resolves.toBeNull();
    expect(Date.now() - started).toBeLessThan(4_000);
  }, 10_000);

  // Every reader in one test, fired CONCURRENTLY. Split across four tests they
  // cost four deadlines serially, which tripled the runtime of the whole suite
  // — and a slow suite gets run less, which would cost more than this covers.
  // They share a fixture and assert independent things, so there is nothing to
  // untangle when one fails.
  it('degrades every read instead of throwing', async () => {
    configureUnreachable();
    const { globalLeaderboard, profileBundle, getActivityHistory, getGlobalProfile } =
      await import('./profiles');

    const [board, bundle, history, profile] = await Promise.all([
      globalLeaderboard('compound_level'),
      profileBundle(WALLET),
      getActivityHistory(WALLET),
      getGlobalProfile(WALLET),
    ]);

    // Null is the same signal the route already handles for "not configured",
    // and its `?? leaderboard(metric)` fallback reads the local game database.
    expect(board).toBeNull();
    expect(history).toEqual([]);
    expect(profile).toBeNull();

    // `configured` answers "can a fund name be saved to the server", and the
    // answer while the registry is down is no — same as never having one. That
    // is what lets /start fall through to its local-name path instead of
    // stranding a new player on an error.
    expect(bundle.configured).toBe(false);
    // ...but the UI still needs to tell an outage from a setup state, or it
    // sends players looking for a settings page that would not help.
    expect(bundle.degraded).toBe(true);
    expect(bundle.profile).toBeNull();
    expect(bundle.history).toEqual([]);
  }, 10_000);
});

describe('profile registry absent', () => {
  it('is not reported as degraded — never configured is a different state', async () => {
    configureAbsent();
    const { profileBundle } = await import('./profiles');
    const bundle = await profileBundle(WALLET);
    expect(bundle.configured).toBe(false);
    expect(bundle.degraded).toBe(false);
  });

  it('short-circuits the leaderboard without a request', async () => {
    configureAbsent();
    const { globalLeaderboard } = await import('./profiles');
    await expect(globalLeaderboard('compound_level')).resolves.toBeNull();
  });
});
