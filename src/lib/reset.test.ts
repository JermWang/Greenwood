// The reset is only worth having if it is COMPLETE.
//
// The bug this guards against already happened: the wipe carried a hand-written
// list of ten tables, the schema grew to twenty-two, and twelve tables quietly
// survived a "fresh start" — including every player's levels, cosmetics and
// carried instruments. Nobody removed a table from the list; the list simply
// stopped being extended while the schema kept moving.
//
// So the test that matters is not "does DELETE work". It is: does every table
// in the schema have a decided fate, and does a wipe actually leave nothing
// behind. Both are checked against the REAL schema rather than a fixture, so
// adding a table to lib/db and forgetting about the reset fails here.
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'osr-reset-'));
process.env.OSR_DATA_DIR = DATA_DIR;
delete process.env.VERCEL;

const { getDb, setProtocolValue, getProtocolValue } = await import('./db');
const { resetGameState, resetTargets, RESET_KEEP_TABLES, RESET_KEEP_PROTOCOL, RESET_COUNTERS } =
  await import('./reset');

/** Every table the schema actually has, from the database lib/db just built. */
function schemaTables(): string[] {
  return (
    getDb()
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all() as Array<{ name: string }>
  )
    .map((r) => r.name)
    .sort();
}

beforeAll(() => {
  getDb();
});

afterAll(() => {
  // Best-effort: Windows keeps the SQLite handle open past teardown, and the
  // directory is under the OS temp root either way.
  try {
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
  } catch {
    /* the OS will reclaim it */
  }
});

describe('what a reset decides about', () => {
  test('every table in the schema is either wiped or deliberately kept', () => {
    const all = schemaTables();
    const { wipe, keep } = resetTargets(getDb());
    expect([...wipe, ...keep].sort()).toEqual(all);
  });

  /*
   * The inverted default in one assertion.
   *
   * A table added to lib/db tomorrow lands in `wipe` without anybody touching
   * this module — which is the entire reason the list is of things to KEEP.
   */
  test('a table nobody has heard of is wiped, not spared', () => {
    getDb().exec('CREATE TABLE IF NOT EXISTS a_table_added_next_month (x TEXT)');
    try {
      expect(resetTargets(getDb()).wipe).toContain('a_table_added_next_month');
    } finally {
      getDb().exec('DROP TABLE a_table_added_next_month');
    }
  });

  test('every kept table carries a reason', () => {
    for (const [table, reason] of Object.entries(RESET_KEEP_TABLES)) {
      expect(reason.length, `${table} is kept without saying why`).toBeGreaterThan(10);
    }
  });

  test('every kept protocol key carries a reason', () => {
    for (const [key, reason] of Object.entries(RESET_KEEP_PROTOCOL)) {
      expect(reason.length, `${key} is kept without saying why`).toBeGreaterThan(10);
    }
  });

  /*
   * The two lists must not overlap, or the intent is ambiguous: a counter that
   * is both zeroed and preserved would depend on statement order to decide
   * which won.
   */
  test('no protocol key is both zeroed and kept', () => {
    for (const counter of RESET_COUNTERS) {
      expect(RESET_KEEP_PROTOCOL[counter], `${counter} is both zeroed and kept`).toBeUndefined();
    }
  });
});

describe('what a reset actually leaves behind', () => {
  test('nothing, in any table the schema has', () => {
    const db = getDb();
    // Seed the four tables that USED to survive a wipe. They are the specific
    // regression: levels, cosmetics, quest progress and a carried pack.
    db.prepare('INSERT INTO users (wallet, osr_balance, created_at, last_seen) VALUES (?,?,?,?)').run(
      '0xabc',
      5000,
      Date.now(),
      Date.now()
    );
    db.prepare('INSERT INTO xp_tracks (wallet, track, xp) VALUES (?,?,?)').run('0xabc', 'wood', 999);
    db.prepare(
      'INSERT INTO cosmetics_owned (wallet, cosmetic_key, paid_currency, paid_amount, acquired_at) VALUES (?,?,?,?,?)'
    ).run('0xabc', 'hard-hat', 'scrip', 100, Date.now());
    db.prepare('INSERT INTO cosmetics_equipped (wallet, slot, cosmetic_key, equipped_at) VALUES (?,?,?,?)').run(
      '0xabc',
      'avatar',
      'hard-hat',
      Date.now()
    );
    db.prepare('INSERT INTO daily_quests (wallet, day, quest_key, progress) VALUES (?,?,?,?)').run(
      '0xabc',
      20671,
      'chop',
      3
    );
    db.prepare('INSERT INTO pack_contents (wallet, kind, ref, quantity) VALUES (?,?,?,?)').run(
      '0xabc',
      'log',
      'oak',
      12
    );

    resetGameState(db, Date.now());

    for (const table of resetTargets(db).wipe) {
      const n = Number(
        (db.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get() as { n: number }).n
      );
      expect(n, `${table} still has rows after a reset`).toBe(0);
    }
  });

  test('the emission clock restarts rather than carrying on', () => {
    const db = getDb();
    setProtocolValue('genesisMs', '1');
    const at = 1_800_000_000_000;
    resetGameState(db, at);
    expect(getProtocolValue('genesisMs')).toBe(String(at));
  });

  test('the counters go to zero, including the one the old list missed', () => {
    const db = getDb();
    for (const counter of RESET_COUNTERS) setProtocolValue(counter, '12345');
    resetGameState(db, Date.now());
    for (const counter of RESET_COUNTERS) {
      expect(getProtocolValue(counter), `${counter} was not zeroed`).toBe('0');
    }
  });

  /*
   * An operator who paused payouts before wiping meant it. A reset that
   * silently resumed them would start a fresh game paying out on a schedule
   * nobody re-checked.
   */
  test('a deliberate payout pause survives', () => {
    const db = getDb();
    setProtocolValue('payouts_paused', '1');
    setProtocolValue('payouts_paused_reason', 'relaunch in progress');
    resetGameState(db, Date.now());
    expect(getProtocolValue('payouts_paused')).toBe('1');
    expect(getProtocolValue('payouts_paused_reason')).toBe('relaunch in progress');
  });

  test('game state in protocol does not survive', () => {
    const db = getDb();
    setProtocolValue('crates_found_day_20671', '7');
    setProtocolValue('walkthrough_backfilled', '1');
    resetGameState(db, Date.now());
    expect(getProtocolValue('crates_found_day_20671')).toBeNull();
    expect(getProtocolValue('walkthrough_backfilled')).toBeNull();
  });
});
