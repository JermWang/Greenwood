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
 * The starting BNTY. Fake, and enough to actually see the game.
 *
 * A demo used to get the ordinary starter grant of 1,000 — sized so a REAL new
 * wallet can afford its first desk and then earn everything after it. For
 * somebody who has connected nothing and will be gone in ten minutes, that is
 * one desk and then a wait, and the introduction runs straight into a wall on
 * step three:
 *
 *   first desk           1,000   (750 for a Treasury Desk)
 *   open an allocation  10,000   ← CRATE_OPEN_BNTY, ten times the whole grant
 *   take a desk to L2      250
 *   open a Note            100   (STAKE_MIN_BNTY, and it comes back)
 *   buy on the Exchange      ?   whatever is listed
 *
 * So 50,000: four desks, three allocations, a desk taken to L5, a couple of
 * portfolio upgrades, a Note and something off the Exchange, with headroom.
 * Every mechanic reachable, none of them twice over.
 *
 * Deliberately not more. It is still two orders of magnitude below what a real
 * fund accumulates, because a player who leaves the demo thinking currency is
 * free has learned the wrong thing about the game they are being invited into —
 * the same reason DEMO_SCRIP is 12,000 and not a million.
 *
 * This balance is NEVER a liability. A demo address holds no key, so it cannot
 * sign, cannot settle and cannot withdraw; the tokens do not have to exist. See
 * DEMO_WALLET_LIKE for the half of that which is enforced rather than promised.
 */
export const DEMO_BNTY = 50_000;

/**
 * LIKE pattern matching every demo wallet, for queries that must exclude them.
 *
 * The SQL half of `isDemoWallet`, and it exists because the aggregates that
 * measure what the protocol OWES read the users table directly:
 *
 *   solvency()          liability = SUM(osr_balance) + SUM(nodes.accrued)
 *   protocolOverview()  balances  = SUM(osr_balance)
 *
 * Demo balances are not owed to anybody — nobody can sign for them — so
 * counting them overstates the liability against the real treasury. That was
 * already slightly wrong at a 1,000 grant. At 50,000 it would be a live hazard:
 * the demo cookie is not a credential anybody has to earn, so a person willing
 * to mint sessions in a loop could inflate the reported liability at will, and
 * there is a payout brake watching that number.
 *
 * Bound as a parameter rather than pasted into the SQL. The value is a constant
 * and could not inject anything, but a query built by string concatenation is a
 * pattern the next person copies somewhere it matters.
 */
export const DEMO_WALLET_LIKE = `${DEMO_PREFIX}%`;

/**
 * The cookie that remembers which demo account this browser is.
 *
 * A cookie rather than localStorage because the SERVER has to read it: the
 * authenticated-wallet check runs on the API side, and a demo request needs to
 * prove which demo account it is without a signature.
 */
export const DEMO_COOKIE = 'evergreen_demo';

/** A month. Long enough to come back to, short enough not to be permanent. */
export const DEMO_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

/**
 * Where a demo begins: OUTSIDE, at the arrival gate on the Grounds.
 *
 * "Play the demo" used to open a hand-placed Machine Room full of desks nobody
 * built, rendered from a fake machine list with no account behind it. That is a
 * screenshot you can walk around in, and it starts a new player at the end of
 * the game's first hour — in the one room the game's own navigation says you
 * are supposed to have WALKED to — with nothing to do, because none of it was
 * real and none of it was theirs.
 *
 * So both entrances (this route and the button in the top bar) land here
 * instead. The Grounds are ungated for everybody (lib/regions), so this is not
 * a demo privilege: it is simply where the game starts once there is an account
 * to start it with. The Machine Room is a door twelve tiles away, and walking
 * to it is the first thing the introduction asks for.
 */
export const DEMO_ENTRY = '/app/grounds';
