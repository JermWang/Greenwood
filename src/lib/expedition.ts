// The server side of going outside: buying and upgrading a pack, being allowed
// through a gate, and reading a loot pile.
//
// lib/regions, lib/packs and lib/loot are all pure — tables and rules with no
// database in the way, so they can be asserted without a fixture and re-used by
// the client for an optimistic pass. This module is where they meet state, and
// it is the only place any of it is authoritative.
//
// The rule this file exists to enforce, above everything else: a client asking
// "what is in that pile" gets an answer computed from ITS OWN recorded position,
// never from a position it supplied. A route that trusts a posted coordinate has
// no proximity rule at all — it has a suggestion.

import { getDb } from './db';
import { GameError } from './errors';
import { spendScrip } from './scrip';
import { recordQuestProgress } from './quests';
import { progressionOf } from './progression';
import { canEnter, regionById, arrivalCellFor, type EntryCheck, type Region } from './regions';
import { isWalkable } from './deep-forest-map';
import {
  CREATURES,
  PLAYER_REACH,
  UNARMED_DAMAGE,
  spawnById,
  spawns,
  tilesApart,
  type CreatureKind,
  type Spawn,
} from './creatures';
import { DEV_WALLET_BYPASS } from './dev-mode';
import { isDemoWallet } from './demo';
import {
  assertCanUpgradePack,
  hasPack,
  packSlots,
  packTier,
  packUsage,
  isCarriable,
  NOT_CARRIABLE,
  NO_PACK,
  type CarriedStack,
  type PackTier,
} from './packs';
import {
  hasExpired,
  pilesVisibleTo,
  takeFromPile,
  visibleTo,
  type LootPile,
  type VisiblePile,
} from './loot';

// ---------------------------------------------------------------------------
// The pack
// ---------------------------------------------------------------------------

export function packStepOf(wallet: string): number {
  const row = getDb()
    .prepare('SELECT pack_step FROM users WHERE wallet = ?')
    .get(wallet) as { pack_step: number } | undefined;
  return row?.pack_step ?? NO_PACK;
}

export function packContentsOf(wallet: string): CarriedStack[] {
  const rows = getDb()
    .prepare('SELECT kind, ref, quantity FROM pack_contents WHERE wallet = ? AND quantity > 0')
    .all(wallet) as unknown as Array<{ kind: string; ref: string; quantity: number }>;
  // Filtered through the allowlist on the way out as well as on the way in. A
  // row whose kind stopped being carriable — because the list was tightened
  // after it was written — must not keep travelling just because it is already
  // in the table.
  return rows
    .filter((row) => isCarriable(row.kind))
    .map((row) => ({ kind: row.kind, ref: row.ref, quantity: row.quantity }) as CarriedStack);
}

export interface PackState {
  step: number;
  name: string | null;
  slots: number;
  used: number;
  free: number;
  contents: CarriedStack[];
  /** Null at the ceiling. */
  nextTier: PackTier | null;
}

export function packStateOf(wallet: string): PackState {
  const step = packStepOf(wallet);
  const contents = packContentsOf(wallet);
  const usage = packUsage(step, contents);
  const tier = packTier(step);
  return {
    step,
    name: tier?.name ?? null,
    slots: usage.slots,
    used: usage.used,
    free: usage.free,
    contents,
    nextTier: packTier(step + 1),
  };
}

/**
 * Buy the first pack, or the next step up. One entry point for both, because
 * they are the same transaction — the ladder starts at step 1 and the initial
 * purchase is simply the move from 0 to 1.
 */
