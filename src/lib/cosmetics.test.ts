// Cosmetics coverage, focused on the money: the 2% house cut must split exactly
// in half, every unit of it must land somewhere, and a cosmetic must never be
// charged for twice or worn without being owned.
//
// Each run gets its own SQLite file via OSR_DATA_DIR so tests never touch the
// developer's local data/ directory or each other's state.
import { describe, test, expect, beforeEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'eg-cosmetics-test-'));
process.env.OSR_DATA_DIR = DATA_DIR;
delete process.env.VERCEL;

const {
  buyCosmetic,
  equipCosmetic,
  unequipCosmetic,
  upgradeCosmetic,
  ownedCosmetics,
  cosmeticLevels,
  equippedCosmetics,
  wornCosmetics,
  cosmeticsCatalog,
  cosmeticDef,
} = await import('./cosmetics');
const { getOrCreateUser } = await import('./game');
const { getDb, setProtocolValue, getProtocolValue } = await import('./db');
const { progressionOf } = await import('./progression');
const {
  cosmeticFeeSplit,
  cosmeticUpgradeCost,
  COSMETIC_FEE_BPS,
  COSMETIC_MAX_LEVEL,
} = await import('./economy');

const wallet = (n: number) => `0x${String(n).padStart(40, '0')}`;
const fund = (w: string, amount: number) => {
  getOrCreateUser(w);
  getDb().prepare('UPDATE users SET osr_balance = ? WHERE wallet = ?').run(amount, w);
};
const balanceOf = (w: string) =>
  (getDb().prepare('SELECT osr_balance AS b FROM users WHERE wallet = ?').get(w) as { b: number }).b;
const counter = (key: string) => Number(getProtocolValue(key) ?? '0');

beforeEach(() => {
  const db = getDb();
  db.exec('DELETE FROM cosmetics_owned');
  db.exec('DELETE FROM cosmetics_equipped');
  db.exec('DELETE FROM xp_tracks');
  db.exec('DELETE FROM daily_quests');
  db.exec('DELETE FROM users');
  db.exec('DELETE FROM ledger');
  for (const key of ['burned', 'reserve', 'treasury', 'solRevenue', 'ethBurnFund', 'ethRewardFund']) {
    setProtocolValue(key, '0');
  }
});

describe('the house cut', () => {
  test('takes 2% and splits it exactly in half', () => {
    const split = cosmeticFeeSplit(10_000);
    expect(COSMETIC_FEE_BPS).toBe(200);
    expect(split.fee).toBe(200);
    expect(split.burn).toBe(100);
    expect(split.reserve).toBe(100);
    expect(split.net).toBe(9_800);
  });

  test('never loses a unit to rounding, whatever the price', () => {
    // Reserve is the remainder rather than a second basis-point calculation, so
    // the halves always reconstruct the fee even on amounts that do not divide.
    for (const amount of [1, 3, 7, 33, 101, 999, 12_345, 7_777_777]) {
      const s = cosmeticFeeSplit(amount);
      expect(s.burn + s.reserve).toBeCloseTo(s.fee, 10);
      expect(s.net + s.fee).toBeCloseTo(amount, 10);
    }
  });
});

describe('buying with GREEN', () => {
  test('charges the price and routes the whole fee back to players', () => {
    const w = wallet(1);
    const def = cosmeticDef('desk_brushed_steel');
    fund(w, 100_000);

    const result = buyCosmetic(w, def.key, 'GREEN');

    expect(balanceOf(w)).toBe(100_000 - def.green);
    expect(result.fee).toBeCloseTo(def.green * 0.02, 10);
    // Half destroyed, half back into the pool that pays rewards.
    expect(counter('burned')).toBeCloseTo(result.fee / 2, 10);
    expect(counter('reserve')).toBeCloseTo(result.fee / 2, 10);
    expect(counter('burned') + counter('reserve')).toBeCloseTo(result.fee, 10);
    // Remainder is protocol revenue: a primary sale has no seller to pay.
    expect(counter('treasury')).toBeCloseTo(def.green - result.fee, 10);
  });

  test('refuses a purchase the balance cannot cover, and charges nothing', () => {
    const w = wallet(2);
    fund(w, 10);
    expect(() => buyCosmetic(w, 'plinth_founders', 'GREEN')).toThrow(/Not enough GREEN/);
    expect(balanceOf(w)).toBe(10);
    expect(ownedCosmetics(w)).toHaveLength(0);
    expect(counter('burned')).toBe(0);
  });

  test('skips the debit when the purchase already settled on-chain', () => {
    const w = wallet(3);
    fund(w, 100_000);
    buyCosmetic(w, 'desk_brushed_steel', 'GREEN', { settledOnChain: true });
    // Paid in real tokens already; debiting the mirrored balance would charge twice.
    expect(balanceOf(w)).toBe(100_000);
    expect(ownedCosmetics(w)).toContain('desk_brushed_steel');
  });

  test('will not sell the same cosmetic twice', () => {
    const w = wallet(4);
    fund(w, 100_000);
    buyCosmetic(w, 'avatar_house_jacket', 'GREEN');
    const after = balanceOf(w);
    expect(() => buyCosmetic(w, 'avatar_house_jacket', 'GREEN')).toThrow(/already own/);
    expect(balanceOf(w)).toBe(after);
    expect(ownedCosmetics(w)).toHaveLength(1);
  });
});

