import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.OSR_DATA_DIR = mkdtempSync(join(tmpdir(), 'osr-market-'));

const { getDb } = await import('./db');
const { setOsrUsdPrice } = await import('./price');
const { crateCostOsr, CRATE_OPEN_OSR, CRATES_FOUND_PER_DAY, CRATE_WALLET_DAILY_CAP } =
  await import('./economy');
const { rollCrateDrops, unopenedCrates, unseenCrates, markCratesSeen, networkCratesRemaining } =
  await import('./crates');
const { createListing, cancelListing, transferSoldItem, openListings, splitSale } =
  await import('./market');
const { getOrCreateUser, openCrate, mintNode, GameError } = await import('./game');

const A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

function credit(wallet: string, amount: number) {
  getOrCreateUser(wallet);
  getDb().prepare('UPDATE users SET osr_balance = ? WHERE wallet = ?').run(amount, wallet);
}

/** Drop a crate straight into inventory, bypassing the RNG. */
function giveCrate(wallet: string, type: 'rig_crate' | 'shaft_crate' = 'rig_crate'): number {
  const row = getDb()
    .prepare('INSERT INTO crates (wallet, crate_type, found_at) VALUES (?,?,?)')
    .run(wallet, type, Date.now());
  return Number(row.lastInsertRowid);
}

beforeEach(() => {
  const db = getDb();
  db.exec('DELETE FROM listings; DELETE FROM crates; DELETE FROM components; DELETE FROM nodes;');
  db.exec("DELETE FROM protocol WHERE key LIKE 'crates_found_day_%'");
  setOsrUsdPrice(0.001); // $0.001/GPU -> a $5 crate costs 5,000 GPU
});

afterAll(() => vi.restoreAllMocks());

describe('crate pricing', () => {
  it('charges the flat GPU price', () => {
    expect(crateCostOsr(0.001)).toBe(CRATE_OPEN_OSR);
  });

  it('still prices a crate when no token price is known', () => {
    // The flat price must never leave crates unopenable because a feed lapsed.
    expect(crateCostOsr(null)).toBe(CRATE_OPEN_OSR);
    expect(crateCostOsr(0)).toBe(CRATE_OPEN_OSR);
  });
});

describe('crates cannot be bought', () => {
  it('refuses to open a crate the wallet does not hold', () => {
    credit(A, 1e9);
    expect(() => openCrate(A, 999999, null)).toThrow(/not found/i);
  });

  it('refuses to open the same crate twice', () => {
    credit(A, 1e9);
    const id = giveCrate(A);
    openCrate(A, id, null);
    // The second attempt is the abuse case: one mined crate, two payouts.
    expect(() => openCrate(A, id, null)).toThrow(/already been opened/i);
  });

  it('refuses to open another wallet’s crate', () => {
    credit(A, 1e9);
    credit(B, 1e9);
    const id = giveCrate(B);
    expect(() => openCrate(A, id, null)).toThrow(/not found/i);
  });

  it('refuses to open a crate that is listed for sale', () => {
    credit(A, 1e9);
    const id = giveCrate(A);
    createListing(A, 'crate', id, 100);
    // Otherwise a seller could open a crate while a buyer is paying for it.
    expect(() => openCrate(A, id, null)).toThrow(/listed for sale/i);
  });
});

describe('crate mining budget', () => {
  it('never exceeds the network daily budget', () => {
    credit(A, 1e9);
    const node = mintNode(A, 'oil_rig').node;
    const dayAgo = Date.now() - 86_400_000;
    // A wallet with 100% GP share, rolled repeatedly over a full day each time.
    for (let i = 0; i < 200; i++) {
      getDb().prepare('UPDATE nodes SET crate_rolled_at = ? WHERE wallet = ?').run(dayAgo, A);
      rollCrateDrops(A, [{ id: node.id, family: 'oil', crateRolledAt: dayAgo }], 1);
    }
    const found = unopenedCrates(A).length;
    expect(found).toBeLessThanOrEqual(CRATE_WALLET_DAILY_CAP);
    expect(networkCratesRemaining()).toBeGreaterThanOrEqual(
      CRATES_FOUND_PER_DAY - CRATE_WALLET_DAILY_CAP
    );
  });

  it('drops nothing for a wallet with no grow-power share', () => {
    credit(A, 1e9);
    const node = mintNode(A, 'oil_rig').node;
    const dayAgo = Date.now() - 86_400_000;
    for (let i = 0; i < 50; i++) {
      rollCrateDrops(A, [{ id: node.id, family: 'oil', crateRolledAt: dayAgo }], 0);
    }
    expect(unopenedCrates(A)).toHaveLength(0);
  });
});

