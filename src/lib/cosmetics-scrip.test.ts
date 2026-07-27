// Buying a look with Scrip.
//
// The Scrip path is deliberately not the BNTY path: it never touches settlement,
// it takes no fee, and it draws bound balance before bearer. Each of those is a
// decision that could be quietly undone by a refactor that "unified" the two
// currencies, so each is asserted here.
//
// Own SQLite file via OSR_DATA_DIR, matching cosmetics.test.ts, so this never
// touches the developer's data/ directory or another test's state.
import { describe, test, expect, beforeEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'gpu-cosmetics-scrip-test-'));
process.env.OSR_DATA_DIR = DATA_DIR;
delete process.env.VERCEL;

const { buyCosmetic, ownedCosmetics, cosmeticsCatalog, COSMETICS } = await import('./cosmetics');
const { grantScrip, scripBalances } = await import('./scrip');
const { getDb } = await import('./db');
const { getOrCreateUser } = await import('./game');

const WALLET = '0x00000000000000000000000000000000deadbee1';
/** A Scrip-priced piece and a paid-only one, taken from the catalogue itself. */
const EARNABLE = COSMETICS.find((c) => c.scrip != null)!;
const PAID_ONLY = COSMETICS.find((c) => c.scrip == null)!;

beforeEach(() => {
  const db = getDb();
  db.exec('DELETE FROM cosmetics_owned');
  db.exec('DELETE FROM cosmetics_equipped');
  db.exec('DELETE FROM users');
  getOrCreateUser(WALLET);
});

describe('buying with Scrip', () => {
  test('takes the Scrip price and grants the item', () => {
    grantScrip(WALLET, EARNABLE.scrip! * 2, 'test');
    const before = scripBalances(WALLET).total;

    buyCosmetic(WALLET, EARNABLE.key, 'SCRIP');

    expect(ownedCosmetics(WALLET)).toContain(EARNABLE.key);
    expect(scripBalances(WALLET).total).toBe(before - EARNABLE.scrip!);
  });

  test('spends bound Scrip before bearer, leaving the tradeable kind alone', () => {
    // The boundary that stops the quest faucet draining into the market. A
    // player holding both kinds should finish a purchase with their bearer
    // balance intact.
    grantScrip(WALLET, EARNABLE.scrip!, 'test');
    getDb()
      .prepare('UPDATE users SET scrip_bearer = ? WHERE wallet = ?')
      .run(5_000, WALLET);

    buyCosmetic(WALLET, EARNABLE.key, 'SCRIP');

    const after = scripBalances(WALLET);
    expect(after.bound).toBe(0);
    expect(after.bearer).toBe(5_000);
  });

  test('refuses when the wallet cannot afford it, and grants nothing', () => {
    grantScrip(WALLET, EARNABLE.scrip! - 1, 'test');
    expect(() => buyCosmetic(WALLET, EARNABLE.key, 'SCRIP')).toThrow();
    expect(ownedCosmetics(WALLET)).not.toContain(EARNABLE.key);
  });

  test('refuses Scrip for a piece that is not sold for Scrip', () => {
    grantScrip(WALLET, 1_000_000, 'test');
    expect(() => buyCosmetic(WALLET, PAID_ONLY.key, 'SCRIP')).toThrow(/not sold for Scrip/);
    expect(ownedCosmetics(WALLET)).not.toContain(PAID_ONLY.key);
  });

  test('never charges twice for the same piece', () => {
    grantScrip(WALLET, EARNABLE.scrip! * 3, 'test');
    buyCosmetic(WALLET, EARNABLE.key, 'SCRIP');
    const after = scripBalances(WALLET).total;
    expect(() => buyCosmetic(WALLET, EARNABLE.key, 'SCRIP')).toThrow(/already own/);
    expect(scripBalances(WALLET).total).toBe(after);
  });

  test('does not touch the BNTY balance', () => {
    // Scrip never entered token supply, so a Scrip purchase must move no BNTY
    // and burn none of it. If this starts failing, the two paths have been
    // merged and the sink is now taking token out of a player who never spent it.
    grantScrip(WALLET, EARNABLE.scrip!, 'test');
    const before = getOrCreateUser(WALLET).osr_balance;
    buyCosmetic(WALLET, EARNABLE.key, 'SCRIP');
    expect(getOrCreateUser(WALLET).osr_balance).toBe(before);
  });
});

describe('the catalogue payload the shop renders from', () => {
  test('reports the wallet\'s spendable Scrip', () => {
    grantScrip(WALLET, 7_777, 'test');
    expect(cosmeticsCatalog(WALLET).scrip).toBe(7_777);
  });

  test('reports zero Scrip for a visitor with no wallet', () => {
    expect(cosmeticsCatalog(null).scrip).toBe(0);
  });

  test('tells the shop which currencies each piece is sold for', () => {
    const items = cosmeticsCatalog(WALLET).items;
    const earnable = items.find((i) => i.key === EARNABLE.key)!;
    const paidOnly = items.find((i) => i.key === PAID_ONLY.key)!;

    // Scrip leads wherever it is offered, so the shop's primary button is the
    // earnable one rather than the token.
    expect(earnable.currencies[0]).toBe('SCRIP');
    expect(earnable.scrip).toBe(EARNABLE.scrip);

    expect(paidOnly.currencies).not.toContain('SCRIP');
    expect(paidOnly.scrip).toBeUndefined();
  });
});
