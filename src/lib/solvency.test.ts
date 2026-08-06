// Solvency accounting and the payout brake.
//
// Own data directory per run, matching settlement.test.
import { describe, test, expect, afterAll, beforeEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'osr-solvency-test-'));
process.env.OSR_DATA_DIR = DATA_DIR;
delete process.env.VERCEL;

const { solvency, payoutsPaused, setPayoutsPaused, requirePayoutsEnabled } = await import('./solvency');
const { getDb } = await import('./db');
const { GameError } = await import('./game');
const { DEMO_PREFIX } = await import('./demo');

const wallet = (n: number) => `0x${String(n).padStart(40, '0')}`;

function reset() {
  const db = getDb();
  db.exec('DELETE FROM settlements');
  db.exec('DELETE FROM nodes');
  db.exec('DELETE FROM users');
  setPayoutsPaused(false);
}

function operator(n: number, balance: number, accrued = 0) {
  const db = getDb();
  db.prepare('INSERT OR REPLACE INTO users (wallet, osr_balance, created_at, last_seen) VALUES (?,?,?,?)').run(
    wallet(n), balance, Date.now(), Date.now()
  );
  if (accrued > 0) {
    db.prepare(
      `INSERT INTO nodes (wallet, family, level, created_at, last_claim_at, accrued, accrued_updated_at)
       VALUES (?,'oil',1,?,?,?,?)`
    ).run(wallet(n), Date.now(), Date.now(), accrued, Date.now());
  }
}

/**
 * The same, on a demo address.
 *
 * Built from DEMO_PREFIX rather than a hand-typed literal, so a change to the
 * marker cannot leave this test quietly asserting nothing — it would start
 * inserting ordinary wallets and the exclusions would appear to have stopped
 * working, which is the correct direction for it to fail in.
 */
function demoOperator(n: number, balance: number, accrued = 0) {
  const db = getDb();
  const w = `${DEMO_PREFIX}${String(n).padStart(42 - DEMO_PREFIX.length, '0')}`;
  db.prepare('INSERT OR REPLACE INTO users (wallet, osr_balance, created_at, last_seen) VALUES (?,?,?,?)').run(
    w, balance, Date.now(), Date.now()
  );
  if (accrued > 0) {
    db.prepare(
      `INSERT INTO nodes (wallet, family, level, created_at, last_claim_at, accrued, accrued_updated_at)
       VALUES (?,'oil',1,?,?,?,?)`
    ).run(w, Date.now(), Date.now(), accrued, Date.now());
  }
}

function claimRow(n: number, amount: number, status: 'settled' | 'owed') {
  getDb()
    .prepare(
      `INSERT INTO settlements
         (nonce, wallet, action, detail, osr_amount, fee_wei, burn_bps, treasury_bps, deadline, status, created_at)
       VALUES (?,?,'Claim','claim',?,'0',0,0,0,?,?)`
    )
    .run(`n${Math.random()}`, wallet(n), String(amount), status, Date.now());
}

beforeEach(reset);

afterAll(() => {
  try {
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
  } catch {
    /* Windows holds the handle. */
  }
});

