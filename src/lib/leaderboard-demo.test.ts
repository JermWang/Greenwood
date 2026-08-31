// Demo accounts must not appear on the leaderboard.
//
// Found in production: the public leaderboard was returning `0xfacade00…`
// wallets in its top ranks. Every other aggregate over the users table already
// excludes demo accounts — solvency's liability, protocolOverview's balances —
// because that money is fiction nobody paid for and nobody can withdraw. The
// leaderboard read `SELECT wallet FROM users` with no filter and was simply
// missed.
//
// It is worst on the metric that most looks like proof of commitment:
// `total_burned` ranks players by what they destroyed, and a demo burns nothing
// real. So the exclusion is asserted per metric rather than once.
//
// Own data directory per run, matching solvency.test and settlement.test.
import { describe, test, expect, afterAll, beforeEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'osr-leaderboard-test-'));
process.env.OSR_DATA_DIR = DATA_DIR;
delete process.env.VERCEL;

const { leaderboard, protocolOverview, burnedBy, userOperation, mintNode } = await import('./game');
const { getDb } = await import('./db');
const { DEMO_PREFIX, isDemoWallet } = await import('./demo');

const real = (n: number) => `0x${String(n).padStart(40, '0')}`;
/**
 * Built from DEMO_PREFIX rather than typed out, for the reason solvency.test
 * gives: if the marker changes, this starts inserting ORDINARY wallets and the
 * test fails, instead of quietly asserting nothing.
 */
const demo = (n: number) => `${DEMO_PREFIX}${String(n).padStart(42 - DEMO_PREFIX.length, '0')}`;

function insert(w: string, compoundLevel: number, balance = 0) {
  getDb()
    .prepare(
      `INSERT OR REPLACE INTO users (wallet, osr_balance, compound_level, created_at, last_seen)
       VALUES (?,?,?,?,?)`
    )
    .run(w, balance, compoundLevel, Date.now(), Date.now());
}

function reset() {
  const db = getDb();
  db.exec('DELETE FROM nodes');
  db.exec('DELETE FROM ledger');
  db.exec('DELETE FROM users');
}

beforeEach(reset);

afterAll(() => {
  try {
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
  } catch {
    /* Windows holds the handle. */
  }
});

describe('leaderboard excludes demo accounts', () => {
  test('a demo account does not appear, on any metric', () => {
    insert(real(1), 3);
    insert(demo(1), 9);

    for (const metric of ['compound_level', 'total_produced', 'total_burned']) {
      const rows = leaderboard(metric);
      expect(rows.some((r) => isDemoWallet(r.wallet)), `demo ranked on ${metric}`).toBe(false);
      expect(rows.map((r) => r.wallet)).toContain(real(1));
    }
  });

  test('a demo account cannot outrank a real one by having a higher level', () => {
    // The ordering case specifically: the demo would sort FIRST on
    // compound_level, so a filter applied after the sort-and-slice would still
    // have let it take rank 1.
    insert(real(1), 2);
    insert(demo(1), 99);

    const rows = leaderboard('compound_level');
    expect(rows[0]?.wallet).toBe(real(1));
    expect(rows[0]?.rank).toBe(1);
  });

  test('ranks stay contiguous from 1 once demos are removed', () => {
    // A filter applied to the OUTPUT would leave gaps in `rank`, because rank
    // is assigned during the map. Excluding at the query keeps it dense.
    insert(demo(1), 50);
    insert(real(1), 3);
    insert(demo(2), 40);
    insert(real(2), 2);

    const rows = leaderboard('compound_level');
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.rank)).toEqual([1, 2]);
  });

  test('a board of only demo accounts is empty, not populated', () => {
    insert(demo(1), 5);
    insert(demo(2), 4);

    expect(leaderboard('compound_level')).toEqual([]);
  });
});

