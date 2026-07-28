// Felling a tree, server-side.
//
// THE SERVER OWNS THIS BECAUSE IT IS CONTESTED. Two players can reach for the
// same ironbark, and the one who gets there first should be the one who gets it.
// Everything below is validated against what the SERVER computes the world to
// be, never against a coordinate or a species in a request body.
//
// The design that makes it cheap: a standing tree has NO ROW. Its position comes
// from the map module and its species from lib/woodcutting, both pure functions
// of the coordinate — so the only thing worth storing is the exception, which is
// the handful that have been cut and have not grown back. `tree_state` is a list
// of stumps, not a copy of the forest.

import { getDb } from './db';
import { GameError } from './errors';
import { addXp } from './progression';
import { recordQuestProgress } from './quests';
import { addToPack, packContentsOf, packStepOf } from './expedition';
import { packHasRoom } from './packs';
import { spendScrip } from './scrip';
import { isWalkable as forestWalkable, propAt as forestPropAt } from './deep-forest-map';
import { isWalkable as groundsWalkable, propAt as groundsPropAt } from './grounds-map';
import { isWalkable as treelineWalkable, propAt as treelinePropAt } from './treeline-map';
import {
  AXES,
  SPECIES,
  canFell,
  chopReward,
  CHOP_REACH,
  hasRegrown,
  speciesAt,
  treeId,
  type AxeId,
  type SpeciesId,
} from './woodcutting';

/** The axe this wallet owns, if any. */
export function axeOf(wallet: string): AxeId | null {
  const row = getDb()
    .prepare('SELECT axe_id FROM users WHERE wallet = ?')
    .get(wallet) as unknown as { axe_id: string | null } | undefined;
  const id = row?.axe_id;
  return id && id in AXES ? (id as AxeId) : null;
}

/**
 * Is there a tree standing on this tile, in this region?
 *
 * Asks the region's own map module rather than a table. Only the outdoor regions
 * have trees; anywhere else the honest answer is no, and returning null is what
 * stops a client claiming to have felled something in the Machine Room.
 */
export function treeStanding(region: string, x: number, z: number): SpeciesId | null {
  const prop =
    region === 'deep-forest'
      ? forestPropAt(x, z)
      : region === 'grounds'
        ? groundsPropAt(x, z)
        : region === 'treeline'
          ? treelinePropAt(x, z)
          : null;
  if (!prop) return null;
  // Boulders and planters are not trees. The map's own kind is the authority on
  // what a prop IS; woodcutting only decides what species a tree happens to be.
  if (prop.kind !== 'tree') return null;
  return speciesAt(region, x, z);
}

/** Can a player stand next to this tile at all? Used to reject unreachable trees. */
function reachable(region: string, x: number, z: number): boolean {
  const walk =
    region === 'deep-forest'
      ? forestWalkable
      : region === 'grounds'
        ? groundsWalkable
        : region === 'treeline'
          ? treelineWalkable
          : null;
  if (!walk) return false;
  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dz = -1; dz <= 1; dz += 1) {
      if (!dx && !dz) continue;
      if (walk(x + dx, z + dz)) return true;
    }
  }
  return false;
}

interface StumpRow {
  tree_id: string;
  felled_at: number;
}

/** Stumps in a rectangle, so the renderer can draw the ones that are down. */
export function stumpsIn(
  region: string,
  now = Date.now()
): Array<{ id: string; x: number; z: number }> {
  const rows = getDb()
    .prepare('SELECT tree_id, felled_at FROM tree_state WHERE tree_id LIKE ?')
    .all(`${region}:%`) as unknown as StumpRow[];
  const out: Array<{ id: string; x: number; z: number }> = [];
  for (const row of rows) {
    const [, sx, sz] = row.tree_id.split(':');
    const x = Number(sx);
    const z = Number(sz);
    const species = speciesAt(region, x, z);
    if (hasRegrown(species, row.felled_at, now)) continue;
    out.push({ id: row.tree_id, x, z });
  }
  return out;
}

/** Is this particular tree currently a stump? */
export function isStump(region: string, x: number, z: number, now = Date.now()): boolean {
  const row = getDb()
    .prepare('SELECT felled_at FROM tree_state WHERE tree_id = ?')
    .get(treeId(region, x, z)) as unknown as { felled_at: number } | undefined;
  if (!row) return false;
  return !hasRegrown(speciesAt(region, x, z), row.felled_at, now);
}

export interface ChopResult {
  species: SpeciesId;
  logs: number;
  xp: number;
  ref: string;
  /** When this stump comes back, so the client can count down honestly. */
  regrowsAt: number;
}