describe('buying with ETH', () => {
  test('leaves the GREEN balance alone and earmarks the fee rather than burning supply', () => {
    const w = wallet(5);
    const def = cosmeticDef('desk_neon_trim');
    fund(w, 50_000);

    const result = buyCosmetic(w, def.key, 'ETH');

    expect(balanceOf(w)).toBe(50_000);
    expect(counter('solRevenue')).toBeCloseTo(def.eth, 12);
    expect(counter('ethBurnFund')).toBeCloseTo(result.fee / 2, 12);
    expect(counter('ethRewardFund')).toBeCloseTo(result.fee / 2, 12);
    // No GREEN was destroyed, so the burn counter must not move.
    expect(counter('burned')).toBe(0);
  });
});

describe('wearing cosmetics', () => {
  test('refuses to equip something the wallet does not own', () => {
    const w = wallet(6);
    getOrCreateUser(w);
    expect(() => equipCosmetic(w, 'plinth_marble')).toThrow(/do not own/);
  });

  test('one cosmetic per slot — equipping replaces what was worn', () => {
    const w = wallet(7);
    fund(w, 500_000);
    buyCosmetic(w, 'plinth_marble', 'GREEN');
    buyCosmetic(w, 'plinth_founders', 'GREEN');

    equipCosmetic(w, 'plinth_marble');
    expect(equippedCosmetics(w).plinth).toBe('plinth_marble');

    equipCosmetic(w, 'plinth_founders');
    expect(equippedCosmetics(w).plinth).toBe('plinth_founders');
    // Replaced, not stacked: still one plinth.
    expect(Object.keys(equippedCosmetics(w))).toEqual(['plinth']);

    unequipCosmetic(w, 'plinth');
    expect(equippedCosmetics(w).plinth).toBeUndefined();
  });

  test('slots are independent', () => {
    const w = wallet(8);
    fund(w, 500_000);
    buyCosmetic(w, 'avatar_house_jacket', 'GREEN');
    buyCosmetic(w, 'desk_neon_trim', 'GREEN');
    equipCosmetic(w, 'avatar_house_jacket');
    equipCosmetic(w, 'desk_neon_trim');
    const worn = equippedCosmetics(w);
    expect(worn.avatar).toBe('avatar_house_jacket');
    expect(worn.desk).toBe('desk_neon_trim');
  });
});