export function upgradePack(wallet: string): { step: number; tier: PackTier } {
  const step = packStepOf(wallet);
  const tier = assertCanUpgradePack(step);

  spendScrip(wallet, tier.scripCost, `pack:${tier.name.toLowerCase().replace(/\s+/g, '-')}`);

  // Before the write rather than after, so the Scrip that has just been spent
  // and the progress it earned cannot end up on opposite sides of a failure.
  // recordQuestProgress never throws — it swallows its own errors precisely so
  // that bookkeeping can never cost somebody the purchase that triggered it.
  recordQuestProgress(wallet, 'buy_pack');

  const result = getDb()
    .prepare('UPDATE users SET pack_step = ? WHERE wallet = ? AND pack_step = ?')
    .run(tier.step, wallet, step);
  // Conditional on the step not having moved: two upgrade requests arriving
  // together would otherwise both pass the check above and both charge, buying
  // one tier twice. Scrip has already been spent at this point, so a no-op here
  // is a genuine error rather than something to swallow.
  if (Number(result.changes) === 0) {
    throw new GameError('Your pack changed while that was in flight — try again.', 409);
  }
  return { step: tier.step, tier };
}

// ---------------------------------------------------------------------------
// Gates
// ---------------------------------------------------------------------------

/**
 * The level of this fund's best desk.
 *
 * MAX rather than a sum or an average, because the gate it feeds is asking
 * whether the fund can carry a bad run — and one strong desk can, where six weak
 * ones spread across the same capital budget cannot. Using a total would also
 * make the requirement satisfiable by opening more desks, which is a different
 * decision the game already prices separately (see lib/capital).
 *
 * Zero for a fund with no desks at all, which is the correct answer rather than
 * a missing one.
 */
export function bestDeskLevel(wallet: string): number {
  const row = getDb()
    .prepare('SELECT MAX(level) AS level FROM nodes WHERE wallet = ?')
    .get(wallet) as { level: number | null } | undefined;
  return row?.level ?? 0;
}

/**
 * May this wallet enter this region right now?
 *
 * Reads the level, the desks and the pack from the database rather than
 * accepting them, which is the entire point — `canEnter` is pure so the client
 * can grey out a gate before the round trip, but the client's answer is a
 * courtesy and this one is the fact.
 */
export function entryCheckFor(wallet: string, regionId: string): EntryCheck {
  const check = canEnter(regionId, {
    totalLevel: progressionOf(wallet).totalLevel,
    hasPack: hasPack(packStepOf(wallet)),
    bestDeskLevel: bestDeskLevel(wallet),
  });

  /**
   * The dev bypass opens gates as well as skipping sign-in.
   *
   * It has to be here rather than only in the page, because the page is not the
   * only thing that asks: every step posts through assertMayEnter, so a client
   * that the UI let in would have had every one of its moves rejected. A gate
   * that two layers disagree about is worse than either answer.
   *
   * DEV_WALLET_BYPASS is false in every production build and on every deployed
   * environment — see lib/dev-mode for the conditions — so this cannot open a
   * real gate.
   */
  if (!check.allowed && DEV_WALLET_BYPASS) {
    return { allowed: true, reason: null, code: 'ok' };
  }

  /*
   * A demo can walk anywhere.
   *
   * The point of the demo is to SEE the game, and a gate that hides two thirds
   * of it behind ten levels of progression is a gate that hides two thirds of
   * the reason anybody would play. Levels still accrue and the introduction
   * still runs — nothing is handed over — but the doors are open.
   *
   * Safe because a demo account is not competing with anyone: it holds no key,
   * cannot sign, and every financial path is gated behind a signature it cannot
   * produce. What it can do is die in the Deep Forest and lose fake Scrip, which
   * is exactly the experience being demonstrated.
   */
  if (!check.allowed && isDemoWallet(wallet)) {
    return { allowed: true, reason: null, code: 'ok' };
  }
  return check;
}

/** Throwing form, for routes. */
export function assertMayEnter(wallet: string, regionId: string): Region {
  const check = entryCheckFor(wallet, regionId);
  if (!check.allowed) {
    throw new GameError(check.reason ?? 'You cannot go that way.', check.code === 'unknown-region' ? 404 : 403);
  }
  return regionById(regionId)!;
}