/**
 * Fell a tree.
 *
 * Order matters and is deliberate: every refusal is checked BEFORE anything is
 * written, so a rejected chop leaves the world exactly as it was. The reasons
 * are separate messages rather than one "you cannot do that" because each of
 * them tells the player a different thing to go and fix.
 */
export function chopTree(
  wallet: string,
  region: string,
  x: number,
  z: number,
  at: { x: number; z: number },
  now = Date.now()
): ChopResult {
  const gx = Math.round(x);
  const gz = Math.round(z);

  // Standing next to it. Checked against the position the CALLER claims, which
  // is safe only because that position came from expedition state — see the
  // route, which reads it server-side rather than trusting the body.
  if (Math.max(Math.abs(at.x - gx), Math.abs(at.z - gz)) > CHOP_REACH) {
    throw new GameError('You are not close enough to that tree.', 400);
  }

  const species = treeStanding(region, gx, gz);
  if (!species) throw new GameError('There is no tree there.', 404);
  if (!reachable(region, gx, gz)) throw new GameError('You cannot get to that tree.', 400);
  if (isStump(region, gx, gz, now)) throw new GameError('That one is already down.', 409);

  const axe = axeOf(wallet);
  if (!axe) throw new GameError('You need an axe before you can fell anything.', 400);
  if (!canFell(axe, species)) {
    throw new GameError(
      `${AXES[axe].name} will not cut ${SPECIES[species].name}. You need something heavier.`,
      400
    );
  }

  const reward = chopReward(species);

  // Room BEFORE the swing. Felling a tree and dropping the logs because the pack
  // was full would spend the respawn timer for nothing, and the player would
  // have no way to know why.
  const incoming = { kind: 'salvage' as const, ref: reward.ref, quantity: reward.logs };
  if (!packHasRoom(packStepOf(wallet), packContentsOf(wallet), incoming)) {
    throw new GameError('Your pack is full.', 400);
  }

  const db = getDb();
  const id = treeId(region, gx, gz);

  /*
   * The claim, as one conditional write.
   *
   * Two players swinging at the same ironbark in the same tick would otherwise
   * both pass every check above and both be paid. The INSERT is guarded on there
   * being no live stump for this tree, so exactly one of them writes the row and
   * the other is told it is already down.
   *
   * `ON CONFLICT ... WHERE` re-felling an already-regrown stump is the normal
   * case, not an error — the row is reused rather than a second one written.
   */
  const claimed = db
    .prepare(
      `INSERT INTO tree_state (tree_id, felled_at, felled_by) VALUES (?,?,?)
         ON CONFLICT(tree_id) DO UPDATE SET felled_at = excluded.felled_at, felled_by = excluded.felled_by
         WHERE ? - tree_state.felled_at >= ?`
    )
    .run(id, now, wallet, now, SPECIES[species].respawn * 1000);

  if (Number(claimed.changes) === 0) {
    throw new GameError('Somebody got there first.', 409);
  }

  addToPack(wallet, incoming);

  // Scouting rather than a fifth track. MAX_TRACK_LEVEL equals MAX_TOTAL_LEVEL,
  // so a new track would make Total Level cheaper to raise and quietly loosen
  // every region gate in the game.
  addXp(wallet, 'scouting', reward.xp);
  recordQuestProgress(wallet, 'chop_tree', reward.logs);

  return {
    species,
    logs: reward.logs,
    xp: reward.xp,
    ref: reward.ref,
    regrowsAt: now + SPECIES[species].respawn * 1000,
  };
}

/**
 * Buy the first axe, or the next one up.
 *
 * One entry point for both, the same way packs work — the ladder starts at the
 * Hatchet and the initial purchase is simply the move from nothing to tier 1.
 */
export function buyAxe(wallet: string, target: AxeId): { axe: AxeId; spent: number } {
  const want = AXES[target];
  if (!want) throw new GameError('No such axe.', 404);

  const owned = axeOf(wallet);
  if (owned && AXES[owned].tier >= want.tier) {
    throw new GameError(`You already carry a ${AXES[owned].name}.`, 400);
  }
  // One rung at a time, so the ladder cannot be skipped by anybody who happens
  // to be holding enough Scrip. The cost curve assumes every rung was paid for.
  const nextTier = (owned ? AXES[owned].tier : 0) + 1;
  if (want.tier !== nextTier) {
    throw new GameError('You need the next axe up before that one.', 400);
  }

  spendScrip(wallet, want.scripCost, `axe:${want.id}`);

  const result = getDb()
    .prepare('UPDATE users SET axe_id = ? WHERE wallet = ?')
    .run(want.id, wallet);
  if (Number(result.changes) === 0) throw new GameError('No such fund.', 404);

  return { axe: want.id, spent: want.scripCost };
}
