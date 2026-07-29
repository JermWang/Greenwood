// Migrating an EXISTING database, which is the only place this bug can live.
//
// The rest of the suite builds a fresh database from the current schema, where
// the new allocation names are simply correct and nothing can be caught. The
// failure being guarded here only exists on an install that predates the
// rename: `CREATE TABLE IF NOT EXISTS` leaves the old CHECK constraint in
// place, so the code inserts 'equity_allocation' into a table that still only
// permits 'rig_crate', and every allocation a player earns dies on a constraint
// that is not visible anywhere in the source.
//
// So this builds the OLD schema by hand, runs the migration against it, and
// asserts both halves: the constraint moved AND the rows came with it.

import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';

/** The crates table exactly as it shipped before the rename. */
const OLD_SCHEMA = `
  CREATE TABLE users (wallet TEXT PRIMARY KEY);
  CREATE TABLE crates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet TEXT NOT NULL REFERENCES users(wallet),
    crate_type TEXT NOT NULL CHECK (crate_type IN ('rig_crate','shaft_crate')),
    found_at INTEGER NOT NULL,
    found_node_id INTEGER,
    opened_at INTEGER,
    result_rarity TEXT,
    result_slot TEXT,
    seen_at INTEGER,
    listing_id INTEGER
  );
`;

/**
 * The migration under test, inlined.
 *
 * db.ts is not importable here — it resolves a data directory and opens a real
 * file on import — and extracting the function for the test would be worse than
 * copying it: the point is to verify the SQL, and SQL that has been refactored
 * to be testable is no longer the SQL that runs. The guard below keeps the two
 * from drifting.
 */
function renameAllocationKinds(db: DatabaseSync) {
  const row = db
    .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'crates'`)
    .get() as { sql: string } | undefined;
  if (!row?.sql || row.sql.includes("'equity_allocation'")) return;

  db.exec('PRAGMA foreign_keys = OFF;');
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec(`
      CREATE TABLE crates_migrated (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        wallet TEXT NOT NULL REFERENCES users(wallet),
        crate_type TEXT NOT NULL CHECK (crate_type IN ('equity_allocation','treasury_allocation')),
        found_at INTEGER NOT NULL,
        found_node_id INTEGER,
        opened_at INTEGER,
        result_rarity TEXT,
        result_slot TEXT,
        seen_at INTEGER,
        listing_id INTEGER
      );
      INSERT INTO crates_migrated
        SELECT id, wallet,
               CASE crate_type
                 WHEN 'rig_crate' THEN 'equity_allocation'
                 WHEN 'shaft_crate' THEN 'treasury_allocation'
                 ELSE crate_type
               END,
               found_at, found_node_id, opened_at, result_rarity, result_slot,
               seen_at, listing_id
          FROM crates;
      DROP TABLE crates;
      ALTER TABLE crates_migrated RENAME TO crates;
      CREATE INDEX IF NOT EXISTS idx_crates_wallet ON crates(wallet, opened_at);
    `);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  } finally {
    db.exec('PRAGMA foreign_keys = ON;');
  }
}

function seeded() {
  const db = new DatabaseSync(':memory:');
  db.exec(OLD_SCHEMA);
  db.prepare('INSERT INTO users (wallet) VALUES (?)').run('0xabc');
  const insert = db.prepare(
    'INSERT INTO crates (wallet, crate_type, found_at, opened_at, result_rarity) VALUES (?,?,?,?,?)'
  );
  insert.run('0xabc', 'rig_crate', 1, null, null);
  insert.run('0xabc', 'rig_crate', 2, 5, 'rare');
  insert.run('0xabc', 'shaft_crate', 3, null, null);
  return db;
}

describe('renaming the allocation kinds on an existing database', () => {
  it('rewrites every stored value', () => {
    const db = seeded();
    renameAllocationKinds(db);
    const rows = db.prepare('SELECT crate_type, COUNT(*) n FROM crates GROUP BY crate_type').all();
    expect(rows).toEqual([
      { crate_type: 'equity_allocation', n: 2 },
      { crate_type: 'treasury_allocation', n: 1 },
    ]);
  });

  /** The actual bug: the constraint has to move, not just the data. */
  it('lets the new names be inserted afterwards', () => {
    const db = seeded();
    renameAllocationKinds(db);
    expect(() =>
      db.prepare('INSERT INTO crates (wallet, crate_type, found_at) VALUES (?,?,?)').run('0xabc', 'equity_allocation', 9)
    ).not.toThrow();
  });

  it('still refuses a kind that is not one of the two', () => {
    const db = seeded();
    renameAllocationKinds(db);
    expect(() =>
      db.prepare('INSERT INTO crates (wallet, crate_type, found_at) VALUES (?,?,?)').run('0xabc', 'rig_crate', 9)
    ).toThrow();
  });

  /**
   * Nothing is lost in the swap — not the ids, not the opened history.
   * A crate carries a rarity somebody paid for; losing one to a rename is
   * indistinguishable from theft.
   */
  it('preserves ids and opened history', () => {
    const db = seeded();
    const before = db.prepare('SELECT id, found_at, opened_at, result_rarity FROM crates ORDER BY id').all();
    renameAllocationKinds(db);
    const after = db.prepare('SELECT id, found_at, opened_at, result_rarity FROM crates ORDER BY id').all();
    expect(after).toEqual(before);
  });

  it('is a no-op the second time, so booting twice is safe', () => {
    const db = seeded();
    renameAllocationKinds(db);
    const first = db.prepare('SELECT * FROM crates ORDER BY id').all();
    renameAllocationKinds(db);
    expect(db.prepare('SELECT * FROM crates ORDER BY id').all()).toEqual(first);
  });

  /**
   * The copy above must stay identical to the one that actually runs.
   * A test asserting SQL that has drifted from production SQL is worse than no
   * test, because it reports success about something that is not deployed.
   */
  it('matches the migration db.ts actually runs', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const source = readFileSync(join(__dirname, 'db.ts'), 'utf8');
    for (const fragment of [
      "WHEN 'rig_crate' THEN 'equity_allocation'",
      "WHEN 'shaft_crate' THEN 'treasury_allocation'",
      "crate_type IN ('equity_allocation','treasury_allocation')",
      'ALTER TABLE crates_migrated RENAME TO crates',
    ]) {
      expect(source.includes(fragment), `db.ts no longer contains: ${fragment}`).toBe(true);
    }
  });
});