// ---------------------------------------------------------------------------
// Where a player is standing
// ---------------------------------------------------------------------------

/**
 * The server's record of where a wallet is.
 *
 * Every loot read below resolves proximity against THIS, never against a
 * coordinate in the request body. A route that trusts a posted position does not
 * have a proximity rule, it has a suggestion.
 *
 * Returns null when the wallet has not moved since the server last restarted,
 * and the read paths fail closed on null — no known position means nothing is
 * readable, which is the safe direction to be wrong in.
 */
export function positionOf(wallet: string): { x: number; z: number } | null {
  const row = readState(wallet);
  return row.x == null || row.z == null ? null : { x: row.x, z: row.z };
}

/**
 * Session state lives in SQLite, not in module memory.
 *
 * The obvious call was a Map: position changes on every step, health on every
 * hit, and neither survives a session — exactly the profile that says do not
 * touch disk. That was right about the data and wrong about the runtime. Next
 * bundles each route handler separately, so a module-level Map in this file is a
 * DIFFERENT Map for /expedition/step than it is for /expedition/state. A player
 * would move successfully and then be told to take a step first when they tried
 * to attack, because the attack route had never seen them move.
 *
 * SQLite here is local and synchronous, and these are single-row upserts. The
 * cost is nothing; the correctness is the whole feature.
 */
function readState(wallet: string): { x: number | null; z: number | null; health: number } {
  const row = getDb()
    .prepare('SELECT x, z, health FROM expedition_state WHERE wallet = ?')
    .get(wallet) as { x: number | null; z: number | null; health: number } | undefined;
  return row ?? { x: null, z: null, health: MAX_HEALTH };
}

function writePosition(wallet: string, at: { x: number; z: number }): void {
  getDb()
    .prepare(
      `INSERT INTO expedition_state (wallet, x, z, health) VALUES (?,?,?,?)
         ON CONFLICT(wallet) DO UPDATE SET x = excluded.x, z = excluded.z`
    )
    .run(wallet, at.x, at.z, MAX_HEALTH);
}

/**
 * Max health. One number, so nothing has to ask what full means.
 */
export const MAX_HEALTH = 100;

/** Health. Absent means full, so "never hurt" and "healed" are one state. */

export function healthOf(wallet: string): number {
  return readState(wallet).health;
}

/** Clamped both ends: nothing overheals, and nothing goes negative. */
export function setHealth(wallet: string, value: number): number {
  const next = Math.max(0, Math.min(MAX_HEALTH, Math.round(value)));
  getDb()
    .prepare(
      `INSERT INTO expedition_state (wallet, health) VALUES (?,?)
         ON CONFLICT(wallet) DO UPDATE SET health = excluded.health`
    )
    .run(wallet, next);
  return next;
}

/**
 * Accept a step, or refuse it.
 *
 * This is the authority the whole zone rests on, and it validates two things:
 *
 *   REACHABILITY — a step must be to an adjacent tile. Without this a client
 *   could teleport across the map to a loot pile, read it, and teleport back,
 *   which would make the proximity rule decorative.
 *
 *   TERRAIN — the destination must be walkable according to lib/deep-forest-map,
 *   the same module the renderer draws from. That shared definition is what lets
 *   the server say "you walked through a tree" at all; while the map lived
 *   inside the scene component, the server could not see a single one.
 *
 * Returns the position the server believes, which is not always the one that was
 * asked for. The client should reconcile to it rather than assume it won.
 */
