// Who gets free GREEN, and who must not.
//
// THE DEMO, AND NOBODY ELSE. A real wallet is granted nothing, whether or not a
// token is configured.
//
// It used to depend on TOKEN_LIVE: free GREEN while no token existed, on the
// reasoning that a mirrored balance buys nothing real. A RELAUNCH breaks that
// reasoning. Between clearing the old token address and configuring the new
// one the game is unconfigured but not worthless — balances earned in that
// window are what the new token pays out against — so a grant there mints real
// money one address at a time, and nothing limits the number of addresses.
//
// A demo account is the exception because it can never sign, never settles
// on-chain, and its balance can never leave the demo.
//
// TOKEN_LIVE is read at module load from the environment, so each case needs
// its own module registry — vitest.resetModules plus a re-import, with the env
// set before the import rather than after.
import { describe, test, expect, afterAll, beforeEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
// Safe to import statically: lib/demo reads no environment, so it is the same
// module whether the engine around it was loaded with the token live or not.
import { DEMO_GREEN } from './demo';

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'osr-grant-test-'));
process.env.OSR_DATA_DIR = DATA_DIR;
delete process.env.VERCEL;

const REAL = `0x${'1'.repeat(40)}`;
const DEMO = `0xfacade00${'2'.repeat(32)}`;

/** Load a fresh copy of the engine with the token configured or not. */
async function engineWith(tokenLive: boolean) {
  vi.resetModules();
  if (tokenLive) {
    process.env.NEXT_PUBLIC_OSR_TOKEN = `0x${'a'.repeat(40)}`;
    process.env.NEXT_PUBLIC_OSR_TREASURY_WALLET = `0x${'b'.repeat(40)}`;
  } else {
    delete process.env.NEXT_PUBLIC_OSR_TOKEN;
    delete process.env.NEXT_PUBLIC_OSR_TREASURY_WALLET;
  }
  const config = await import('./config');
  expect(config.TOKEN_LIVE, 'test setup: TOKEN_LIVE did not take').toBe(tokenLive);
  const game = await import('./game');
  const economy = await import('./economy');
  const db = await import('./db');
  return { game, economy, db };
}

/** Unique address per case, so no test is answered by another's row. */
let seq = 0;
const fresh = (base: string) => {
  seq += 1;
  const tag = seq.toString(16).padStart(4, '0');
  return base.slice(0, base.length - 4) + tag;
};

beforeEach(() => {
  seq += 100;
});

afterAll(() => {
  delete process.env.NEXT_PUBLIC_OSR_TOKEN;
  delete process.env.NEXT_PUBLIC_OSR_TREASURY_WALLET;
  try {
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
  } catch {
    /* Windows holds the handle. */
  }
});

describe('before the token exists', () => {
  /*
   * The case that changed, and the one a relaunch actually lands in: no token
   * configured, and still no free money. This window is where every wallet
   * looks new, because the wipe just made them all new.
   */
  test('a real wallet starts empty even with no token configured', async () => {
    const { game } = await engineWith(false);
    const user = game.getOrCreateUser(fresh(REAL));
    expect(user.osr_balance).toBe(0);
  });

  test('and no starter_grant is written for it', async () => {
    const { game, db } = await engineWith(false);
    const w = fresh(REAL);
    game.getOrCreateUser(w);
    const rows = db
      .getDb()
      .prepare("SELECT COUNT(*) n FROM ledger WHERE wallet = ? AND kind = 'starter_grant'")
      .get(w) as { n: number };
    expect(rows.n).toBe(0);
  });

  test('the demo is still funded here too', async () => {
    const { game } = await engineWith(false);
    const user = game.getOrCreateUser(fresh(DEMO));
    expect(user.osr_balance).toBe(DEMO_GREEN);
  });
});

describe('once the token is live', () => {
  /**
   * The change. Spends are real transfers now, so a mirrored balance buys
   * nothing — handing out 1,000 would be a number that lies to the player.
   */
  test('a real wallet starts empty', async () => {
    const { game } = await engineWith(true);
    const user = game.getOrCreateUser(fresh(REAL));
    expect(user.osr_balance).toBe(0);
  });

  test('and is still marked dripped, so it is not re-examined forever', async () => {
    const { game } = await engineWith(true);
    const user = game.getOrCreateUser(fresh(REAL));
    expect(user.dripped).toBe(1);
  });

  test('no starter_grant ledger entry is written for it', async () => {
    const { game, db } = await engineWith(true);
    const w = fresh(REAL);
    game.getOrCreateUser(w);
    const rows = db
      .getDb()
      .prepare("SELECT COUNT(*) n FROM ledger WHERE wallet = ? AND kind = 'starter_grant'")
      .get(w) as { n: number };
    expect(rows.n).toBe(0);
  });

  /**
   * The demo is the exception and the reason the rule is a function rather than
   * a flag: a demo account can never sign, so its mirrored balance is the only
   * money it will ever have. Killing the grant here would leave the demo
   * unplayable — which is the whole shop window.
   */
  test('a demo wallet is still granted, because it can never settle on-chain', async () => {
    const { game } = await engineWith(true);
    const user = game.getOrCreateUser(fresh(DEMO));
    expect(user.osr_balance).toBe(DEMO_GREEN);
  });
});

