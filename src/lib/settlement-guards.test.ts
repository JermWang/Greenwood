// Coverage for the two settlement guards that decide whether a payment buys
// what it was quoted for.
//
// Both are checked before settleSpend touches the chain, so these run without an
// RPC: the point is that a row which reaches the receipt lookup at all has
// already been proven to belong to this wallet AND to this action.
//
// Settlement env is set before importing settlement.ts because the module reads
// the token, treasury and signer config once at load; requireSettlement() would
// otherwise 503 and mask the guards under test.
import { describe, test, expect, afterAll } from 'vitest';
import { privateKeyToAccount } from 'viem/accounts';
import fs from 'fs';
import os from 'os';
import path from 'path';

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'osr-settlement-guards-'));
process.env.OSR_DATA_DIR = DATA_DIR;
delete process.env.VERCEL;

process.env.NEXT_PUBLIC_OSR_TOKEN = `0x${'11'.repeat(20)}`;
// Settlement now signs with a local key, and SETTLEMENT_CONFIGURED requires the
// key's address to equal the published treasury. The treasury address is
// DERIVED from the key here rather than pasted alongside it — a hand-copied
// pair is one typo away from a mismatch that disables settlement and masks
// every guard under a 503, which is exactly what happened when this was first
// written. A published test key with no value on any real network.
process.env.OSR_TREASURY_PK = '0xac0974bec39a17e36ba4a6b4d238ff944bababceac72cf4bff02d1e46e6c9a51';
process.env.NEXT_PUBLIC_OSR_TREASURY_WALLET = privateKeyToAccount(
  process.env.OSR_TREASURY_PK as `0x${string}`
).address;

const { settleSpend, quoteSpend } = await import('./settlement');
const { getDb } = await import('./db');

const WALLET = `0x${'ab'.repeat(20)}`;
const TX = `0x${'cd'.repeat(32)}`;

/** Insert a priced-but-unpaid settlement row, the state after a quote. */
function issueRow(nonce: string, action: string, bntyAmount = '250') {
  getDb()
    .prepare(
      `INSERT INTO settlements
         (nonce, wallet, action, detail, osr_amount, fee_wei, burn_bps, treasury_bps,
          deadline, status, created_at)
       VALUES (?,?,?,?,?,'0',0,0,?,'issued',?)`
    )
    .run(
      nonce,
      WALLET,
      action,
      '0x00',
      bntyAmount,
      Math.floor(Date.now() / 1000) + 900,
      Date.now()
    );
}

afterAll(() => {
  // Windows keeps the SQLite handle open past teardown; the dir is under the OS
  // temp root regardless.
  try {
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

describe('settleSpend action binding', () => {
  test('refuses a nonce quoted for a different action', async () => {
    issueRow('nonce-cross-route', 'UpgradeNode');
    // The attack: pay the cheap UpgradeNode quote, then redeem it at OpenCrate,
    // whose decoder happily reads the stored detail as a crate id.
    await expect(
      settleSpend(WALLET, 'OpenCrate', 'nonce-cross-route', TX, () => 'applied')
    ).rejects.toMatchObject({ status: 409 });
  });

  test('does not run apply() when the action mismatches', async () => {
    issueRow('nonce-no-apply', 'MintNode');
    let applied = false;
    // Asserting the status, not just "it threw": without the binding this still
    // rejects, but on the receipt lookup (425), which would pass a bare toThrow
    // and prove nothing about the guard.
    await expect(
      settleSpend(WALLET, 'StakeOpen', 'nonce-no-apply', TX, () => {
        applied = true;
        return 'applied';
      })
    ).rejects.toMatchObject({ status: 409 });
    expect(applied).toBe(false);
  });

  test('leaves the row issued so the correct route can still settle it', async () => {
    issueRow('nonce-untouched', 'UpgradeCompound');
    await expect(
      settleSpend(WALLET, 'OpenCrate', 'nonce-untouched', TX, () => 'applied')
    ).rejects.toMatchObject({ status: 409 });
    const row = getDb()
      .prepare('SELECT status, tx_hash FROM settlements WHERE nonce = ?')
      .get('nonce-untouched') as unknown as { status: string; tx_hash: string | null };
    expect(row.status).toBe('issued');
    expect(row.tx_hash).toBeNull();
  });

  test('still rejects another wallet before the action is considered', async () => {
    issueRow('nonce-other-wallet', 'OpenCrate');
    await expect(
      settleSpend(`0x${'ef'.repeat(20)}`, 'OpenCrate', 'nonce-other-wallet', TX, () => 'applied')
    ).rejects.toMatchObject({ status: 403 });
  });

  test('an unknown nonce is still a 404', async () => {
    await expect(
      settleSpend(WALLET, 'OpenCrate', 'nonce-does-not-exist', TX, () => 'applied')
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe('non-payable settlements', () => {
  // Both guards sit ahead of the receipt lookup, so an unpayable row costs no
  // RPC calls and these tests need no chain.
  test('quoteSpend refuses a zero amount', async () => {
    await expect(
      quoteSpend(WALLET, { action: 'ExpediteCompound', detail: '0x00', bntyAmount: 0 })
    ).rejects.toMatchObject({ status: 400 });
  });

  test('quoteSpend refuses a negative amount', async () => {
    await expect(
      quoteSpend(WALLET, { action: 'MintNode', detail: '0x00', bntyAmount: -5 })
    ).rejects.toMatchObject({ status: 400 });
  });

  test('quoteSpend refuses a non-finite amount', async () => {
    await expect(
      quoteSpend(WALLET, { action: 'MintNode', detail: '0x00', bntyAmount: Number.NaN })
    ).rejects.toMatchObject({ status: 400 });
  });

  test('a zero row already in the table cannot be settled', async () => {
    // The state a pre-fix expedite quote left behind: any transfer, including a
    // 0-value one, clears an owed of zero.
    issueRow('nonce-zero-owed', 'ExpediteCompound', '0');
    await expect(
      settleSpend(WALLET, 'ExpediteCompound', 'nonce-zero-owed', TX, () => 'applied')
    ).rejects.toMatchObject({ status: 409 });
  });
});
