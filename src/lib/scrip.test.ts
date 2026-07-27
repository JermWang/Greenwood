// Scrip coverage, focused on the one property the whole design rests on:
// earned Scrip must never become BNTY. Everything else here is bookkeeping;
// that boundary is the economics.
import { describe, test, expect, beforeEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'gpu-scrip-test-'));
process.env.OSR_DATA_DIR = DATA_DIR;
delete process.env.VERCEL;

const {
  scripBalances,
  grantScrip,
  buyScrip,
  spendScrip,
  transferBearerScrip,
  SCRIP_PER_BNTY,
  MIN_SCRIP_PURCHASE_BNTY,
} = await import('./scrip');
const { getOrCreateUser } = await import('./game');
const { getDb, setProtocolValue, getProtocolValue } = await import('./db');

const wallet = (n: number) => `0x${String(n).padStart(40, '0')}`;
const fund = (w: string, amount: number) => {
  getOrCreateUser(w);
  getDb().prepare('UPDATE users SET osr_balance = ? WHERE wallet = ?').run(amount, w);
};
const bnty = (w: string) =>
  (getDb().prepare('SELECT osr_balance AS b FROM users WHERE wallet = ?').get(w) as { b: number }).b;
const counter = (key: string) => Number(getProtocolValue(key) ?? '0');

beforeEach(() => {
  const db = getDb();
  db.exec('DELETE FROM users');
  db.exec('DELETE FROM ledger');
  for (const key of ['burned', 'reserve', 'treasury']) setProtocolValue(key, '0');
});

describe('the faucet', () => {
  test('earned Scrip lands as bound, never bearer', () => {
    const w = wallet(1);
    grantScrip(w, 250, 'daily');
    expect(scripBalances(w)).toEqual({ bound: 250, bearer: 0, total: 250 });
  });

  test('an unknown wallet reads as empty rather than being created', () => {
    const w = wallet(2);
    expect(scripBalances(w).total).toBe(0);
    const rows = (
      getDb().prepare('SELECT COUNT(*) AS n FROM users WHERE wallet = ?').get(w) as { n: number }
    ).n;
    expect(rows).toBe(0);
  });

  test('refuses to pay out nothing', () => {
    const w = wallet(3);
    expect(grantScrip(w, 0, 'noop')).toBe(0);
    expect(grantScrip(w, -50, 'noop')).toBe(0);
    expect(scripBalances(w).total).toBe(0);
  });
});

describe('buying from the protocol', () => {
  test('charges BNTY, mints bearer Scrip, and splits the house cut', () => {
    const w = wallet(4);
    fund(w, 50_000);

    const result = buyScrip(w, 10_000);

    expect(bnty(w)).toBe(40_000);
    expect(scripBalances(w)).toEqual({
      bound: 0,
      bearer: 10_000 * SCRIP_PER_BNTY,
      total: 10_000 * SCRIP_PER_BNTY,
    });
    // Same policy as every other transaction: 2%, split in half.
    expect(result.fee).toBeCloseTo(200, 10);
    expect(counter('burned')).toBeCloseTo(100, 10);
    expect(counter('reserve')).toBeCloseTo(100, 10);
    expect(counter('burned') + counter('reserve')).toBeCloseTo(result.fee, 10);
    expect(counter('treasury')).toBeCloseTo(9_800, 10);
  });

  test('refuses a purchase the balance cannot cover, and charges nothing', () => {
    const w = wallet(5);
    fund(w, 500);
    expect(() => buyScrip(w, 10_000)).toThrow(/Not enough BNTY/);
    expect(bnty(w)).toBe(500);
    expect(scripBalances(w).total).toBe(0);
    expect(counter('burned')).toBe(0);
  });

  test('enforces a minimum so the ledger does not fill with dust', () => {
    const w = wallet(6);
    fund(w, 50_000);
    expect(() => buyScrip(w, MIN_SCRIP_PURCHASE_BNTY - 1)).toThrow(/Minimum purchase/);
    expect(bnty(w)).toBe(50_000);
  });

  test('skips the debit when the purchase already settled on-chain', () => {
    const w = wallet(7);
    fund(w, 50_000);
    buyScrip(w, 10_000, { settledOnChain: true });
    expect(bnty(w)).toBe(50_000);
    expect(scripBalances(w).bearer).toBe(10_000 * SCRIP_PER_BNTY);
  });
});

describe('spending', () => {
  test('burns bound before bearer, so the tradeable kind survives', () => {
    const w = wallet(8);
    fund(w, 50_000);
    grantScrip(w, 300, 'daily');
    buyScrip(w, 1_000);

    const result = spendScrip(w, 500, 'cosmetic');

    expect(result.fromBound).toBe(300);
    expect(result.fromBearer).toBe(200);
    expect(scripBalances(w)).toEqual({ bound: 0, bearer: 800, total: 800 });
  });

  test('refuses to overdraw across both kinds, and takes nothing', () => {
    const w = wallet(9);
    grantScrip(w, 100, 'daily');
    expect(() => spendScrip(w, 500, 'cosmetic')).toThrow(/Not enough Scrip/);
    expect(scripBalances(w)).toEqual({ bound: 100, bearer: 0, total: 100 });
  });
});

describe('the boundary that matters', () => {
  test('earned Scrip cannot be transferred to another wallet', () => {
    // The whole design rests on this: if bound Scrip could move, a player could
    // farm dailies, sell the proceeds, and turn quests into an emission tap.
    const seller = wallet(10);
    const buyer = wallet(11);
    grantScrip(seller, 5_000, 'daily');

    expect(() => transferBearerScrip(seller, buyer, 1_000)).toThrow(/earned Scrip cannot be sold/);
    expect(scripBalances(seller).bound).toBe(5_000);
    expect(scripBalances(buyer).total).toBe(0);
  });

  test('bought Scrip transfers, and only up to the bearer balance', () => {
    const seller = wallet(12);
    const buyer = wallet(13);
    fund(seller, 50_000);
    grantScrip(seller, 5_000, 'daily');
    buyScrip(seller, 2_000);

    transferBearerScrip(seller, buyer, 1_500);
    expect(scripBalances(seller)).toEqual({ bound: 5_000, bearer: 500, total: 5_500 });
    expect(scripBalances(buyer)).toEqual({ bound: 0, bearer: 1_500, total: 1_500 });

    // The 5,000 bound sitting in the seller's wallet must not backstop this.
    expect(() => transferBearerScrip(seller, buyer, 501)).toThrow(/earned Scrip cannot be sold/);
    expect(scripBalances(seller).bearer).toBe(500);
  });

  test('a transfer moves Scrip without creating or destroying any', () => {
    const seller = wallet(14);
    const buyer = wallet(15);
    fund(seller, 50_000);
    buyScrip(seller, 3_000);
    const before = scripBalances(seller).total + scripBalances(buyer).total;

    transferBearerScrip(seller, buyer, 1_200);

    expect(scripBalances(seller).total + scripBalances(buyer).total).toBeCloseTo(before, 10);
  });

  test('the protocol offers no way to sell Scrip back for BNTY', async () => {
    // Guards the absence, not a behaviour. Adding a redemption endpoint later
    // would silently reopen the faucet, and this is the test that would fail.
    const module = await import('./scrip');
    const exported = Object.keys(module);
    expect(exported.some((name) => /sell|redeem|cashOut/i.test(name))).toBe(false);
  });
});