export function stepTo(
  wallet: string,
  to: { x: number; z: number }
): { position: { x: number; z: number }; accepted: boolean } {
  const target = { x: Math.round(to.x), z: Math.round(to.z) };
  if (!Number.isFinite(target.x) || !Number.isFinite(target.z)) {
    throw new GameError('invalid position', 400);
  }

  // First step of a session anchors at the region's spawn rather than wherever
  // the client says it is, so a fresh connection cannot choose its entry point.
  //
  // The step is then judged FROM that spawn rather than rejected outright. An
  // early version returned here, which anchored correctly and made the player's
  // first click do nothing at all — they clicked, the character stood still, and
  // only the second click moved them. Anchoring is bookkeeping; it should not
  // cost the player an action.
  const from = positionOf(wallet) ?? arrivalCellFor(regionById('deep-forest')!);
  writePosition(wallet, from);

  const reachable = Math.max(Math.abs(target.x - from.x), Math.abs(target.z - from.z)) <= 1;
  if (!reachable || !isWalkable(target.x, target.z)) {
    return { position: from, accepted: false };
  }

  writePosition(wallet, target);
  return { position: target, accepted: true };
}


// ---------------------------------------------------------------------------
// Piles
// ---------------------------------------------------------------------------

function rowToPile(row: {
  id: string;
  region_id: string;
  x: number;
  z: number;
  dropped_by: string;
  dropped_at: number;
  contents: string;
}): LootPile {
  let contents: CarriedStack[] = [];
  try {
    const parsed = JSON.parse(row.contents) as unknown;
    if (Array.isArray(parsed)) contents = parsed as CarriedStack[];
  } catch {
    // A pile whose JSON will not parse is an empty pile, not a crash. Losing
    // one pile's contents is recoverable; taking the region's loot read down
    // with it is not.
  }
  return {
    id: row.id,
    regionId: row.region_id,
    x: row.x,
    z: row.z,
    droppedBy: row.dropped_by,
    droppedAt: row.dropped_at,
    contents,
  };
}

function pilesIn(regionId: string): LootPile[] {
  const rows = getDb()
    .prepare('SELECT * FROM loot_piles WHERE region_id = ?')
    .all(regionId) as unknown as Parameters<typeof rowToPile>[0][];
  return rows.map(rowToPile);
}

/**
 * Every pile in a region, as this wallet is allowed to see it.
 *
 * The position comes from `positionOf`, not from the caller. A wallet whose
 * position is unknown sees every pile's location and no pile's contents, which
 * is exactly what a player who has not moved yet should see.
 */
export function visiblePiles(wallet: string, regionId: string, now = Date.now()): VisiblePile[] {
  const viewer = positionOf(wallet) ?? { x: Infinity, z: Infinity };
  return pilesVisibleTo(pilesIn(regionId), viewer, now);
}

/** One pile, stripped to what this wallet may know about it. */
export function visiblePile(wallet: string, pileId: string, now = Date.now()): VisiblePile | null {
  const row = getDb().prepare('SELECT * FROM loot_piles WHERE id = ?').get(pileId) as
    | Parameters<typeof rowToPile>[0]
    | undefined;
  if (!row) return null;
  const pile = rowToPile(row);
  if (hasExpired(pile, now)) return null;
  return visibleTo(pile, positionOf(wallet) ?? { x: Infinity, z: Infinity });
}

/**
 * Take from a pile into a pack.
 *
 * Refuses outright unless the wallet is close enough to READ the pile. Looting
 * something you were never allowed to see the contents of would make the
 * proximity rule cosmetic — a client could take blind from across the map and
 * find out what it got afterwards, which is strictly better than walking over.
 */
