// Ownership integrity across marketplace transfers.
//
// The game ledger is this database, so a sale is not a token transfer that some
// chain reconciles for us — it is a row update we have to get exactly right. The
// invariant every test here defends is the same one: AT MOST ONE WALLET OWNS AN
// ITEM, AND EVERY REFERENCE TO IT AGREES. An item that ends up owned twice is
// minted value; one that ends up owned by nobody is destroyed value; one whose
// equipped or placed state disagrees with its owner pays yield to the wrong
// person.
import { describe, test, expect, beforeEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'eg-ownership-test-'));
process.env.OSR_DATA_DIR = DATA_DIR;
delete process.env.VERCEL;

const { createListing, cancelListing, transferSoldItem, isListed } = await import('./market');
const { getOrCreateUser, equipComponent } = await import('./game');
const { buyCosmetic, equipCosmetic, upgradeCosmetic, ownedCosmetics, equippedCosmetics } =
  await import('./cosmetics');
const { getLayout, saveLayout } = await import('./floor');
const { getDb } = await import('./db');

const wallet = (n: number) => `0x${String(n).padStart(40, '0')}`;

function fund(w: string, amount = 5_000_000) {
  getOrCreateUser(w);
  getDb().prepare('UPDATE users SET osr_balance = ? WHERE wallet = ?').run(amount, w);
  return w;
}

function makeNode(w: string, family: 'oil' | 'mine' = 'oil'): number {
  const now = Date.now();
  const result = getDb()
    .prepare(
      `INSERT INTO nodes (wallet, family, level, created_at, last_claim_at, accrued, accrued_updated_at)
       VALUES (?,?,1,?,?,0,?)`
    )
    .run(w, family, now, now, now);
  return Number(result.lastInsertRowid);
}

function makeComponent(w: string, family: 'oil' | 'mine' = 'oil', slot = 'drill'): number {
  const result = getDb()
    .prepare(
      `INSERT INTO components (wallet, slot, family, rarity, acquired_at)
       VALUES (?,?,?,'common',?)`
    )
    .run(w, slot, family, Date.now());
  return Number(result.lastInsertRowid);
}

/** Who the database thinks owns each kind of thing. */
const nodeOwner = (id: number) =>
  (getDb().prepare('SELECT wallet FROM nodes WHERE id = ?').get(id) as { wallet: string }).wallet;
const componentOwner = (id: number) =>
  (getDb().prepare('SELECT wallet FROM components WHERE id = ?').get(id) as { wallet: string }).wallet;
const componentNode = (id: number) =>
  (getDb().prepare('SELECT equipped_node_id AS n FROM components WHERE id = ?').get(id) as {
    n: number | null;
  }).n;
const cosmeticRow = (id: number) =>
  getDb().prepare('SELECT wallet, cosmetic_key, upgrade_level FROM cosmetics_owned WHERE id = ?').get(id) as
    | { wallet: string; cosmetic_key: string; upgrade_level: number }
    | undefined;

beforeEach(() => {
  const db = getDb();
  for (const table of [
    'listings', 'components', 'nodes', 'crates', 'floor_layouts',
    'cosmetics_equipped', 'cosmetics_owned', 'xp_tracks', 'daily_quests', 'ledger', 'users',
  ]) {
    db.exec(`DELETE FROM ${table}`);
  }
});

