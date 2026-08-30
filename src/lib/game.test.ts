// Engine coverage for the emission share formula, the new-wallet bootstrap
// path, and the full mint -> produce -> claim -> crate -> gear -> upgrade cycle.
//
// Each run gets its own SQLite file via OSR_DATA_DIR so tests never touch the
// developer's local data/ directory or each other's state.
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'osr-test-'));
process.env.OSR_DATA_DIR = DATA_DIR;
delete process.env.VERCEL;

const {
  getOrCreateUser,
  mintNode,
  settleUser,
  claimRewards,
  openCrate,
  equipComponent,
  unequipComponent,
  upgradeNode,
  upgradeCompound,
  inventory,
  networkGrowPower,
  userOperation,
  readUser,
  compoundInfo,
  crateAllowance,
} = await import('./game');
const { SHARE_CAP, STARTER_GREEN_GRANT, GENESIS_RATE_PER_SEC } = await import('./economy');
const { getDb } = await import('./db');
const { setOsrUsdPrice } = await import('./price');

const wallet = (n: number) => `0x${String(n).padStart(40, '0')}`;
const fund = (w: string, amount: number) =>
  getDb().prepare('UPDATE users SET osr_balance = ? WHERE wallet = ?').run(amount, w);
/** Rewind accrual clocks so production has elapsed without a real wait. */
const advance = (w: string, ms: number) =>
  getDb()
    .prepare('UPDATE nodes SET accrued_updated_at = accrued_updated_at - ? WHERE wallet = ?')
    .run(ms, w);

afterAll(() => {
  // Best-effort: Windows keeps the SQLite handle open past teardown, and the
  // directory is under the OS temp root either way.
  try {
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
  } catch {
    /* leave it to the OS */
  }
});

describe('new wallet bootstrap', () => {
  test('starter grant covers the first Desk Fab', () => {
    const w = wallet(1);
    const user = getOrCreateUser(w);
    expect(user.osr_balance).toBe(STARTER_GREEN_GRANT);
    // The whole point: a brand-new wallet can reach its first node unaided.
    expect(() => mintNode(w, 'equity_desk')).not.toThrow();
  });

  test('grant is credited exactly once', () => {
    const w = wallet(2);
    getOrCreateUser(w);
    fund(w, 0);
    getOrCreateUser(w);
    getOrCreateUser(w);
    const after = getDb()
      .prepare('SELECT osr_balance FROM users WHERE wallet = ?')
      .get(w) as { osr_balance: number };
    expect(after.osr_balance).toBe(0);
  });
});

describe('emission share', () => {
  test('network grow power sums every wallet, not just one', () => {
    const a = wallet(10);
    const b = wallet(11);
    getOrCreateUser(a);
    getOrCreateUser(b);
    fund(a, 100_000);
    fund(b, 100_000);
    mintNode(a, 'equity_desk');
    mintNode(b, 'equity_desk');

    const sa = settleUser(a);
    const sb = settleUser(b);
    // Each wallet's own GP must be strictly less than the network total.
    expect(sa.userGp).toBeLessThan(sa.networkGp);
    expect(sa.networkGp).toBeCloseTo(networkGrowPower(), 6);
    expect(sa.networkGp).toBeCloseTo(sb.networkGp, 6);
  });

  test('equal operators earn equal, sub-unity shares', () => {
    const sa = settleUser(wallet(10));
    const sb = settleUser(wallet(11));
    const shareA = sa.userGp / sa.networkGp;
    // With a per-wallet denominator this was exactly 1.0 for every operator,
    // which pinned everyone to SHARE_CAP permanently.
    expect(shareA).toBeLessThan(1);
    expect(sa.userRate).toBeGreaterThan(0);
    // Tolerance is loose because the welcome boost decays with wall-clock time
    // between the two settle calls.
    expect(sa.userRate).toBeCloseTo(sb.userRate, 3);
  });

  test('a new competitor dilutes an existing operator', () => {
    const incumbent = wallet(12);
    getOrCreateUser(incumbent);
    fund(incumbent, 100_000);
    mintNode(incumbent, 'equity_desk');

    const before = settleUser(incumbent);
    const shareBefore = before.userGp / before.networkGp;

    const rival = wallet(13);
    getOrCreateUser(rival);
    fund(rival, 100_000);
    mintNode(rival, 'equity_desk');

    const after = settleUser(incumbent);
    const shareAfter = after.userGp / after.networkGp;

    // The regression in one assertion: another wallet joining must reduce your
    // slice. Under the old formula shareBefore === shareAfter === 1.
    expect(after.userGp).toBeCloseTo(before.userGp, 6);
    expect(after.networkGp).toBeGreaterThan(before.networkGp);
    expect(shareAfter).toBeLessThan(shareBefore);
  });

  test('a bigger operator earns a strictly larger share', () => {
    const big = wallet(20);
    const small = wallet(21);
    getOrCreateUser(big);
    getOrCreateUser(small);
    fund(big, 500_000);
    fund(small, 500_000);
    mintNode(small, 'equity_desk');
    mintNode(big, 'equity_desk');
    mintNode(big, 'treasury_desk');

    const sBig = settleUser(big);
    const sSmall = settleUser(small);
    expect(sBig.userGp).toBeGreaterThan(sSmall.userGp);
    expect(sBig.userGp / sBig.networkGp).toBeGreaterThan(sSmall.userGp / sSmall.networkGp);
  });

  test('share is capped and rate never exceeds the cap of emission', () => {
    const solo = wallet(30);
    getOrCreateUser(solo);
    fund(solo, 100_000);
    mintNode(solo, 'equity_desk');
    const s = settleUser(solo);
    const share = Math.min(s.userGp / s.networkGp, SHARE_CAP);
    expect(share).toBeLessThanOrEqual(SHARE_CAP + 1e-9);
    // userRate = share x emission x welcome boost (boost peaks at 8x).
    expect(s.userRate).toBeLessThanOrEqual(SHARE_CAP * GENESIS_RATE_PER_SEC * 8 + 1e-6);
  });
});