describe('the upgrade track', () => {
  const owned = (w: string, key = 'desk_brushed_steel') => {
    fund(w, 5_000_000);
    buyCosmetic(w, key, 'GREEN');
    return cosmeticDef(key);
  };

  test('starts every purchase at the bottom of the track', () => {
    const w = wallet(10);
    owned(w);
    expect(cosmeticLevels(w).desk_brushed_steel).toBe(0);
    const item = cosmeticsCatalog(w).items.find((i) => i.key === 'desk_brushed_steel');
    expect(item?.rank).toBe('Stock');
    expect(item?.nextUpgrade?.level).toBe(1);
  });

  test('charges the published price and routes the fee the same way a sale does', () => {
    const w = wallet(11);
    const def = owned(w);
    const before = balanceOf(w);
    const burnedBefore = counter('burned');
    const reserveBefore = counter('reserve');

    const price = cosmeticUpgradeCost(def.green, 0);
    const result = upgradeCosmetic(w, def.key);

    expect(result.price).toBe(price);
    expect(balanceOf(w)).toBeCloseTo(before - price, 8);
    expect(counter('burned') - burnedBefore).toBeCloseTo(result.fee / 2, 8);
    expect(counter('reserve') - reserveBefore).toBeCloseTo(result.fee / 2, 8);
  });

  test('gets dearer every step, and stops at the cap', () => {
    const w = wallet(12);
    const def = owned(w);
    const paid: number[] = [];
    for (let i = 0; i < COSMETIC_MAX_LEVEL; i += 1) paid.push(upgradeCosmetic(w, def.key).price);

    for (let i = 1; i < paid.length; i += 1) expect(paid[i]).toBeGreaterThan(paid[i - 1]);
    expect(cosmeticLevels(w)[def.key]).toBe(COSMETIC_MAX_LEVEL);

    const after = balanceOf(w);
    expect(() => upgradeCosmetic(w, def.key)).toThrow(/top of its track/);
    // A refused upgrade must not take the money for it.
    expect(balanceOf(w)).toBe(after);
  });

  test('will not upgrade something the wallet does not own', () => {
    const w = wallet(13);
    fund(w, 5_000_000);
    expect(() => upgradeCosmetic(w, 'plinth_founders')).toThrow(/do not own/);
    expect(balanceOf(w)).toBe(5_000_000);
  });

  test('refuses a purchase the balance cannot cover, and charges nothing', () => {
    const w = wallet(14);
    fund(w, 500_000);
    buyCosmetic(w, 'plinth_founders', 'GREEN');
    getDb().prepare('UPDATE users SET osr_balance = 1 WHERE wallet = ?').run(w);

    expect(() => upgradeCosmetic(w, 'plinth_founders')).toThrow(/Not enough GREEN/);
    expect(balanceOf(w)).toBe(1);
    expect(cosmeticLevels(w).plinth_founders).toBe(0);
  });

  test('refuses a stale quote rather than applying a step that was not paid for', () => {
    // The settlement rail prices at one level and applies later. If the item
    // moved in between, the payment covers a cheaper step than the one about to
    // be granted, so the mismatch has to be fatal.
    const w = wallet(15);
    const def = owned(w);
    upgradeCosmetic(w, def.key);
    const after = balanceOf(w);
    expect(() => upgradeCosmetic(w, def.key, undefined, 0)).toThrow(/fresh quote/);
    expect(balanceOf(w)).toBe(after);
    expect(cosmeticLevels(w)[def.key]).toBe(1);
  });

  test('skips the debit when the step already settled on-chain', () => {
    const w = wallet(16);
    const def = owned(w);
    const before = balanceOf(w);
    upgradeCosmetic(w, def.key, { settledOnChain: true });
    expect(balanceOf(w)).toBe(before);
    expect(cosmeticLevels(w)[def.key]).toBe(1);
  });

  test('pays XP on the Trading track, and never yield', () => {
    const w = wallet(17);
    const def = owned(w);
    expect(progressionOf(w).tracks.find((t) => t.key === 'trading')?.xp).toBe(0);

    const first = upgradeCosmetic(w, def.key);
    const second = upgradeCosmetic(w, def.key);

    // Later steps are worth more, matching what they cost.
    expect(second.xp).toBeGreaterThan(first.xp);
    expect(progressionOf(w).tracks.find((t) => t.key === 'trading')?.xp).toBe(first.xp + second.xp);
  });

  test('the level a wallet is wearing travels with the equipped item', () => {
    const w = wallet(18);
    fund(w, 5_000_000);
    buyCosmetic(w, 'avatar_market_maker', 'GREEN');
    equipCosmetic(w, 'avatar_market_maker');
    upgradeCosmetic(w, 'avatar_market_maker');
    upgradeCosmetic(w, 'avatar_market_maker');

    expect(wornCosmetics(w).avatar).toEqual({ key: 'avatar_market_maker', level: 2 });
  });
});

describe('the shop', () => {
  test('marks what the wallet owns and wears', () => {
    const w = wallet(9);
    fund(w, 500_000);
    buyCosmetic(w, 'avatar_market_maker', 'GREEN');
    equipCosmetic(w, 'avatar_market_maker');

    const shop = cosmeticsCatalog(w);
    const bought = shop.items.find((i) => i.key === 'avatar_market_maker');
    const other = shop.items.find((i) => i.key === 'plinth_marble');
    expect(bought?.owned).toBe(true);
    expect(bought?.equipped).toBe(true);
    expect(other?.owned).toBe(false);
  });

  test('renders for a signed-out visitor without inventing ownership', () => {
    const shop = cosmeticsCatalog(null);
    expect(shop.items.every((i) => !i.owned && !i.equipped)).toBe(true);
  });

  test('every cosmetic is priced in both currencies', () => {
    // A GREEN-only cosmetic would be unreachable for a new player, and an
    // ETH-only one would remove the token sink that justifies the sink at all.
    for (const item of cosmeticsCatalog(null).items) {
      expect(item.green).toBeGreaterThan(0);
      expect(item.eth).toBeGreaterThan(0);
    }
  });
});
