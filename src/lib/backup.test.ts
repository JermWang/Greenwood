// Snapshots, tested against a real SQLite file rather than a mock.
//
// The whole value of this module is that the file it produces can actually be
// opened and used afterwards, which is exactly the property a mocked filesystem
// cannot demonstrate. So every assertion here goes through a genuine VACUUM
// INTO and then genuinely re-opens the result.
//
// Own data directory per run, matching settlement.test — these tests write real
// files and must not touch the developer's data/ or each other.
import { describe, test, expect, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'osr-backup-test-'));
process.env.OSR_DATA_DIR = DATA_DIR;
delete process.env.VERCEL;

const { getDb, setProtocolValue } = await import('./db');
const { writeSnapshot, listSnapshots, verifySnapshot, maybeSnapshot, backupDir, lastSnapshotAt, KEEP_SNAPSHOTS } =
  await import('./backup');

const wallet = (n: number) => `0x${String(n).padStart(40, '0')}`;

function seed(count: number) {
  const db = getDb();
  const insert = db.prepare('INSERT OR IGNORE INTO users (wallet, osr_balance, created_at, last_seen) VALUES (?,?,?,?)');
  for (let i = 0; i < count; i += 1) insert.run(wallet(i), 100 + i, Date.now(), Date.now());
}

afterAll(() => {
  try {
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
  } catch {
    /* Windows holds the SQLite handle; the directory is under the OS temp root. */
  }
});

describe('taking a snapshot', () => {
  test('produces a file that opens and holds the same operators', () => {
    seed(5);
    const snap = writeSnapshot();

    expect(fs.existsSync(snap.path)).toBe(true);
    expect(snap.bytes).toBeGreaterThan(0);

    // The real assertion: re-open it and read the data back out.
    const restored = new DatabaseSync(snap.path, { readOnly: true });
    const row = restored.prepare('SELECT COUNT(*) n FROM users').get() as { n: number };
    expect(row.n).toBe(5);
    const one = restored.prepare('SELECT osr_balance FROM users WHERE wallet = ?').get(wallet(3)) as {
      osr_balance: number;
    };
    expect(one.osr_balance).toBe(103);
    restored.close();
  });

  /**
   * Balances are the point. A snapshot that restores the schema but loses what
   * everyone is owed is worse than no snapshot, because it would be trusted.
   */
  test('captures writes made after the previous snapshot', () => {
    seed(5);
    writeSnapshot();
    getDb().prepare('UPDATE users SET osr_balance = ? WHERE wallet = ?').run(999999, wallet(1));

    const second = writeSnapshot();
    const restored = new DatabaseSync(second.path, { readOnly: true });
    const row = restored.prepare('SELECT osr_balance FROM users WHERE wallet = ?').get(wallet(1)) as {
      osr_balance: number;
    };
    restored.close();
    expect(row.osr_balance).toBe(999999);
  });

  test('leaves no .partial behind on success', () => {
    writeSnapshot();
    const leftovers = fs.readdirSync(backupDir()).filter((f) => f.endsWith('.partial'));
    expect(leftovers).toEqual([]);
  });

  test('records when it last ran, so the interval check has something to read', () => {
    const before = Date.now();
    writeSnapshot();
    expect(lastSnapshotAt()).toBeGreaterThanOrEqual(before - 1000);
  });
});

describe('verifying a snapshot', () => {
  test('accepts a good one', () => {
    seed(3);
    const snap = writeSnapshot();
    expect(verifySnapshot(snap.path).ok).toBe(true);
  });

  /**
   * The failure integrity_check cannot see.
   *
   * A structurally perfect database with no operators in it passes every
   * SQLite-level check and is completely useless. Verification has to know
   * roughly what it expected to find.
   */
  test('rejects a structurally valid snapshot that lost its operators', () => {
    seed(4);
    const snap = writeSnapshot();
    const verdict = verifySnapshot(snap.path, 999);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain('expected at least 999');
  });

  test('rejects a corrupted file rather than reporting it as a backup', () => {
    seed(3);
    const snap = writeSnapshot();
    // Overwrite the header. SQLite will refuse to open it at all.
    const handle = fs.openSync(snap.path, 'r+');
    fs.writeSync(handle, Buffer.from('not a database at all!!'), 0, 23, 0);
    fs.closeSync(handle);

    expect(verifySnapshot(snap.path).ok).toBe(false);
  });

  test('rejects a file that is not there', () => {
    expect(verifySnapshot(path.join(backupDir(), 'nope.db')).ok).toBe(false);
  });
});

describe('rotation', () => {
  test('keeps only the most recent snapshots', () => {
    seed(2);
    for (let i = 0; i < KEEP_SNAPSHOTS + 4; i += 1) writeSnapshot();
    expect(listSnapshots().length).toBeLessThanOrEqual(KEEP_SNAPSHOTS);
  });

  test('lists newest first, so recovery reaches for the right one', () => {
    const snaps = listSnapshots();
    for (let i = 1; i < snaps.length; i += 1) {
      expect(snaps[i - 1].takenAt).toBeGreaterThanOrEqual(snaps[i].takenAt);
    }
  });
});

describe('the opportunistic path', () => {
  /**
   * maybeSnapshot runs inside claim and settle. If it can throw, a failed
   * backup takes down the payout that triggered it — which inverts the
   * priorities exactly: the operator's tokens are the urgent thing.
   */
  test('never throws, even pointed at a directory it cannot write', () => {
    const previous = process.env.OSR_DATA_DIR;
    process.env.OSR_DATA_DIR = path.join(DATA_DIR, 'nested', '\0invalid');
    setProtocolValue('last_backup_at', '0');
    expect(() => maybeSnapshot()).not.toThrow();
    process.env.OSR_DATA_DIR = previous;
  });

  test('does nothing when a snapshot is not yet due', () => {
    seed(2);
    writeSnapshot();
    const count = listSnapshots().length;
    maybeSnapshot();
    expect(listSnapshots().length).toBe(count);
  });

  test('takes one when the interval has elapsed', () => {
    seed(2);
    writeSnapshot();
    const count = listSnapshots().length;
    setProtocolValue('last_backup_at', '0');
    maybeSnapshot();
    expect(listSnapshots().length).toBeGreaterThanOrEqual(Math.min(count + 1, KEEP_SNAPSHOTS));
  });
});
