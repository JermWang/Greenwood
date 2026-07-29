// Combat: range, damage, the counter-attack, and death.
//
// Own SQLite file via OSR_DATA_DIR, matching the other engine tests.
import { describe, test, expect, beforeEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-combat-test-'));
process.env.OSR_DATA_DIR = DATA_DIR;
delete process.env.VERCEL;

const { spawns, CREATURES, UNARMED_DAMAGE } = await import('./creatures');
const { attackCreature, creaturesFor, healthOf, setHealth, stepTo, positionOf, MAX_HEALTH } =
  await import('./expedition');
const { getDb } = await import('./db');
const { getOrCreateUser } = await import('./game');
const { addXp, cumulativeXpFor } = await import('./progression');
const { regionById } = await import('./regions');

const W = '0x7a3b9c1d4e5f60718293a4b5c6d7e8f901234567';
const target = spawns()[0];

/** Put the player on a tile without walking there. */
function placeAt(x: number, z: number) {
  getDb()
    .prepare(
      `INSERT INTO expedition_state (wallet, x, z, health) VALUES (?,?,?,?)
         ON CONFLICT(wallet) DO UPDATE SET x = excluded.x, z = excluded.z`
    )
    .run(W, x, z, MAX_HEALTH);
}

beforeEach(() => {
  const db = getDb();
  db.exec('DELETE FROM creature_state');
  db.exec('DELETE FROM expedition_state');
  // Before users, which nodes reference.
  db.exec('DELETE FROM nodes');
  db.exec('DELETE FROM users');
  db.exec('DELETE FROM xp_tracks');
  getOrCreateUser(W);
  // Qualify for the zone honestly rather than reaching past the gate: the level,
  // a desk and a pack are exactly what a real player needs, so these tests fail
  // if the entry rules change out from under combat.
  const forest = regionById('deep-forest')!;
  addXp(W, 'operations', cumulativeXpFor(forest.minTotalLevel));
  db.prepare('UPDATE users SET pack_step = 1 WHERE wallet = ?').run(W);
  db.prepare(
    `INSERT INTO nodes (wallet, family, level, created_at, last_claim_at, accrued, accrued_updated_at)
       VALUES (?, 'mine', ?, 0, 0, 0, 0)`
  ).run(W, forest.minDeskLevel);
});

describe('reach', () => {
  test('refuses a swing from across the map', () => {
    placeAt(0, 0);
    expect(() => attackCreature(W, target.id)).toThrow(/Too far/);
  });

  test('refuses before the player has a known position', () => {
    // Fail closed. A client with no recorded position could otherwise claim to
    // be standing anywhere.
    expect(() => attackCreature(W, target.id)).toThrow(/Take a step/);
  });

  test('refuses a creature that does not exist', () => {
    placeAt(target.x, target.z);
    expect(() => attackCreature(W, '9999:9999')).toThrow(/nothing there/);
  });

  test('allows a swing from an adjacent tile, diagonals included', () => {
    placeAt(target.x + 1, target.z + 1);
    expect(() => attackCreature(W, target.id)).not.toThrow();
  });
});

describe('trading blows', () => {
  test('takes health off the creature', () => {
    placeAt(target.x, target.z + 1);
    const def = CREATURES[target.kind];
    const r = attackCreature(W, target.id);
    expect(r.dealt).toBe(UNARMED_DAMAGE);
    expect(r.creature.health).toBe(def.maxHealth - UNARMED_DAMAGE);
  });

  test('hits back on the same call', () => {
    // The exchange is atomic on purpose: if the counter-attack ran on a separate
    // tick, a player could swing and step out inside the gap and never be hit.
    placeAt(target.x, target.z + 1);
    const r = attackCreature(W, target.id);
    expect(r.took).toBe(CREATURES[target.kind].damage);
    expect(r.health).toBe(MAX_HEALTH - r.took);
  });

  test('respects the creature cadence rather than hitting every swing', () => {
    placeAt(target.x, target.z + 1);
    const t = 1_000_000;
    const first = attackCreature(W, target.id, t);
    const second = attackCreature(W, target.id, t + 10);
    expect(first.took).toBeGreaterThan(0);
    expect(second.took).toBe(0);

    const later = attackCreature(W, target.id, t + CREATURES[target.kind].cadence * 1000 + 5);
    expect(later.took).toBeGreaterThan(0);
  });

  test('kills it, and a corpse cannot be hit again', () => {
    placeAt(target.x, target.z + 1);
    const def = CREATURES[target.kind];
    let last = null as ReturnType<typeof attackCreature> | null;
    for (let i = 0; i < Math.ceil(def.maxHealth / UNARMED_DAMAGE); i += 1) {
      // Health floors at 0 rather than going negative, so this cannot run away.
      setHealth(W, MAX_HEALTH);
      last = attackCreature(W, target.id, 1_000_000 + i * 10_000);
    }
    expect(last!.creature.dead).toBe(true);
    expect(last!.creature.health).toBe(0);
    expect(last!.drop).toBe(def.drop);
    expect(() => attackCreature(W, target.id)).toThrow(/already dead/);
  });

  test('a dead creature stops hitting back', () => {
    placeAt(target.x, target.z + 1);
    const def = CREATURES[target.kind];
    getDb()
      .prepare('INSERT INTO creature_state (spawn_id, health) VALUES (?,?)')
      .run(target.id, UNARMED_DAMAGE);
    const r = attackCreature(W, target.id);
    expect(r.creature.dead).toBe(true);
    expect(r.took).toBe(0);
    expect(r.health).toBe(MAX_HEALTH);
    expect(def.maxHealth).toBeGreaterThan(0);
  });
});

describe('what the player sees', () => {
  test('marks a creature as hunting only once it is within its senses', () => {
    const def = CREATURES[target.kind];
    placeAt(target.x + def.senses + 4, target.z);
    expect(creaturesFor(W).find((c) => c.id === target.id)!.hunting).toBe(false);

    placeAt(target.x + 1, target.z);
    expect(creaturesFor(W).find((c) => c.id === target.id)!.hunting).toBe(true);
  });

  test('never reports a dead creature as hunting', () => {
    placeAt(target.x + 1, target.z);
    getDb().prepare('INSERT INTO creature_state (spawn_id, health) VALUES (?,0)').run(target.id);
    const view = creaturesFor(W).find((c) => c.id === target.id)!;
    expect(view.dead).toBe(true);
    expect(view.hunting).toBe(false);
  });
});

describe('state crosses route boundaries', () => {
  /**
   * The bug this exists for: position and health lived in module-level Maps, and
   * Next bundles each route handler separately — so /step wrote to one Map and
   * /state read a different one. A player moved successfully and was then told
   * to take a step first when they tried to attack.
   */
  test('a step is visible to a later read', () => {
    stepTo(W, { x: 0, z: 44 });
    const moved = stepTo(W, { x: 0, z: 43 });
    expect(moved.accepted).toBe(true);
    expect(positionOf(W)).toEqual({ x: 0, z: 43 });
  });

  test('damage is visible to a later read', () => {
    setHealth(W, 40);
    expect(healthOf(W)).toBe(40);
  });
});
