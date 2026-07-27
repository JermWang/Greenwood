// Demo mode: the whole game, for somebody who has not connected anything.
//
// WHAT A DEMO ACCOUNT IS.
//
// A real row in the real database, playing the real game. Not a mock, not a
// second code path, not a "preview" build of the systems — every desk, quest,
// NPC, region gate and Scrip balance is the same machinery a connected player
// uses. That is the entire design decision here, and it is worth being explicit
// about why: a demo built as a parallel fake is a demo that drifts, and the
// first thing it stops matching is the thing you were trying to show off.
//
// So a demo account differs from a real one in exactly three ways:
//
//   1. Its address is generated, not owned. Nobody signed anything.
//   2. It starts with Scrip, so there is something to spend in the first minute.
//   3. Region gates are waived, so every area can be walked into.
//
// Everything else — and in particular the introduction, which is the part a new
// player is actually being walked through — is untouched. A demo starts with NO
// desks, NO levels and NO instruments, because being handed a finished fund
// teaches you nothing about how to build one.
//
// WHAT IT MUST NEVER DO.
//
// Touch money. A demo address holds no key, so it can neither sign nor receive,
// and every financial action in this codebase is already gated behind
// NEXT_PUBLIC_ONCHAIN plus a signature it cannot produce. `isDemoWallet` exists
// so that anything added later can refuse demo accounts explicitly rather than
// relying on that happening to stay true.

/**
 * The marker every demo address carries.
 *
 * A fixed prefix rather than a database column, because the check has to work in
 * places that have no database handle — a route guard, a client deciding whether
 * to show the demo banner, a settlement path refusing to quote. A column would
 * be more correct and would also be unavailable exactly where the answer matters
 * most.
 *
 * It MUST be valid hex. Demo addresses go through the same `requireWallet`
 * validator as real ones (deliberately — a demo account that skipped validation
 * would be a second, weaker path into every route), and that expects 40 hex
 * characters. An obvious marker like "d3m0" contains an 'm' and would be
 * rejected by the very check it needs to pass.
 *
 * "facade" is hex, reads as what it is, and is unmistakable in a log or on a
 * leaderboard — an operator should be able to tell at a glance that a row is not
 * a person.
 */
export const DEMO_PREFIX = '0xfacade00';

/** Address length including the 0x, matching an EVM address. */
const ADDRESS_LENGTH = 42;

export function isDemoWallet(wallet: string | null | undefined): boolean {
  return typeof wallet === 'string' && wallet.toLowerCase().startsWith(DEMO_PREFIX);
}

/**
 * Mint a fresh demo address.
 *
 * Random rather than sequential so two people opening the demo at the same
 * moment cannot land on the same account and watch each other's desks appear.
 * Takes its randomness as an argument so tests are deterministic and the caller
 * decides where entropy comes from.
 */
export function newDemoWallet(random: () => number = Math.random): string {
  const body = ADDRESS_LENGTH - DEMO_PREFIX.length;
  let out = '';
  while (out.length < body) {
    out += Math.floor(random() * 0xffffffff).toString(16).padStart(8, '0');
  }
  return DEMO_PREFIX + out.slice(0, body);
}

/**
 * The starting Scrip.
 *
 * Enough to buy a Satchel (2,500) and still have something to spend on a
 * cosmetic, so the shops are explorable without grinding for them first — the
 * point of a demo is to see the game, not to earn the right to see it. Not so
 * much that the economy reads as meaningless, because a player who thinks
 * currency is free has learned the wrong thing about the real game.
 */
export const DEMO_SCRIP = 12_000;

/**
 * The cookie that remembers which demo account this browser is.
 *
 * A cookie rather than localStorage because the SERVER has to read it: the
 * authenticated-wallet check runs on the API side, and a demo request needs to
 * prove which demo account it is without a signature.
 */
export const DEMO_COOKIE = 'greenwood_demo';

/** A month. Long enough to come back to, short enough not to be permanent. */
export const DEMO_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;
