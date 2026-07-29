// Who gets free BNTY, and who must not.
//
// The grant exists so a fresh operator can afford their first desk out of the
// MIRRORED balance, which is only how the game works while spends settle
// off-chain: in the demo, and before the token exists.
//
// Once the token is live a spend is a real ERC-20 transfer and the route passes
// settledOnChain, so osr_balance is neither debited by spends nor credited by
// claims. Free BNTY there is a number on the screen that cannot buy anything
// and cannot be withdrawn.
//
// TOKEN_LIVE is read at module load from the environment, so each case needs
// its own module registry — vitest.resetModules plus a re-import, with the env
// set before the import rather than after.
import { describe, test, expect, afterAll, beforeEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

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
  test('a real wallet is granted its first desk', async () => {
    const { game, economy } = await engineWith(false);
    const user = game.getOrCreateUser(fresh(REAL));
    expect(user.osr_balance).toBe(economy.STARTER_BNTY_GRANT);
  });

  test('the grant covers a desk, which is the only reason it exists', async () => {
    const { economy } = await engineWith(false);
    const cheapest = Math.min(...economy.NODE_FAMILIES.map((f) => f.burnCostBnty));
    expect(economy.STARTER_BNTY_GRANT).toBeGreaterThanOrEqual(cheapest);
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
    const { game, economy } = await engineWith(true);
    const user = game.getOrCreateUser(fresh(DEMO));
    expect(user.osr_balance).toBe(economy.STARTER_BNTY_GRANT);
  });
});

describe('regardless of network', () => {
  test('a wallet is granted at most once', async () => {
    const { game, economy } = await engineWith(false);
    const w = fresh(REAL);
    game.getOrCreateUser(w);
    const second = game.getOrCreateUser(w);
    expect(second.osr_balance).toBe(economy.STARTER_BNTY_GRANT);
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
