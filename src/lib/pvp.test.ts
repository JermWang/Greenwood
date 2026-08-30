// PvP, and the rule the whole zone rests on: you lose what you carried, and
// nothing else.
//
// These are the assertions worth having. A bug in reach is annoying; a bug that
// deletes a pack without leaving a pile, or that takes something out of a
// player's fund, is the kind that ends a game's reputation.
import { describe, test, expect, beforeEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'eg-pvp-test-'));
process.env.OSR_DATA_DIR = DATA_DIR;
delete process.env.VERCEL;

const {
  attackPlayer,
  killPlayer,
  playersIn,
  positionOf,
  healthOf,
  setHealth,
  packContentsOf,
  MAX_HEALTH,
} = await import('./expedition');
const { UNARMED_DAMAGE } = await import('./creatures');
const { arrivalCellFor, regionById } = await import('./regions');
const { getDb } = await import('./db');
const { getOrCreateUser } = await import('./game');
const { addXp, cumulativeXpFor } = await import('./progression');

const A = '0x7a3b9c1d4e5f60718293a4b5c6d7e8f901234567';
const B = '0x1111111111111111111111111111111111111111';
const SPAWN = arrivalCellFor(regionById('deep-forest')!);

/**
 * Everything the Deep Forest's gate asks for: the level, a desk, and a pack.
 *
 * All three, because canEnter checks all three and these tests are about what
 * happens INSIDE the zone — a fixture that only half-qualifies turns every one
 * of them into a test of the gate instead.
 */
function qualify(w: string) {
  getOrCreateUser(w);
  addXp(w, 'operations', cumulativeXpFor(10));
  getDb().prepare('UPDATE users SET pack_step = 1 WHERE wallet = ?').run(w);
  // A desk at the region's minDeskLevel. Read from the table rather than
  // hardcoded, so retuning the gate does not silently stop these qualifying.
  const need = regionById('deep-forest')!.minDeskLevel;
  getDb()
    .prepare(
      `INSERT INTO nodes (wallet, family, level, created_at, last_claim_at, accrued, accrued_updated_at)
         VALUES (?, 'mine', ?, 0, 0, 0, 0)`
    )
    .run(w, need);
}

function placeAt(w: string, x: number, z: number, health = MAX_HEALTH) {
  getDb()
    .prepare(
      `INSERT INTO expedition_state (wallet, x, z, health) VALUES (?,?,?,?)
         ON CONFLICT(wallet) DO UPDATE SET x = excluded.x, z = excluded.z, health = excluded.health`
    )
    .run(w, x, z, health);
}

function carry(w: string, ref: string, quantity = 1, kind = 'salvage') {
  getDb()
    .prepare('INSERT INTO pack_contents (wallet, kind, ref, quantity) VALUES (?,?,?,?)')
    .run(w, kind, ref, quantity);
}

beforeEach(() => {
  const db = getDb();
  db.exec('DELETE FROM loot_piles');
  db.exec('DELETE FROM pack_contents');
  db.exec('DELETE FROM expedition_state');
  db.exec('DELETE FROM xp_tracks');
  // Before users: nodes carry a foreign key to it, and leaving them behind
  // would let one test's desks satisfy the next test's gate.
  db.exec('DELETE FROM nodes');
  db.exec('DELETE FROM users');
  qualify(A);
  qualify(B);
});

describe('presence', () => {
  test('shows other players in the zone but never yourself', () => {
    placeAt(A, 5, 5);
    placeAt(B, 6, 5);
    expect(playersIn(A).map((p) => p.wallet)).toEqual([B]);
    expect(playersIn(B).map((p) => p.wallet)).toEqual([A]);
  });

  test('omits players who have never entered', () => {
    placeAt(A, 5, 5);
    expect(playersIn(A)).toHaveLength(0);
  });

  test('reports positions without a distance filter', () => {
    // Fog decides what is visible. A second server-side visibility rule would be
    // a subtly different answer to the same question, and the mismatch is what
    // makes one client swear somebody was there and another swear they were not.
    placeAt(A, 0, 0);
    placeAt(B, 40, 40);
    expect(playersIn(A)).toHaveLength(1);
  });
});