export function lootPile(
  wallet: string,
  pileId: string,
  wanted: CarriedStack[],
  now = Date.now()
): { taken: CarriedStack[]; full: boolean } {
  const db = getDb();
  const row = db.prepare('SELECT * FROM loot_piles WHERE id = ?').get(pileId) as
    | Parameters<typeof rowToPile>[0]
    | undefined;
  if (!row) throw new GameError('There is nothing here.', 404);

  const pile = rowToPile(row);
  if (hasExpired(pile, now)) throw new GameError('There is nothing here.', 404);

  const viewer = positionOf(wallet);
  if (!viewer || !visibleTo(pile, viewer).readable) {
    throw new GameError('You are not close enough to that.', 403);
  }

  for (const stack of wanted) {
    if (!isCarriable(stack.kind)) {
      throw new GameError(NOT_CARRIABLE[stack.kind] ?? 'That cannot be carried.', 400);
    }
  }

  const step = packStepOf(wallet);
  if (!hasPack(step)) throw new GameError('You have nothing to carry that in.', 400);

  const carried = packContentsOf(wallet);
  const result = takeFromPile(pile, wanted, { slots: packSlots(step), carried });
  if (result.taken.length === 0) return { taken: [], full: result.full };

  // BEGIN IMMEDIATE / COMMIT / ROLLBACK by hand, matching lib/market — the
  // node:sqlite DatabaseSync has no transaction() wrapper.
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const stack of result.taken) {
      db.prepare(
        `INSERT INTO pack_contents (wallet, kind, ref, quantity) VALUES (?,?,?,?)
           ON CONFLICT(wallet, kind, ref) DO UPDATE SET quantity = quantity + excluded.quantity`
      ).run(wallet, stack.kind, stack.ref, stack.quantity);
    }
    if (result.remaining.length === 0) {
      // Conditional on the pile still holding what we read, for the same reason
      // as the UPDATE below: if someone emptied it in between, deleting here
      // would erase whatever they had already put back.
      const cleared = db
        .prepare('DELETE FROM loot_piles WHERE id = ? AND contents = ?')
        .run(pileId, row.contents);
      if (Number(cleared.changes) === 0) throw new GameError('Someone else got to it first.', 409);
    } else {
      // Conditional on the contents not having changed underneath us. Two
      // players looting the same pile at once would otherwise each write their
      // own view of the remainder, and the loser's write would restore what the
      // winner took.
      const updated = db
        .prepare('UPDATE loot_piles SET contents = ? WHERE id = ? AND contents = ?')
        .run(JSON.stringify(result.remaining), pileId, row.contents);
      if (Number(updated.changes) === 0) {
        throw new GameError('Someone else got to it first.', 409);
      }
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  return { taken: result.taken, full: result.full };
}

// ---------------------------------------------------------------------------
// Creatures
// ---------------------------------------------------------------------------

/**
 * Creature health and swing timers, in SQLite for the same reason player state
 * is: /expedition/attack and /expedition/state are separate bundles, and a
 * creature killed through one would still be alive to the other.
 *
 * A missing row means untouched and at full health, so a wiped table simply
 * repopulates the forest rather than leaving a map of corpses nobody can clear.
 */
function readCreature(id: string): { health: number | null; swung_at: number } {
  const row = getDb()
    .prepare('SELECT health, swung_at FROM creature_state WHERE spawn_id = ?')
    .get(id) as { health: number; swung_at: number } | undefined;
  return row ?? { health: null, swung_at: 0 };
}

export interface CreatureView {
  id: string;
  kind: CreatureKind;
  x: number;
  z: number;
  seed: number;
  health: number;
  maxHealth: number;
  /** Hunting once it has noticed the player. Drives the model's animation. */
  hunting: boolean;
  dead: boolean;
}

export function creatureHealth(spawn: Spawn): number {
  return readCreature(spawn.id).health ?? CREATURES[spawn.kind].maxHealth;
}

/**
 * Every creature, as this player sees it right now.
 *
 * `hunting` is computed from distance rather than stored: aggro that persists in
 * a map would need clearing on disconnect, on death, and on leaving the zone,
 * and forgetting any one of those leaves a creature permanently angry at
 * somebody who logged off a week ago.
 */
export function creaturesFor(wallet: string): CreatureView[] {
  const at = positionOf(wallet);
  return spawns().map((spawn) => {
    const def = CREATURES[spawn.kind];
    const health = creatureHealth(spawn);
    const dist = at ? tilesApart(at.x, at.z, spawn.x, spawn.z) : Infinity;
    return {
      id: spawn.id,
      kind: spawn.kind,
      x: spawn.x,
      z: spawn.z,
      seed: spawn.seed,
      health,
      maxHealth: def.maxHealth,
      hunting: health > 0 && dist <= def.senses,
      dead: health <= 0,
    };
  });
}