describe('crate notifications', () => {
  it('reports unseen crates until acknowledged', () => {
    giveCrate(A);
    giveCrate(A);
    expect(unseenCrates(A)).toHaveLength(2);
    markCratesSeen(A);
    expect(unseenCrates(A)).toHaveLength(0);
    // Acknowledging must not consume the crates themselves.
    expect(unopenedCrates(A)).toHaveLength(2);
  });
});

describe('marketplace', () => {
  it('takes its fee from the sale price', () => {
    const { fee, toSeller } = splitSale(1000);
    expect(fee + toSeller).toBe(1000);
    expect(fee).toBeGreaterThan(0);
  });

  it('moves the item to the buyer and closes the listing', () => {
    const id = giveCrate(A);
    const listing = createListing(A, 'crate', id, 500);
    transferSoldItem(listing.id, B);
    expect(unopenedCrates(A)).toHaveLength(0);
    expect(unopenedCrates(B)).toHaveLength(1);
    expect(openListings()).toHaveLength(0);
  });

  it('refuses a second sale of the same listing', () => {
    const id = giveCrate(A);
    const listing = createListing(A, 'crate', id, 500);
    transferSoldItem(listing.id, B);
    // Two buyers paying concurrently must not both receive the item.
    expect(() => transferSoldItem(listing.id, B)).toThrow(/no longer available/i);
  });

  it('refuses to list the same crate twice', () => {
    const id = giveCrate(A);
    createListing(A, 'crate', id, 500);
    expect(() => createListing(A, 'crate', id, 900)).toThrow(/already listed/i);
  });

  it('refuses to list an item the wallet does not own', () => {
    const id = giveCrate(B);
    expect(() => createListing(A, 'crate', id, 500)).toThrow(/not found/i);
  });

  it('refuses to buy your own listing', () => {
    const id = giveCrate(A);
    const listing = createListing(A, 'crate', id, 500);
    expect(() => transferSoldItem(listing.id, A)).toThrow(/your own/i);
  });

  it('frees the crate again when a listing is cancelled', () => {
    credit(A, 1e9);
    const id = giveCrate(A);
    const listing = createListing(A, 'crate', id, 500);
    cancelListing(A, listing.id);
    expect(openListings()).toHaveLength(0);
    // Cancelling must make it openable again, not strand it.
    expect(() => openCrate(A, id, null)).not.toThrow();
  });

  it('refuses to cancel someone else’s listing', () => {
    const id = giveCrate(A);
    const listing = createListing(A, 'crate', id, 500);
    expect(() => cancelListing(B, listing.id)).toThrow(/not your listing/i);
  });

  it('rejects a non-positive price', () => {
    const id = giveCrate(A);
    expect(() => createListing(A, 'crate', id, 0)).toThrow(GameError);
    expect(() => createListing(A, 'crate', id, -5)).toThrow(GameError);
  });

  it('sells a node together with the components bolted to it', () => {
    credit(A, 1e9);
    const node = mintNode(A, 'oil_rig').node;
    const crateId = giveCrate(A);
    const opened = openCrate(A, crateId, node.id);
    getDb()
      .prepare('UPDATE components SET equipped_node_id = ? WHERE id = ?')
      .run(node.id, opened.inventoryItemId);

    const listing = createListing(A, 'node', node.id, 10_000);
    transferSoldItem(listing.id, B);

    const comp = getDb()
      .prepare('SELECT wallet FROM components WHERE id = ?')
      .get(opened.inventoryItemId) as { wallet: string };
    // The gear must follow the node, or the seller keeps parts of what they sold.
    expect(comp.wallet).toBe(B);
  });
});