describe('an open listing is a lock', () => {
  test('a listed instrument cannot be fitted to a desk', () => {
    const seller = fund(wallet(1));
    const node = makeNode(seller);
    const comp = makeComponent(seller);
    createListing(seller, 'component', comp, 500);

    // Without this the desk sale below would carry the instrument to one wallet
    // while the listing still stood for another — the same item sold twice.
    expect(() => equipComponent(seller, comp, node)).toThrow(/listed on the Exchange/);
    expect(componentNode(comp)).toBeNull();
  });

  test('a desk cannot be listed while one of its instruments is listed', () => {
    const seller = fund(wallet(2));
    const node = makeNode(seller);
    const comp = makeComponent(seller);
    equipComponent(seller, comp, node);
    // Unequip is required to list a component, so reach past the API to build
    // the state a legacy row could still be in.
    getDb().prepare('UPDATE components SET equipped_node_id = NULL WHERE id = ?').run(comp);
    createListing(seller, 'component', comp, 500);
    getDb().prepare('UPDATE components SET equipped_node_id = ? WHERE id = ?').run(node, comp);

    expect(() => createListing(seller, 'node', node, 9_000)).toThrow(/listed separately/);
  });

  test('an equipped instrument cannot be listed', () => {
    const seller = fund(wallet(3));
    const node = makeNode(seller);
    const comp = makeComponent(seller);
    equipComponent(seller, comp, node);
    expect(() => createListing(seller, 'component', comp, 500)).toThrow(/unequip/i);
  });

  test('a listed cosmetic can be neither worn nor refined', () => {
    const seller = fund(wallet(4));
    buyCosmetic(seller, 'avatar_house_jacket', 'GREEN');
    const id = (getDb().prepare('SELECT id FROM cosmetics_owned WHERE wallet = ?').get(seller) as { id: number }).id;
    createListing(seller, 'cosmetic', id, 3_000);

    expect(() => equipCosmetic(seller, 'avatar_house_jacket')).toThrow(/listed on the Exchange/);
    expect(() => upgradeCosmetic(seller, 'avatar_house_jacket')).toThrow(/listed on the Exchange/);
  });

  test('cancelling releases the lock', () => {
    const seller = fund(wallet(5));
    const node = makeNode(seller);
    const comp = makeComponent(seller);
    const listing = createListing(seller, 'component', comp, 500);
    expect(isListed('component', comp)).toBe(true);

    cancelListing(seller, listing.id);
    expect(isListed('component', comp)).toBe(false);
    expect(() => equipComponent(seller, comp, node)).not.toThrow();
  });
});

describe('a sale moves everything, exactly once', () => {
  test('a desk carries its fitted instruments to the buyer', () => {
    const seller = fund(wallet(10));
    const buyer = fund(wallet(11));
    const node = makeNode(seller);
    const fitted = makeComponent(seller);
    equipComponent(seller, fitted, node);
    const listing = createListing(seller, 'node', node, 9_000);

    transferSoldItem(listing.id, buyer);

    expect(nodeOwner(node)).toBe(buyer);
    // Gear bolted to a desk cannot stay with the wallet that sold the desk.
    expect(componentOwner(fitted)).toBe(buyer);
    expect(componentNode(fitted)).toBe(node);
  });

  test('a sold instrument comes off whatever it was on', () => {
    const seller = fund(wallet(12));
    const buyer = fund(wallet(13));
    const comp = makeComponent(seller);
    const listing = createListing(seller, 'component', comp, 700);

    transferSoldItem(listing.id, buyer);

    expect(componentOwner(comp)).toBe(buyer);
    expect(componentNode(comp)).toBeNull();
  });

  test('the seller cannot buy their own listing', () => {
    const seller = fund(wallet(14));
    const comp = makeComponent(seller);
    const listing = createListing(seller, 'component', comp, 700);
    expect(() => transferSoldItem(listing.id, seller)).toThrow(/your own/);
    expect(componentOwner(comp)).toBe(seller);
  });

  test('a listing can only be settled once', () => {
    const seller = fund(wallet(15));
    const first = fund(wallet(16));
    const second = fund(wallet(17));
    const comp = makeComponent(seller);
    const listing = createListing(seller, 'component', comp, 700);

    transferSoldItem(listing.id, first);
    expect(() => transferSoldItem(listing.id, second)).toThrow(/no longer available|just taken/);
    // The loser of the race must not end up holding it.
    expect(componentOwner(comp)).toBe(first);
  });
});