/**
 * Swing at a creature.
 *
 * Range is checked against the SERVER's idea of where the player is, never a
 * posted coordinate — the same rule loot proximity follows, and for the same
 * reason: a client that can claim a position can claim to be next to anything.
 *
 * The counter-attack is resolved here too rather than on a tick. A creature that
 * only hurts you on a timer somewhere else would let a player trade a hit and
 * step away inside the gap; making the exchange atomic means committing to a
 * swing is committing to being hit back.
 */
export function attackCreature(wallet: string, spawnId: string, now = Date.now()) {
  assertMayEnter(wallet, 'deep-forest');

  const spawn = spawnById(spawnId);
  if (!spawn) throw new GameError('There is nothing there.', 404);

  const at = positionOf(wallet);
  if (!at) throw new GameError('Take a step first.', 409);
  if (tilesApart(at.x, at.z, spawn.x, spawn.z) > PLAYER_REACH) {
    throw new GameError('Too far away.', 403);
  }

  const def = CREATURES[spawn.kind];
  const before = creatureHealth(spawn);
  if (before <= 0) throw new GameError('It is already dead.', 400);

  const after = Math.max(0, before - UNARMED_DAMAGE);
  getDb()
    .prepare(
      `INSERT INTO creature_state (spawn_id, health) VALUES (?,?)
         ON CONFLICT(spawn_id) DO UPDATE SET health = excluded.health`
    )
    .run(spawn.id, after);

  // It hits back, unless it is dead or has swung too recently.
  let took = 0;
  let died: DeathResult | null = null;
  if (after > 0) {
    const last = readCreature(spawn.id).swung_at;
    if (now - last >= def.cadence * 1000) {
      getDb()
        .prepare('UPDATE creature_state SET swung_at = ? WHERE spawn_id = ?')
        .run(now, spawn.id);
      took = def.damage;
      // Through damage() rather than setHealth, so a bite that takes the last
      // point kills exactly the way a player's swing does — one definition of
      // dying, not two that drift.
      died = damage(wallet, took, now).died;
    }
  }

  return {
    creature: { id: spawn.id, health: after, maxHealth: def.maxHealth, dead: after <= 0 },
    dealt: UNARMED_DAMAGE,
    took,
    health: healthOf(wallet),
    /** Named so the client can show what dropped without a second lookup. */
    drop: after <= 0 ? def.drop : null,
    /** Set when that bite killed you. The pack is already on the ground. */
    died,
  };
}

// ---------------------------------------------------------------------------
// Other players, and dying
// ---------------------------------------------------------------------------

export interface PlayerView {
  wallet: string;
  x: number;
  z: number;
  health: number;
  maxHealth: number;
}

/**
 * Everyone else standing in the zone.
 *
 * Read straight from expedition_state, which already records a position per
 * wallet — presence needed no new channel, only a query that does not filter to
 * one row.
 *
 * Deliberately unfiltered by distance. Fog already decides what a player can
 * actually see, and a server-side visibility cone would be a second, subtly
 * different answer to the same question — the kind of mismatch that makes one
 * client swear somebody was there and another swear they were not. Positions in
 * a PvP zone are public; what is private is loot contents, which has its own
 * proximity rule.
 */
export function playersIn(exclude: string): PlayerView[] {
  const rows = getDb()
    .prepare(
      'SELECT wallet, x, z, health FROM expedition_state WHERE wallet != ? AND x IS NOT NULL'
    )
    .all(exclude) as unknown as Array<{ wallet: string; x: number; z: number; health: number }>;
  return rows
    .filter((r) => r.health > 0)
    .map((r) => ({ wallet: r.wallet, x: r.x, z: r.z, health: r.health, maxHealth: MAX_HEALTH }));
}