describe('striking another player', () => {
  test('refuses from out of reach', () => {
    placeAt(A, 0, 0);
    placeAt(B, 9, 9);
    expect(() => attackPlayer(A, B)).toThrow(/Too far/);
  });

  test('refuses a target who is not in the zone', () => {
    placeAt(A, 0, 0);
    expect(() => attackPlayer(A, B)).toThrow(/not out here/);
  });

  test('refuses attacking yourself', () => {
    placeAt(A, 0, 0);
    expect(() => attackPlayer(A, A)).toThrow(/yourself/);
  });

  test('lands from an adjacent tile and takes health', () => {
    placeAt(A, 0, 0);
    placeAt(B, 1, 1);
    const r = attackPlayer(A, B);
    expect(r.dealt).toBe(UNARMED_DAMAGE);
    expect(r.targetHealth).toBe(MAX_HEALTH - UNARMED_DAMAGE);
    expect(r.killed).toBe(false);
  });

  test('needs no consent flag — entering the zone is the consent', () => {
    // If this ever starts requiring an opt-in, the Deep Forest becomes a zone
    // that is only dangerous to people who agreed twice.
    placeAt(A, 0, 0);
    placeAt(B, 1, 0);
    expect(() => attackPlayer(A, B)).not.toThrow();
  });
});

describe('dying', () => {
  test('spills the pack as a pile where you fell', () => {
    placeAt(B, 12, -14);
    carry(B, 'generator-core', 2);
    carry(B, 'cable', 5);

    const result = killPlayer(B, 1_700_000_000_000);
    expect(result.pileId).toBeTruthy();

    const pile = getDb()
      .prepare('SELECT x, z, contents, dropped_by FROM loot_piles WHERE id = ?')
      .get(result.pileId!) as { x: number; z: number; contents: string; dropped_by: string };
    expect(pile.x).toBe(12);
    expect(pile.z).toBe(-14);
    expect(pile.dropped_by).toBe(B);
    expect(JSON.parse(pile.contents)).toHaveLength(2);
  });

  test('empties the pack, so nothing is duplicated', () => {
    placeAt(B, 3, 3);
    carry(B, 'scrap', 4);
    killPlayer(B);
    expect(packContentsOf(B)).toHaveLength(0);
  });

  test('leaves no pile when the pack was empty', () => {
    // An empty pile is litter: it draws a player across open ground for nothing,
    // which is worse than no marker at all.
    placeAt(B, 3, 3);
    const result = killPlayer(B);
    expect(result.pileId).toBeNull();
    expect(getDb().prepare('SELECT COUNT(*) AS n FROM loot_piles').get()).toEqual({ n: 0 });
  });

  test('respawns at the gate on full health', () => {
    placeAt(B, 30, -30, 4);
    const result = killPlayer(B);
    expect(result.respawn).toEqual(SPAWN);
    expect(positionOf(B)).toEqual(SPAWN);
    expect(healthOf(B)).toBe(MAX_HEALTH);
  });

  test('never touches anything that is not in the pack', () => {
    // The safety model in one test. Only pack_contents may change; the fund's
    // balance, its desks and its cosmetics are not carriable, so they are not
    // here to lose.
    placeAt(B, 3, 3);
    carry(B, 'scrap', 1);
    const before = getOrCreateUser(B).osr_balance;
    const packStep = (getDb().prepare('SELECT pack_step FROM users WHERE wallet = ?').get(B) as { pack_step: number }).pack_step;

    killPlayer(B);

    expect(getOrCreateUser(B).osr_balance).toBe(before);
    // The pack itself survives: it is part of you, not cargo.
    expect(
      (getDb().prepare('SELECT pack_step FROM users WHERE wallet = ?').get(B) as { pack_step: number }).pack_step
    ).toBe(packStep);
  });

  test('a killing blow reports the pile to the killer', () => {
    placeAt(A, 0, 0);
    placeAt(B, 1, 0, UNARMED_DAMAGE);
    carry(B, 'pelt', 3);

    const r = attackPlayer(A, B);
    expect(r.killed).toBe(true);
    expect(r.pileId).toBeTruthy();
    expect(packContentsOf(B)).toHaveLength(0);
    expect(positionOf(B)).toEqual(SPAWN);
  });

  test('health floors at zero rather than going negative', () => {
    placeAt(B, 3, 3, 5);
    setHealth(B, -40);
    expect(healthOf(B)).toBe(0);
  });
});
