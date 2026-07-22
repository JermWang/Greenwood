// Coverage for payout bookkeeping — the failure path above all.
//
// A claim consumes the accrual before it attempts the transfer, so a payout
// that does not go through leaves the operator already debited. The row written
// on failure is the only record that the protocol owes them, which makes "this
// insert always succeeds" a correctness property rather than a nicety.
//
// Each run gets its own SQLite file via OSR_DATA_DIR so tests never touch the
// developer's local data/ directory or each other's state.
import { describe, test, expect, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'osr-settlement-test-'));
process.env.OSR_DATA_DIR = DATA_DIR;
delete process.env.VERCEL;

const { recordPayout } = await import('./settlement');
const { getDb } = await import('./db');

interface Row {
  wallet: string;
  osr_amount: string;
  status: string;
  tx_hash: string | null;
  settled_at: number | null;
}

const wallet = (n: number) => `0x${String(n).padStart(40, '0')}`;
const payouts = (w: string) =>
  getDb()
    .prepare('SELECT * FROM settlements WHERE wallet = ? ORDER BY created_at')
    .all(w) as unknown as Row[];

afterAll(() => {
  // Best-effort: Windows keeps the SQLite handle open past teardown, and the
  // directory is under the OS temp root either way.
  try {
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
  } catch {
    /* leave it to the OS */
  }
});

describe('recordPayout', () => {
  test('a completed payout is recorded against its transaction', () => {
    const w = wallet(1);
    recordPayout(w, 500, `0x${'a'.repeat(64)}`, { ok: true });

    const [row] = payouts(w);
    expect(row.status).toBe('settled');
    expect(row.tx_hash).toBe(`0x${'a'.repeat(64)}`);
    expect(row.settled_at).not.toBeNull();
  });

  test('a failed payout is recorded as an open debt', () => {
    const w = wallet(2);
    recordPayout(w, 250, null, { error: 'treasury out of GPU' });

    const [row] = payouts(w);
    expect(row.status).toBe('owed');
    expect(row.tx_hash).toBeNull();
    // Nothing was settled, so the timestamp stays empty rather than claiming a
    // settlement time for a transfer that never happened.
    expect(row.settled_at).toBeNull();
    expect(row.osr_amount).toBe('250');
  });

  test('consecutive failed payouts each record their own debt', () => {
    // The regression: a placeholder tx_hash collides with the unique index on
    // the second failure, so the debt went unrecorded exactly when the treasury
    // was misconfigured and every payout was failing.
    const w = wallet(3);
    expect(() => {
      recordPayout(w, 10, null, { error: 'first' });
      recordPayout(w, 20, null, { error: 'second' });
      recordPayout(w, 30, null, { error: 'third' });
    }).not.toThrow();

    const rows = payouts(w);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.osr_amount)).toEqual(['10', '20', '30']);
    expect(rows.every((r) => r.status === 'owed')).toBe(true);
  });

  test('debts across different wallets do not collide', () => {
    expect(() => {
      recordPayout(wallet(4), 1, null, { error: 'a' });
      recordPayout(wallet(5), 2, null, { error: 'b' });
    }).not.toThrow();

    expect(payouts(wallet(4))).toHaveLength(1);
    expect(payouts(wallet(5))).toHaveLength(1);
  });

  test('one mined transaction still cannot back two payouts', () => {
    // Allowing repeated nulls must not weaken the guard on real hashes.
    const hash = `0x${'b'.repeat(64)}`;
    recordPayout(wallet(6), 100, hash, { ok: true });
    expect(() => recordPayout(wallet(7), 100, hash, { ok: true })).toThrow();
  });
});
