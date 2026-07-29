// Snapshots of the game database.
//
// WHY THIS IS THE MOST IMPORTANT FILE IN THE PROJECT, briefly: users.osr_balance
// is what claimRewards converts into real on-chain tokens. The SQLite file is
// therefore not a cache of the money, it IS the money. Losing it loses every
// operator's holdings; corrupting it mints or destroys them. There is no
// replica, because node:sqlite on a Railway volume is single-instance by
// construction, and until now there was no backup either.
//
// HOW: `VACUUM INTO`, which SQLite performs as a single transaction against a
// consistent view of the database. That matters under WAL, where naively
// copying the file gives you a torn read plus a -wal you may or may not have
// caught up — a backup that looks fine and restores to a database that never
// existed. VACUUM INTO also compacts, so a snapshot is smaller than the source.
//
// EVERY SNAPSHOT IS VERIFIED BEFORE IT COUNTS. An unverified backup is a guess,
// and the moment you discover the guess was wrong is the moment you needed it
// to be right. Verification opens the snapshot read-only, runs integrity_check,
// and confirms the users table survived with at least as many rows as it should
// — a file that passes integrity_check but contains no operators is intact and
// worthless.
//
// WHAT THIS IS NOT: off-box storage. A snapshot beside the database survives
// process death, a bad migration and an accidental wipe; it does not survive
// the volume. Shipping these somewhere else is the remaining half and it is
// deliberately not attempted here, because a half-working uploader that fails
// silently is worse than an obvious gap.

import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { getDb, getProtocolValue, resolveDataDir, setProtocolValue } from './db';

/** How often an opportunistic snapshot is taken. */
export const SNAPSHOT_INTERVAL_MS = Number(process.env.OSR_BACKUP_INTERVAL_MS ?? 6 * 3600 * 1000);

/**
 * How many snapshots to keep.
 *
 * Enough to cover a problem nobody noticed for a few days, which is the realistic
 * case: corruption and bad migrations are usually found later than they happen.
 */
export const KEEP_SNAPSHOTS = Number(process.env.OSR_BACKUP_KEEP ?? 24);

const LAST_KEY = 'last_backup_at';
const PREFIX = 'osr-';
const SUFFIX = '.db';

export function backupDir(): string {
  return path.join(resolveDataDir(), 'backups');
}

/**
 * Whether snapshots are worth taking here.
 *
 * On Vercel the data directory is a per-invocation tmpdir, so a snapshot would
 * be written to storage that evaporates with the request — pure cost, and worse,
 * it would report success. Railway and local both have a real directory.
 */
export function backupsSupported(): boolean {
  return !process.env.VERCEL;
}

export interface Snapshot {
  file: string;
  path: string;
  bytes: number;
  takenAt: number;
}

function parseTakenAt(file: string): number {
  const raw = file.slice(PREFIX.length, file.length - SUFFIX.length);
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

/** Newest first. */
export function listSnapshots(): Snapshot[] {
  const dir = backupDir();
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.startsWith(PREFIX) && f.endsWith(SUFFIX))
    .map((file) => {
      const full = path.join(dir, file);
      return { file, path: full, bytes: fs.statSync(full).size, takenAt: parseTakenAt(file) };
    })
    .sort((a, b) => b.takenAt - a.takenAt);
}

/**
 * Open a snapshot and prove it is usable.
 *
 * Read-only, so a verification pass can never write to the thing it is checking.
 * `expectUsers` guards the failure integrity_check cannot see: a structurally
 * valid database with nothing in it.
 */
export function verifySnapshot(file: string, expectUsers = 0): { ok: boolean; reason: string | null; users: number } {
  let db: DatabaseSync | null = null;
  try {
    db = new DatabaseSync(file, { readOnly: true });
    const integrity = db.prepare('PRAGMA integrity_check').get() as { integrity_check?: string } | undefined;
    if (integrity?.integrity_check !== 'ok') {
      return { ok: false, reason: `integrity_check: ${integrity?.integrity_check ?? 'no result'}`, users: 0 };
    }
    const row = db.prepare('SELECT COUNT(*) n FROM users').get() as { n: number };
    if (row.n < expectUsers) {
      return { ok: false, reason: `expected at least ${expectUsers} operators, found ${row.n}`, users: row.n };
    }
    return { ok: true, reason: null, users: row.n };
  } catch (error) {
    return { ok: false, reason: String(error), users: 0 };
  } finally {
    db?.close();
  }
}