describe('what the protocol owes', () => {
  test('counts balances and unclaimed production together', async () => {
    operator(1, 500, 250);
    operator(2, 100);
    const s = await solvency(async () => 10_000);
    expect(s.balances).toBe(600);
    expect(s.pending).toBe(250);
    expect(s.liability).toBe(850);
  });

  /**
   * DEMO ACCOUNTS ARE NOT A LIABILITY.
   *
   * A demo address holds no key, so it can never claim and the treasury will
   * never be asked for a token of it. Counting demo rows would overstate what is
   * owed, and `liability` is what the payout brake watches — so the failure mode
   * is not a wrong number on a dashboard, it is real operators stopping being
   * paid.
   *
   * The amounts here are the real ones: a demo starts on DEMO_BNTY (50,000), the
   * cookie that mints one is not a credential anybody has to earn, and nothing
   * stops a person opening sessions in a loop. Two of them alone would swamp the
   * operator beside them.
   */
  test('ignores demo accounts, which can never claim', async () => {
    operator(1, 500, 250);
    demoOperator(1, 50_000, 4_000);
    demoOperator(2, 50_000);
    const s = await solvency(async () => 10_000);
    expect(s.balances).toBe(500);
    expect(s.pending).toBe(250);
    expect(s.liability).toBe(750);
  });

  test('and does not let them trip the brake', async () => {
    operator(1, 1_000);
    for (let i = 0; i < 20; i += 1) demoOperator(i, 50_000, 5_000);
    const s = await solvency(async () => 1_500);
    expect(s.insolvent).toBe(false);
    expect(s.surplus).toBe(500);
  });

  /**
   * A failed payout is still owed.
   *
   * The claim route records a debt when the transfer fails after the accrual is
   * already consumed. Those tokens have to exist, so leaving them out of the
   * liability would report a treasury as covering promises it does not cover.
   */
  test('includes debts from payouts that failed', async () => {
    operator(1, 100);
    claimRow(1, 400, 'owed');
    claimRow(1, 999, 'settled'); // already sent; not a liability
    const s = await solvency(async () => 10_000);
    expect(s.owed).toBe(400);
    expect(s.paidOut).toBe(999);
    expect(s.liability).toBe(500);
  });

  test('reports the surplus against the live treasury', async () => {
    operator(1, 1000);
    const s = await solvency(async () => 1500);
    expect(s.surplus).toBe(500);
    expect(s.insolvent).toBe(false);
  });

  test('flags insolvency when promises exceed the treasury', async () => {
    operator(1, 5000);
    const s = await solvency(async () => 1000);
    expect(s.surplus).toBe(-4000);
    expect(s.insolvent).toBe(true);
  });

  /**
   * An unreadable treasury is unknown, never zero.
   *
   * Zero looks exactly like a total drain. Treating an RPC hiccup as one would
   * fire the alarm constantly and teach whoever is on call to ignore it.
   */
  test('reports an unreadable treasury as unknown rather than empty', async () => {
    operator(1, 1000);
    const s = await solvency(async () => {
      throw new Error('rpc down');
    });
    expect(s.treasury).toBeNull();
    expect(s.surplus).toBeNull();
    expect(s.insolvent).toBe(false);
  });

  test('reports an unconfigured token as unknown too', async () => {
    operator(1, 1000);
    const s = await solvency(async () => null);
    expect(s.treasury).toBeNull();
    expect(s.insolvent).toBe(false);
  });

  test('an empty game is solvent, not broken', async () => {
    const s = await solvency(async () => 0);
    expect(s.liability).toBe(0);
    expect(s.insolvent).toBe(false);
  });
});

describe('the payout brake', () => {
  test('is off by default', () => {
    expect(payoutsPaused()).toBe(false);
    expect(() => requirePayoutsEnabled()).not.toThrow();
  });

  test('refuses with a 503 and the operator-supplied reason', () => {
    setPayoutsPaused(true, 'investigating a discrepancy');
    expect(payoutsPaused()).toBe(true);
    try {
      requirePayoutsEnabled();
      throw new Error('should have refused');
    } catch (error) {
      expect(error).toBeInstanceOf(GameError);
      expect((error as InstanceType<typeof GameError>).status).toBe(503);
      expect((error as Error).message).toContain('investigating a discrepancy');
    }
  });

  /**
   * A paused protocol must not read as a lost balance. Players who think their
   * rewards vanished behave very differently from players told to come back.
   */
  test('tells the player their rewards are safe', () => {
    setPayoutsPaused(true);
    expect(() => requirePayoutsEnabled()).toThrow(/still accruing/i);
  });

  test('resumes cleanly', () => {
    setPayoutsPaused(true, 'nope');
    setPayoutsPaused(false);
    expect(payoutsPaused()).toBe(false);
    expect(() => requirePayoutsEnabled()).not.toThrow();
  });

  test('survives a fresh read, so every route bundle sees the same answer', async () => {
    setPayoutsPaused(true, 'persisted');
    const s = await solvency(async () => 0);
    expect(s.paused).toBe(true);
    expect(s.pausedReason).toBe('persisted');
  });
});