describe('a sold machine leaves the seller floor', () => {
  test('the placement is dropped from the stored layout', () => {
    const seller = fund(wallet(20));
    const buyer = fund(wallet(21));
    const keep = makeNode(seller);
    const sell = makeNode(seller);
    saveLayout(seller, [
      { id: `line:${keep}`, x: 0, z: 0, rotation: 0 },
      { id: `line:${sell}`, x: 3, z: 3, rotation: 0 },
    ]);
    expect(getLayout(seller)).toHaveLength(2);

    const listing = createListing(seller, 'node', sell, 9_000);
    transferSoldItem(listing.id, buyer);

    const after = getLayout(seller);
    expect(after).toHaveLength(1);
    expect(after[0].id).toBe(`line:${keep}`);
  });
});

describe('cosmetics change hands with their upgrades intact', () => {
  const buyAndList = (seller: string, key: string, price: number) => {
    buyCosmetic(seller, key, 'GREEN');
    const id = (
      getDb()
        .prepare('SELECT id FROM cosmetics_owned WHERE wallet = ? AND cosmetic_key = ?')
        .get(seller, key) as { id: number }
    ).id;
    return { id, listing: createListing(seller, 'cosmetic', id, price) };
  };

  test('the refinement level travels with the item', () => {
    const seller = fund(wallet(30));
    const buyer = fund(wallet(31));
    buyCosmetic(seller, 'desk_brushed_steel', 'GREEN');
    upgradeCosmetic(seller, 'desk_brushed_steel');
    upgradeCosmetic(seller, 'desk_brushed_steel');
    const id = (
      getDb()
        .prepare('SELECT id FROM cosmetics_owned WHERE wallet = ?').get(seller) as { id: number }
    ).id;
    const listing = createListing(seller, 'cosmetic', id, 30_000);

    transferSoldItem(listing.id, buyer);

    const row = cosmeticRow(id);
    expect(row?.wallet).toBe(buyer);
    // A buyer paying a premium for a refined piece has to actually receive the
    // refinement, or the upgrade track is a sink with no resale value at all.
    expect(row?.upgrade_level).toBe(2);
    expect(ownedCosmetics(seller)).toHaveLength(0);
    expect(ownedCosmetics(buyer)).toEqual(['desk_brushed_steel']);
  });

  test('a worn cosmetic must come off before it is listed', () => {
    const seller = fund(wallet(32));
    buyCosmetic(seller, 'avatar_market_maker', 'GREEN');
    equipCosmetic(seller, 'avatar_market_maker');
    const id = (
      getDb().prepare('SELECT id FROM cosmetics_owned WHERE wallet = ?').get(seller) as { id: number }
    ).id;
    expect(() => createListing(seller, 'cosmetic', id, 20_000)).toThrow(/take that off/);
  });

  test('the seller stops wearing it even if it was equipped behind our back', () => {
    const seller = fund(wallet(33));
    const buyer = fund(wallet(34));
    const { id, listing } = buyAndList(seller, 'plinth_marble', 12_000);
    // Reach past equipCosmetic's guard to simulate a row that predates it.
    getDb()
      .prepare('INSERT INTO cosmetics_equipped (wallet, slot, cosmetic_key, equipped_at) VALUES (?,?,?,?)')
      .run(seller, 'plinth', 'plinth_marble', Date.now());

    transferSoldItem(listing.id, buyer);

    expect(cosmeticRow(id)?.wallet).toBe(buyer);
    // Nobody may be left wearing something they no longer own.
    expect(equippedCosmetics(seller).plinth).toBeUndefined();
  });

  test('refuses a buyer who already owns that cosmetic, and changes nothing', () => {
    const seller = fund(wallet(35));
    const buyer = fund(wallet(36));
    const { id, listing } = buyAndList(seller, 'plinth_founders', 50_000);
    buyCosmetic(buyer, 'plinth_founders', 'GREEN');

    // One copy per wallet is a unique index; without this check the UPDATE would
    // fail mid-transaction and roll back a purchase the buyer already paid for.
    expect(() => transferSoldItem(listing.id, buyer)).toThrow(/already own/);
    expect(cosmeticRow(id)?.wallet).toBe(seller);
    expect(isListed('cosmetic', id)).toBe(true);
  });
});
