// Wiping the game back to nothing, for a relaunch.
//
// THE DEFAULT IS INVERTED, and that is the whole point of this module existing
// rather than a list living in the route.
//
// It used to be a hand-written array of ten table names. The schema has grown
// to twenty-two, so by the time anyone looked, TWELVE TABLES SURVIVED A RESET:
// xp_tracks, cosmetics_owned, cosmetics_equipped, daily_quests, pack_contents,
// loot_piles, expedition_state, creature_state, tree_state, world_presence,
// rate_limits and protocol. A "fresh start" therefore wiped every desk and
// every balance while leaving each player's levels, cosmetics, quest claims and
// carried instruments in place — pack_contents and loot_piles still pointing at
// rows in a components table that no longer had them.
//
// Nobody forgot on purpose. A list of things to delete is a list somebody has
// to remember to extend, months later, while thinking about a feature. So the
// list is now of things to KEEP: tables are read from sqlite_master at runtime
// and everything not explicitly spared is emptied. A table added next month is
// wiped by default, which is the safe direction for a reset — the failure mode
// becomes "we cleared something we meant to keep", which a backup fixes, rather
// than "a live game launched holding somebody's pre-launch levels", which
// nothing fixes.
//
// The keep lists below are short, and each entry carries the argument for it.
// That is deliberate: an unexplained entry here is how the old list rotted.

import type { DatabaseSync } from 'node:sqlite';

/**
 * Tables the wipe does not empty, and why.
 *
 * `protocol` is not spared, it is HANDLED — see resetProtocol. It holds both
 * game counters that must go to zero and operator settings that must not, so
 * it is the one table cleared key by key rather than wholesale.
 */
export const RESET_KEEP_TABLES: Record<string, string> = {
  protocol: 'mixed game counters and operator settings; cleared per key below',
  // sqlite_sequence is emptied explicitly rather than spared, so a fresh game
  // numbers from 1 instead of continuing the test run's ids.
};

/**
 * Protocol keys that survive a wipe, and why.
 *
 * Everything else in `protocol` is game state and goes. The test for this
 * module asserts that every key the code actually reads is either zeroed by
 * RESET_COUNTERS, rewritten explicitly, or named here.
 */
export const RESET_KEEP_PROTOCOL: Record<string, string> = {
  /*
   * An operator who paused payouts before wiping meant it, and a reset that
   * silently resumed them would start a live game paying out on a schedule
   * nobody re-checked. Un-pausing has to stay a decision somebody makes.
   */
  payouts_paused: 'an operator paused payouts deliberately; a wipe must not resume them',
  payouts_paused_reason: 'the text shown alongside the pause above',
  /** A scheduled maintenance notice outlives the data it was warning about. */
  deploy_notice_started: 'operator notice, unrelated to game state',
  deploy_notice_until: 'operator notice, unrelated to game state',
  /*
   * Backup bookkeeping, and clearing it would be actively harmful: the snapshot
   * scheduler reads this to decide whether one is due, so zeroing it right
   * after the pre-wipe snapshot makes the next request take another.
   */
  last_backup_at: 'backup scheduling, not game state',
};

/**
 * Counters set to '0' rather than deleted.
 *
 * Deleting would work — the readers treat a missing key as zero — but an
 * explicit zero is legible when somebody opens the table after a launch and
 * wants to know whether the reset ran.
 *
 * `stakeCommitted` is here because it was NOT in the old list: the stakes table
 * was emptied while the counter that totals it kept its pre-wipe value, so a
 * fresh game started reporting committed stake nobody held.
 */
export const RESET_COUNTERS = [
  'burned',
  'reserve',
  'treasury',
  'emitted',
  'solRevenue',
  'stakeCommitted',
] as const;

/** What a wipe would empty, and what it would spare, without doing it. */
export function resetTargets(db: DatabaseSync): { wipe: string[]; keep: string[] } {
  const rows = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    .all() as Array<{ name: string }>;
  const names = rows.map((r) => r.name).sort();
  return {
    wipe: names.filter((n) => !RESET_KEEP_TABLES[n]),
    keep: names.filter((n) => Boolean(RESET_KEEP_TABLES[n])),
  };
}

function countRows(db: DatabaseSync, table: string): number {
  try {
    return Number((db.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get() as { n: number }).n);
  } catch {
    return -1;
  }
}

/**
 * Clear `protocol` key by key.
 *
 * Separate from the table wipe because this one table is half game state and
 * half operator settings, and the two must not share a fate.
 */
function resetProtocol(db: DatabaseSync, genesisMs: number): void {
  const keys = (db.prepare('SELECT key FROM protocol').all() as Array<{ key: string }>).map(
    (r) => r.key
  );
  const drop = keys.filter((k) => !RESET_KEEP_PROTOCOL[k]);
  const del = db.prepare('DELETE FROM protocol WHERE key = ?');
  for (const key of drop) del.run(key);

  const set = db.prepare(
    'INSERT INTO protocol (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  );
  for (const counter of RESET_COUNTERS) set.run(counter, '0');
  /*
   * Genesis is rewritten, never merely dropped.
   *
   * The halving curve is measured from it, so a reset that kept the old value
   * would launch the game already part-way down the emission schedule — day one
   * paying at a rate meant for a network weeks old.
   */
  set.run('genesisMs', String(genesisMs));
}

export interface ResetReport {
  /** Row counts per table before the wipe, so the operator sees what went. */
  before: Record<string, number>;
  after: Record<string, number>;
  /** Tables emptied, and tables deliberately spared. */
  wiped: string[];
  kept: string[];
  genesisMs: number;
}

/**
 * Empty the game.
 *
 * Foreign keys are turned OFF around the wipe and back ON after, following the
 * same pattern the migrations in lib/db already use. Twelve REFERENCES clauses
 * mean there is a correct deletion order, and depending on one is exactly the
 * fragility this module exists to remove — the order would need revisiting
 * every time a table gained a parent.
 */
export function resetGameState(db: DatabaseSync, genesisMs: number): ResetReport {
  const { wipe, keep } = resetTargets(db);
  const before: Record<string, number> = {};
  for (const t of [...wipe, ...keep]) before[t] = countRows(db, t);

  db.exec('PRAGMA foreign_keys = OFF;');
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const table of wipe) db.exec(`DELETE FROM "${table}"`);
    try {
      db.exec('DELETE FROM sqlite_sequence');
    } catch {
      /* no sequence table if nothing ever autoincremented */
    }
    resetProtocol(db, genesisMs);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  } finally {
    db.exec('PRAGMA foreign_keys = ON;');
  }

  const after: Record<string, number> = {};
  for (const t of [...wipe, ...keep]) after[t] = countRows(db, t);
  return { before, after, wiped: wipe, kept: keep, genesisMs };
}