/**
 * Take a snapshot now.
 *
 * Written to a `.partial` name and renamed only once verified, so a crash
 * mid-vacuum leaves an obviously-junk file rather than a plausible-looking
 * backup. rename is atomic within a directory, which is why the temp file lives
 * beside the destination rather than in the system temp dir.
 */
export function writeSnapshot(): Snapshot {
  if (!backupsSupported()) throw new Error('snapshots are not supported on this host');

  const dir = backupDir();
  fs.mkdirSync(dir, { recursive: true });

  const db = getDb();
  const expectUsers = (db.prepare('SELECT COUNT(*) n FROM users').get() as { n: number }).n;

  const takenAt = Date.now();
  const finalPath = path.join(dir, `${PREFIX}${takenAt}${SUFFIX}`);
  const partial = `${finalPath}.partial`;
  if (fs.existsSync(partial)) fs.rmSync(partial);

  // Bound parameter rather than string interpolation: the path contains a
  // Windows drive letter and backslashes, and quoting it by hand is how a
  // backup silently lands somewhere nobody looks.
  db.prepare('VACUUM INTO ?').run(partial);

  const verdict = verifySnapshot(partial, expectUsers);
  if (!verdict.ok) {
    fs.rmSync(partial, { force: true });
    throw new Error(`snapshot failed verification: ${verdict.reason}`);
  }

  fs.renameSync(partial, finalPath);
  setProtocolValue(LAST_KEY, String(takenAt));
  prune();

  return { file: path.basename(finalPath), path: finalPath, bytes: fs.statSync(finalPath).size, takenAt };
}

/** Drop the oldest snapshots past KEEP_SNAPSHOTS, and any stale partials. */
function prune() {
  const dir = backupDir();
  for (const file of fs.readdirSync(dir)) {
    if (file.endsWith('.partial')) {
      const full = path.join(dir, file);
      // Older than an hour means the process that was writing it is long gone.
      if (Date.now() - fs.statSync(full).mtimeMs > 3600_000) fs.rmSync(full, { force: true });
    }
  }
  for (const snapshot of listSnapshots().slice(KEEP_SNAPSHOTS)) {
    fs.rmSync(snapshot.path, { force: true });
  }
}

export function lastSnapshotAt(): number {
  const raw = getProtocolValue(LAST_KEY);
  const n = Number(raw ?? '0');
  return Number.isFinite(n) ? n : 0;
}

/**
 * Snapshot if one is due, and never throw.
 *
 * Called from the money paths, which is the whole design: there is no cron in
 * this app and a `setInterval` in a lib is a different timer per route bundle
 * (see the module-state trap in CLAUDE.md). Hanging it off real activity means
 * a busy game backs itself up and an idle one has nothing worth backing up.
 *
 * The due-check goes through the protocol table rather than a variable for the
 * same bundling reason: every route handler must see the same answer.
 *
 * Swallowing the error is deliberate. A failed backup must never fail the claim
 * that triggered it — the operator's payout is the urgent thing and the backup
 * is the important one, and confusing those costs somebody their tokens.
 */
export function maybeSnapshot(): void {
  if (!backupsSupported()) return;
  try {
    if (Date.now() - lastSnapshotAt() < SNAPSHOT_INTERVAL_MS) return;
    // Claim the slot BEFORE the vacuum. Two concurrent requests would otherwise
    // both see a due backup and both start one.
    setProtocolValue(LAST_KEY, String(Date.now()));
    writeSnapshot();
  } catch (error) {
    console.error('[backup] snapshot failed', error);
  }
}
