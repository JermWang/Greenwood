// Is the treasury good for what the ledger promises, and a switch to stop if not.
//
// The structural risk of this design: the off-chain ledger is the mint
// authority. users.osr_balance and node accruals are numbers in SQLite, and
// claimRewards turns them into real ERC-20 transfers out of the treasury. So a
// bug anywhere in the game — a bad multiplier, a double-credit, an exploit —
// does not show up as a wrong number on a screen. It shows up as tokens
// leaving.
//
// Nothing was watching that. There was no way to ask "does the treasury still
// cover what we owe", and no way to stop paying if the answer was no. Those are
// the two things here.
//
// THE PAUSE IS NOT A DEPLOY. Shipping a build to stop a drain takes minutes you
// do not have, and doing it under pressure is how the fix becomes the second
// incident. This is a row in the protocol table, readable by every route
// handler, flippable by one authenticated request. Same shape as the existing
// deploy-notice window in lib/deploy-guard, deliberately — there is already one
// idea of "refuse politely for a reason", and a second one would be a second
// thing to remember.

import { getDb, getProtocolValue, setProtocolValue } from './db';
import { DEMO_WALLET_LIKE } from './demo';
import { GameError } from './game';

const PAUSE_KEY = 'payouts_paused';
const PAUSE_REASON_KEY = 'payouts_paused_reason';

/** Whether payouts are currently halted. */
export function payoutsPaused(): boolean {
  return getProtocolValue(PAUSE_KEY) === '1';
}

export function pauseReason(): string | null {
  return getProtocolValue(PAUSE_REASON_KEY);
}

export function setPayoutsPaused(paused: boolean, reason?: string) {
  setProtocolValue(PAUSE_KEY, paused ? '1' : '0');
  setProtocolValue(PAUSE_REASON_KEY, paused ? (reason ?? 'paused by an operator') : '');
}

/**
 * Refuse to pay out while paused.
 *
 * 503, and the reason is passed through verbatim. A player told "temporarily
 * unavailable" assumes it is broken and retries forever; one told what is
 * actually happening stops, and stops filing reports about it.
 *
 * Spends are deliberately NOT gated on this. Pausing payouts stops tokens
 * leaving the treasury; pausing spends would also stop them arriving, and if
 * the treasury is short then incoming payments are the thing that helps.
 */
export function requirePayoutsEnabled(): void {
  if (!payoutsPaused()) return;
  throw new GameError(
    `Payouts are paused: ${pauseReason() ?? 'under review'}. Your rewards are safe and still accruing.`,
    503
  );
}

export interface Solvency {
  /** Mirrored balances the game has promised. */
  balances: number;
  /** Accrued-but-unclaimed production across every desk. */
  pending: number;
  /** Everything the protocol would owe if every operator claimed right now. */
  liability: number;
  /** BNTY already sent out, per the settlements table. */
  paidOut: number;
  /** Recorded as owed after a payout failed, and never settled. */
  owed: number;
  /** Live treasury balance, or null when the token is not configured. */
  treasury: number | null;
  /** treasury - liability. Negative means the promises exceed the tokens. */
  surplus: number | null;
  /** True when the treasury cannot cover the liability. */
  insolvent: boolean;
  /**
   * Whether claims actually move tokens yet.
   *
   * Without this the report is easy to misread. Before settlement is
   * configured the game runs entirely on mirrored balances and nothing backs
   * them, so `insolvent` is true and completely expected — and in that state
   * `liability` is not an alarm, it is the amount of BNTY the treasury has to
   * be funded with before settlement is switched on. After launch the same
   * flag being true means something is wrong. Same number, opposite meaning,
   * so the report has to say which world it is in.
   */
  settlementLive: boolean;
  paused: boolean;
  pausedReason: string | null;
}

/**
 * Compare what is promised against what is held.
 *
 * `liability` is the worst case on purpose — every operator claiming at once —
 * because that is the number that has to be true. A treasury sized to the
 * average is a treasury that fails on the day everybody looks.
 *
 * Reads the treasury live rather than from a counter. A counter would be
 * derived from the same ledger it is meant to check, so the two could only ever
 * agree; the whole value is asking the chain independently.
 */
export async function solvency(
  readTreasury: () => Promise<number | null>,
  settlementLive = false
): Promise<Solvency> {
  const db = getDb();

  /*
   * DEMO ACCOUNTS ARE NOT A LIABILITY, and this is the query where that has
   * teeth.
   *
   * A demo address holds no key. It cannot sign, so it can never claim, so the
   * treasury will never be asked for one token of what these rows say. Counting
   * them would overstate what is owed — and `liability` below is what the payout
   * brake watches, so overstating it does not produce a wrong number on a
   * dashboard, it stops real operators being paid.
   *
   * That matters more than it used to. The demo cookie is not a credential
   * anybody has to earn, and a demo now starts with 50,000 fake BNTY (DEMO_BNTY)
   * rather than 1,000 — so without this, opening demo sessions in a loop is a
   * way for anyone to trip the brake from a browser.
   *
   * Both halves are excluded, because a demo builds desks and those desks
   * accrue: the balance they hold and the yield sitting in their desks are the
   * same fiction.
   */
  const balances =
    (
      db
        .prepare('SELECT COALESCE(SUM(osr_balance), 0) v FROM users WHERE wallet NOT LIKE ?')
        .get(DEMO_WALLET_LIKE) as { v: number }
    ).v ?? 0;
  const pending =
    (
      db
        .prepare('SELECT COALESCE(SUM(accrued), 0) v FROM nodes WHERE wallet NOT LIKE ?')
        .get(DEMO_WALLET_LIKE) as { v: number }
    ).v ?? 0;

  const paidOut =
    (
      db
        .prepare(
          `SELECT COALESCE(SUM(CAST(osr_amount AS REAL)), 0) v
             FROM settlements WHERE action = 'Claim' AND status = 'settled'`
        )
        .get() as { v: number }
    ).v ?? 0;

  const owed =
    (
      db
        .prepare(
          `SELECT COALESCE(SUM(CAST(osr_amount AS REAL)), 0) v
             FROM settlements WHERE action = 'Claim' AND status = 'owed'`
        )
        .get() as { v: number }
    ).v ?? 0;

  // Debts count toward the liability: they are payouts that were promised and
  // failed to send, so the tokens still have to exist.
  const liability = balances + pending + owed;

  let treasury: number | null = null;
  try {
    treasury = await readTreasury();
  } catch (error) {
    // A treasury that cannot be read is reported as unknown rather than as
    // zero. Zero would look exactly like a total drain and trigger the alarm
    // for what is usually an RPC hiccup.
    console.error('[solvency] could not read the treasury', error);
  }

  const surplus = treasury == null ? null : treasury - liability;

  return {
    balances,
    pending,
    liability,
    paidOut,
    owed,
    treasury,
    surplus,
    insolvent: surplus != null && surplus < 0,
    settlementLive,
    paused: payoutsPaused(),
    pausedReason: pauseReason() || null,
  };
}