/**
 * The demo gets a DIFFERENT figure, not a bigger accident.
 *
 * A real wallet is granted enough to START — one desk, then earn the rest. A
 * demo has ten minutes and no way to earn anything, so it is granted enough to
 * SEE. These assert the second one actually reaches the mechanics the
 * introduction walks a player through, because the previous grant did not: at
 * 1,000 GREEN the chain died on step three, where opening an allocation costs
 * ten times the entire grant.
 */
describe('the demo grant', () => {
  test('covers the whole introduction, not just the first desk', async () => {
    const { economy } = await engineWith(false);
    // Levelling is priced in lib/capital, not lib/economy — the cost curve
    // belongs with the shared-capital rule it exists to express.
    const capital = await import('./capital');
    const firstDesk = Math.min(...economy.NODE_FAMILIES.map((f) => f.burnCostGreen));
    const walkthrough =
      firstDesk +
      economy.CRATE_OPEN_GREEN + // open an allocation
      capital.nodeUpgradeCost(1) + // take a desk to L2
      economy.STAKE_MIN_GREEN; // open a Fixed Income Note
    expect(DEMO_GREEN).toBeGreaterThan(walkthrough);
  });

  test('leaves room to do it more than once, which is what makes it a demo', async () => {
    const { economy } = await engineWith(false);
    // Three allocations is the floor for understanding where instruments come
    // from: one is an event, three is a mechanic.
    expect(DEMO_GREEN).toBeGreaterThanOrEqual(economy.CRATE_OPEN_GREEN * 3);
  });

  /**
   * The arithmetic above is a claim about constants. This drives the engine.
   *
   * Run against a LIVE token deliberately, because that is the shape of the
   * deployment where a demo is the only account whose spends still come out of
   * the mirrored balance — everybody else's are real transfers. If demo spending
   * is going to break anywhere, it breaks here.
   */
  test('a demo can actually build and level a desk out of it', async () => {
    const { game } = await engineWith(true);
    const w = fresh(DEMO);
    game.getOrCreateUser(w);

    const node = game.mintNode(w, 'equity_desk');
    expect(game.readUser(w).osr_balance).toBeGreaterThan(0);

    game.upgradeNode(w, node.node.id);
    const after = game.readUser(w);
    expect(after.osr_balance).toBeGreaterThan(0);
    // And still enough left for the step that used to be the wall.
    const { CRATE_OPEN_GREEN } = await import('./economy');
    expect(after.osr_balance).toBeGreaterThan(CRATE_OPEN_GREEN);
  });

  test('is still small enough that currency does not read as free', async () => {
    const { economy } = await engineWith(false);
    // Well under the cost of maxing the portfolio, so the demo shows the game
    // rather than skipping it.
    const maxedPortfolio = Object.values(economy.COMPOUND_LEVELS).reduce(
      (sum, level) => sum + level.greenUpgradeCost,
      0
    );
    expect(DEMO_GREEN).toBeLessThan(maxedPortfolio);
  });
});

describe('regardless of network', () => {
  test('a repeated read never credits a real wallet', async () => {
    const { game } = await engineWith(false);
    const w = fresh(REAL);
    game.getOrCreateUser(w);
    const second = game.getOrCreateUser(w);
    expect(second.osr_balance).toBe(0);
  });

  /*
   * The demo grant is still once-only. It is the only grant left, so it is the
   * only place the "credited exactly once" rule can still be got wrong.
   */
  test('a demo wallet is credited exactly once', async () => {
    const { game } = await engineWith(false);
    const w = fresh(DEMO);
    game.getOrCreateUser(w);
    const second = game.getOrCreateUser(w);
    expect(second.osr_balance).toBe(DEMO_GREEN);
  });

  /**
   * Reads must not mint. getOrCreateUser inserts and credits, so an
   * unauthenticated GET over random addresses would otherwise both fill the
   * disk and inflate reported supply.
   */
  test('reading an unknown wallet grants nothing', async () => {
    const { game } = await engineWith(false);
    const user = game.readUser(fresh(REAL));
    expect(user.osr_balance).toBe(0);
    expect(user.dripped).toBe(0);
  });
});