export interface DeathResult {
  /** Where the pack spilled. Null when there was nothing to drop. */
  pileId: string | null;
  dropped: CarriedStack[];
  respawn: { x: number; z: number };
}

/**
 * Die: spill the pack, empty it, and go back to the gate.
 *
 * This is the moment the entire zone is built around, so the order matters. The
 * pile is written FIRST and the pack emptied second, inside one transaction —
 * reversed, a failure between the two would delete a player's cargo without
 * leaving anything on the ground for the person who earned it.
 *
 * Only the pack spills. Desks, fitted instruments, BNTY, Notes and cosmetics are
 * not carriable, so they are not here to lose; that is the whole safety model,
 * and it holds because `CARRIABLE` is an allowlist rather than a filter applied
 * at this call site.
 */
export function killPlayer(wallet: string, now = Date.now()): DeathResult {
  const db = getDb();
  const at = positionOf(wallet) ?? arrivalCellFor(regionById('deep-forest')!);
  const carried = packContentsOf(wallet);
  const respawn = arrivalCellFor(regionById('deep-forest')!);
  // Tile plus timestamp: two players dying on one tile minutes apart must not
  // collide on a primary key, and a pile id has to survive a despawn sweep.
  const pileId = carried.length > 0 ? `${at.x}:${at.z}:${now}` : null;

  db.exec('BEGIN IMMEDIATE');
  try {
    if (pileId) {
      db.prepare(
        `INSERT INTO loot_piles (id, region_id, x, z, dropped_by, dropped_at, contents)
         VALUES (?,?,?,?,?,?,?)`
      ).run(pileId, 'deep-forest', at.x, at.z, wallet, now, JSON.stringify(carried));
      db.prepare('DELETE FROM pack_contents WHERE wallet = ?').run(wallet);
    }
    db.prepare(
      `INSERT INTO expedition_state (wallet, x, z, health) VALUES (?,?,?,?)
         ON CONFLICT(wallet) DO UPDATE SET x = excluded.x, z = excluded.z, health = excluded.health`
    ).run(wallet, respawn.x, respawn.z, MAX_HEALTH);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  return { pileId, dropped: carried, respawn };
}

/**
 * Apply damage, and kill if it lands.
 *
 * One place, so a creature bite and a player's swing cannot end up with
 * different ideas of what dying means.
 */
export function damage(wallet: string, amount: number, now = Date.now()) {
  const left = setHealth(wallet, healthOf(wallet) - amount);
  return left <= 0 ? { health: MAX_HEALTH, died: killPlayer(wallet, now) } : { health: left, died: null };
}

/**
 * Attack another player.
 *
 * No consent check and no flag: entering the Deep Forest IS the consent, which
 * is why the region carries `pvp` and why the gate says so on the way in. A
 * separate opt-in on top would mean a zone that is only dangerous to people who
 * agreed twice.
 */
export function attackPlayer(wallet: string, targetWallet: string, now = Date.now()) {
  assertMayEnter(wallet, 'deep-forest');
  if (wallet === targetWallet) throw new GameError('You cannot attack yourself.', 400);

  const me = positionOf(wallet);
  if (!me) throw new GameError('Take a step first.', 409);

  const them = positionOf(targetWallet);
  if (!them) throw new GameError('They are not out here.', 404);
  if (healthOf(targetWallet) <= 0) throw new GameError('They are already down.', 400);
  if (tilesApart(me.x, me.z, them.x, them.z) > PLAYER_REACH) {
    throw new GameError('Too far away.', 403);
  }

  const result = damage(targetWallet, UNARMED_DAMAGE, now);
  return {
    target: targetWallet,
    dealt: UNARMED_DAMAGE,
    targetHealth: result.health,
    killed: result.died !== null,
    /** What they dropped, so the killer knows a pile is there without polling. */
    pileId: result.died?.pileId ?? null,
  };
}