describe('activeOperators excludes demo accounts', () => {
  // The public "how many people are playing" number. A demo session costs
  // nothing to mint and needs no credential, so counting them let anyone with a
  // loop set this figure to whatever they liked — the same argument the comment
  // above the balances query already made, on the line it did not reach.
  test('counts real wallets only', () => {
    insert(real(1), 1);
    insert(real(2), 1);
    insert(demo(1), 1);
    insert(demo(2), 1);
    insert(demo(3), 1);

    expect(protocolOverview().activeOperators).toBe(2);
  });

  test('is zero when only demo accounts exist', () => {
    insert(demo(1), 1);
    expect(protocolOverview().activeOperators).toBe(0);
  });
});

describe('protocol totals count real money only', () => {
  function desk(w: string, family: 'oil' | 'mine') {
    getDb()
      .prepare(
        `INSERT INTO nodes (wallet, family, level, created_at, last_claim_at, accrued, accrued_updated_at)
         VALUES (?,?,1,?,?,0,?)`
      )
      .run(w, family, Date.now(), Date.now(), Date.now());
  }

  test('desk counts exclude demo-owned desks', () => {
    insert(real(1), 1);
    insert(demo(1), 1);
    desk(real(1), 'oil');
    desk(demo(1), 'oil');
    desk(demo(1), 'mine');

    const o = protocolOverview();
    expect(o.totalNodes).toBe(1);
    expect(o.totalEquityDesks).toBe(1);
    expect(o.totalTreasuryDesks).toBe(0);
  });

  /**
   * The forgeable headline. `burned` is a stored cumulative counter, and a demo
   * session needs no credential and costs nothing to open — so bumping it for
   * demo spends meant anyone with a loop could set the game's most quoted
   * number to anything. Asserted through the counter, not the ledger, because
   * the ledger row is still written for demos on purpose.
   */
  test('a demo spend does not move the protocol burn counter', () => {
    // A real wallet needs funding; a demo is granted DEMO_GREEN on creation,
    // which is the whole point — that money was never minted by anyone.
    insert(real(1), 1, 1_000_000);
    insert(demo(1), 1, 1_000_000);

    const before = protocolOverview().totalGreenBurned;
    mintNode(demo(1), 'equity_desk');
    expect(protocolOverview().totalGreenBurned).toBe(before);

    mintNode(real(1), 'equity_desk');
    expect(protocolOverview().totalGreenBurned).toBeGreaterThan(before);
  });
});

describe('lifetime burn is a real figure', () => {
  function burn(w: string, kind: string, amount: number) {
    getDb()
      .prepare('INSERT INTO ledger (wallet, kind, amount, created_at) VALUES (?,?,?,?)')
      .run(w, kind, -amount, Date.now());
  }

  test('burnedBy sums the burning kinds and ignores claims', () => {
    insert(real(1), 1);
    burn(real(1), 'mint_node', 1000);
    burn(real(1), 'crate_open', 250);
    // A claim is production, not burn, and must not be counted here.
    getDb()
      .prepare('INSERT INTO ledger (wallet, kind, amount, created_at) VALUES (?,?,?,?)')
      .run(real(1), 'claim', 5000, Date.now());

    expect(burnedBy(real(1))).toBe(1250);
  });

  /**
   * The regression that mattered: touch_profile was handed a hardcoded 0, so
   * the global leaderboard's `total_burned` metric ranked everybody at zero.
   * The projection can only be as good as what the operation hands it, so that
   * is what this pins.
   */
  test('userOperation carries the burn total for the profile projection', () => {
    insert(real(1), 1);
    burn(real(1), 'compound_upgrade', 700);

    expect(userOperation(real(1)).totalBurned).toBe(700);
  });

  test('the leaderboard reports the same burn the helper does', () => {
    insert(real(1), 1);
    burn(real(1), 'node_upgrade', 480);

    const row = leaderboard('total_burned').find((r) => r.wallet === real(1));
    expect(row?.totalBurned).toBe(burnedBy(real(1)));
    expect(row?.totalBurned).toBe(480);
  });
});