describe('full game cycle', () => {
  test('mint -> produce -> claim -> crate -> equip -> upgrade', () => {
    const w = wallet(40);
    getOrCreateUser(w);
    fund(w, 200_000);

    const minted = mintNode(w, 'equity_desk');
    expect(minted.node.level).toBe(1);
    const nodeId = minted.node.id;

    advance(w, 3_600_000);
    const settled = settleUser(w);
    expect(settled.nodes[0].pendingGreen).toBeGreaterThan(0);

    const claimed = claimRewards(w);
    expect(claimed.claims.length).toBeGreaterThan(0);
    expect(claimed.claims[0].net).toBeGreaterThan(0);
    // Fee must be withheld, never negative, never exceeding gross.
    expect(claimed.claims[0].fee).toBeGreaterThan(0);
    expect(claimed.claims[0].net).toBeLessThan(claimed.claims[0].gross);

    // Crates are mined now, so seed one directly rather than buying it.
    // Crates are dollar-priced, so the engine needs a token price to charge.
    setOsrUsdPrice(0.001);
    const crateRow = getDb()
      .prepare("INSERT INTO crates (wallet, crate_type, found_at) VALUES (?,'equity_allocation',?)")
      .run(w, Date.now());
    const crate = openCrate(w, Number(crateRow.lastInsertRowid), nodeId);
    expect(crate.inventoryItemId).toBeGreaterThan(0);
    expect(inventory(w).items.length).toBeGreaterThan(0);

    const gpBefore = settleUser(w).userGp;
    equipComponent(w, crate.inventoryItemId, nodeId);
    expect(settleUser(w).userGp).toBeGreaterThanOrEqual(gpBefore);

    unequipComponent(w, nodeId, crate.slot);
    expect(
      inventory(w).items.find((i) => i.id === crate.inventoryItemId)?.equippedNodeId
    ).toBeNull();

    const up = upgradeNode(w, nodeId);
    expect(up.level).toBe(2);

    const comp = upgradeCompound(w);
    expect(comp.compound.level).toBeGreaterThan(1);

    const op = userOperation(w);
    expect(op.nodes.length).toBeGreaterThan(0);
    expect(op.productionRate).toBeGreaterThan(0);
  });

  test('cannot mint without balance', () => {
    const w = wallet(50);
    getOrCreateUser(w);
    fund(w, 0);
    expect(() => mintNode(w, 'equity_desk')).toThrow(/Not enough GREEN/);
  });

  test('claim cooldown is enforced', () => {
    const w = wallet(40);
    expect(() => claimRewards(w)).toThrow(/cooldown/i);
  });

  test('a second compound claim on spent accrual returns no claims', () => {
    // The property /api/rewards/claim relies on to size its payout. Compound
    // mode has no cooldown, so when two land together the loser must come back
    // with nothing to pay for — the route reads the amount to send off these
    // claims, and an empty list has to mean zero rather than "pay the amount we
    // read before the accrual was consumed".
    const w = wallet(61);
    getOrCreateUser(w);
    fund(w, 10_000_000);
    mintNode(w, 'treasury_desk');

    const total = (r: { claims: Array<{ net: number }> }) =>
      r.claims.reduce((sum, c) => sum + c.net, 0);

    // Seed a known accrual rather than waiting for one. Comparing two live
    // claims is timing-dependent — the node keeps producing between them, and a
    // freshly minted node can accrue more before the second call than it had
    // before the first, which says nothing about whether consumption worked.
    getDb()
      .prepare('UPDATE nodes SET accrued = 1000, accrued_updated_at = ? WHERE wallet = ?')
      .run(Date.now(), w);

    const first = claimRewards(w, undefined, 'compound');
    expect(first.claims.length).toBeGreaterThan(0);
    expect(total(first)).toBeGreaterThan(900);

    // Not exactly zero: the node accrues again between the two calls, and that
    // sliver is real and payable. What matters is that the seeded 1,000 is gone,
    // so a second payout cannot be anywhere near the first — which is exactly
    // what paying the pre-consume figure would have done.
    const second = claimRewards(w, undefined, 'compound');
    expect(total(second)).toBeLessThan(1);
  });

  test('foreign keys are enforced, not just declared', () => {
    // SQLite defaults them OFF per connection, so the six references in the
    // schema did nothing at all until the pragma was set. Without this a node,
    // crate or stake could outlive the wallet that owns it.
    expect(() =>
      getDb()
        .prepare(
          'INSERT INTO nodes (wallet, family, level, created_at, last_claim_at, accrued, accrued_updated_at) VALUES (?,?,1,?,?,0,?)'
        )
        .run('0xnot-a-registered-wallet', 'oil', Date.now(), Date.now(), Date.now())
    ).toThrow(/FOREIGN KEY/i);
  });

  test('reading an unknown wallet never creates it', () => {
    // These are the paths behind the unauthenticated GET routes. Each used to
    // run getOrCreateUser, so a curl loop over random addresses inserted a row
    // and credited the starter grant every time — filling the volume and minting
    // supply that the public protocol figures then reported as circulating.
    const w = wallet(63);
    const rows = () =>
      (getDb().prepare('SELECT COUNT(*) AS n FROM users WHERE wallet = ?').get(w) as unknown as {
        n: number;
      }).n;
    const ledger = () =>
      (getDb()
        .prepare("SELECT COUNT(*) AS n FROM ledger WHERE wallet = ? AND kind = 'starter_grant'")
        .get(w) as unknown as { n: number }).n;

    expect(rows()).toBe(0);

    const user = readUser(w);
    inventory(w);
    compoundInfo(w, false);
    crateAllowance(readUser(w));
    settleUser(w, false);

    expect(rows()).toBe(0);
    expect(ledger()).toBe(0);
    // And the wallet is reported as holding nothing, rather than the grant it
    // would receive if it ever actually registered.
    expect(user.osr_balance).toBe(0);
    expect(inventory(w).items).toHaveLength(0);
    expect(settleUser(w, false).nodes).toHaveLength(0);

    // Registering still works, and still grants.
    getOrCreateUser(w);
    expect(rows()).toBe(1);
    expect(ledger()).toBe(1);
  });

  test('a node upgrade refuses to apply a quote taken at a different level', () => {
    // Upgrade cost climbs with level, so a batch of quotes taken at L1 must not
    // settle in sequence to reach L11 at L1's price.
    const w = wallet(62);
    getOrCreateUser(w);
    fund(w, 10_000_000);
    const nodeId = mintNode(w, 'equity_desk').node.id;

    expect(upgradeNode(w, nodeId, undefined, 1).level).toBe(2);
    expect(() => upgradeNode(w, nodeId, undefined, 1)).toThrow(/level moved/i);
    expect(upgradeNode(w, nodeId, undefined, 2).level).toBe(3);
  });

  test('a compound upgrade refuses to apply a quote taken at a different level', () => {
    // Quotes are free and unlimited, so several can be taken while the operator
    // is still at L1 and then settled in sequence. Each must be honoured only at
    // the level it was priced for, or the second one grants L3 for L2's price.
    const w = wallet(60);
    getOrCreateUser(w);
    fund(w, 10_000_000);

    const first = upgradeCompound(w, true, undefined, 2);
    expect(first.compound.level).toBe(2);

    // A second quote issued while still at L1 is now stale.
    expect(() => upgradeCompound(w, true, undefined, 2)).toThrow(/level moved/i);

    // Re-quoting at the level the operator actually holds still works.
    expect(upgradeCompound(w, true, undefined, 3).compound.level).toBe(3);
  });
});
