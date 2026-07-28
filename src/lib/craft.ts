// Crafting, server-side.
//
// The recipe table is in lib/crafting and is zero-import so both halves read it.
// This is the half that OWNS the transaction: what wood is actually spent, what
// comes back, and the fact that neither happens without the other.
//
// It is server-owned for the same reason felling is. Wood is contested — not
// between players, but between crafts: a client that decided for itself what it
// had spent could craft an ironbark crossbow out of pine and the only evidence
// would be an inventory that quietly stopped adding up.
//
// WHERE THE OUTPUT GOES depends on what it is, and the split is not arbitrary:
//
//   AXES are a LADDER, not an item. Only the best one matters and you never
//   hold two, so they live in users.axe_id exactly as a bought axe does — which
//   means crafting one and buying one are indistinguishable afterwards, and the
//   two routes to a rung stay genuinely equivalent.
//
//   CROSSBOWS go in the pack, and are therefore droppable on death. See the
//   note on CARRIABLE in lib/packs: a weapon that survived dying would be the
//   one thing with no downside to bringing, so everybody would always carry
//   their best and ammunition scarcity would be the only brake left.
//
//   AMMUNITION and MATERIALS go in the pack too, as stacks.

import { getDb } from './db';
import { GameError } from './errors';
import { addXp } from './progression';
import { recordQuestProgress } from './quests';
import { addToPack, packContentsOf, packStepOf } from './expedition';
import { packHasRoom } from './packs';
import { AXES, type AxeId } from './woodcutting';
import {
  RECIPES,
  canCraft,
  recipeById,
  spendPlan,
  type LogRef,
  type Recipe,
} from './crafting';

/** Logs this wallet is carrying, as the count-per-ref `canCraft` expects. */
export function logsHeld(wallet: string): Partial<Record<LogRef, number>> {
  const held: Partial<Record<LogRef, number>> = {};
  for (const stack of packContentsOf(wallet)) {
    if (stack.ref.startsWith('log-')) {
      held[stack.ref as LogRef] = (held[stack.ref as LogRef] ?? 0) + stack.quantity;
    }
  }
  return held;
}

/**
 * Everything this wallet counts as owning for a `requires` check.
 *
 * The axe ladder is cumulative: holding a Splitting Axe means you have been
 * through the Felling Axe, so every rung at or below the one you carry counts.
 * Without that, selling somebody a better axe would BREAK their ability to craft
 * — which is the sort of rule that only shows up as a bug report.
 */
export function toolsOf(wallet: string): string[] {
  const row = getDb()
    .prepare('SELECT axe_id FROM users WHERE wallet = ?')
    .get(wallet) as unknown as { axe_id: string | null } | undefined;
  const owned = row?.axe_id && row.axe_id in AXES ? (row.axe_id as AxeId) : null;
  const tools: string[] = [];
  if (owned) {
    const tier = AXES[owned].tier;
    for (const axe of Object.values(AXES)) if (axe.tier <= tier) tools.push(axe.id);
  }
  // Crossbows are carried, so a `requires` on one reads the pack.
  for (const stack of packContentsOf(wallet)) {
    if (stack.kind === 'weapon') tools.push(stack.ref);
  }
  return tools;
}

export interface CraftableView extends Recipe {
  ok: boolean;
  reason: string | null;
  /** What it would cost right now, so a bench can show it before committing. */
  plan: Array<{ ref: LogRef; quantity: number }>;
}

/**
 * Already own this, or better?
 *
 * Only axes, because only axes are a ladder where holding one rung implies
 * every rung below. Testing found the hole: crafting a Felling Axe while
 * carrying a Splitting Axe spent twenty logs, correctly refused to downgrade the
 * tool, and gave nothing back. The no-downgrade guard was right and the offer
 * should never have been made — a bench that sells you something you own is
 * a bench that takes your wood for a lesson.
 *
 * Refusing here rather than in lib/crafting because that module is zero-import
 * and does not know what an axe tier is; this one already reads AXES.
 */
function alreadyOwned(recipe: Recipe, wallet: string): string | null {
  if (recipe.kind !== 'axe') return null;
  const row = getDb()
    .prepare('SELECT axe_id FROM users WHERE wallet = ?')
    .get(wallet) as unknown as { axe_id: string | null } | undefined;
  const owned = row?.axe_id && row.axe_id in AXES ? AXES[row.axe_id as AxeId] : null;
  const making = AXES[recipe.id as AxeId];
  if (!owned || !making || owned.tier < making.tier) return null;
  return `You already carry a ${owned.name}.`;
}

/** The bench, as this wallet sees it. Every recipe, with its verdict. */
export function benchFor(wallet: string): CraftableView[] {
  const held = logsHeld(wallet);
  const tools = toolsOf(wallet);
  return RECIPES.map((recipe) => {
    const owned = alreadyOwned(recipe, wallet);
    if (owned) return { ...recipe, ok: false, reason: owned, plan: [] };
    const check = canCraft(recipe.id, { held, tools });
    return { ...recipe, ok: check.ok, reason: check.reason, plan: spendPlan(recipe, held) };
  });
}

export interface CraftResult {
  recipe: string;
  name: string;
  spent: Array<{ ref: LogRef; quantity: number }>;
  yielded: number;
  xp: number;
}

/**
 * Make the thing.
 *
 * Every refusal happens BEFORE anything is written, so a rejected craft leaves
 * the player exactly as they were. The spend and the award are one transaction
 * for the obvious reason: a failure between them either eats the wood or mints
 * the item for free, and both are worse than not crafting.
 */
export function craftItem(wallet: string, recipeId: string): CraftResult {
  const recipe = recipeById(recipeId);
  if (!recipe) throw new GameError('No such recipe.', 404);

  // Before anything else: do not sell somebody what they already carry.
  const owned = alreadyOwned(recipe, wallet);
  if (owned) throw new GameError(owned, 400);

  const held = logsHeld(wallet);
  const check = canCraft(recipe.id, { held, tools: toolsOf(wallet) });
  if (!check.ok) throw new GameError(check.reason ?? 'You cannot make that yet.', 400);

  const plan = spendPlan(recipe, held);
  // canCraft already said there is enough, so an empty plan here means the two
  // disagree — which is a bug, not a player error, and must not be swallowed.
  if (plan.length === 0) throw new GameError('Could not work out what to spend.', 500);

  const yielded = recipe.yields ?? 1;
  const db = getDb();

  /*
   * Room for what comes back, before spending what goes in.
   *
   * An axe takes no pack space — it is a ladder, not an item — so this only
   * applies to the things that do. Crafting into a full pack and dropping the
   * result would spend the wood for nothing.
   */
  if (recipe.kind !== 'axe') {
    const incoming = { kind: packKind(recipe), ref: recipe.id, quantity: yielded } as const;
    if (!packHasRoom(packStepOf(wallet), packContentsOf(wallet), incoming)) {
      throw new GameError('Your pack is full.', 400);
    }
  }

  db.exec('BEGIN IMMEDIATE');
  try {
    for (const line of plan) {
      // Conditional on the quantity still being there. Two crafts arriving
      // together would otherwise both pass the check above and both spend the
      // same logs, which is the same race the tree claim guards against.
      const spent = db
        .prepare(
          `UPDATE pack_contents SET quantity = quantity - ?
             WHERE wallet = ? AND ref = ? AND quantity >= ?`
        )
        .run(line.quantity, wallet, line.ref, line.quantity);
      if (Number(spent.changes) === 0) {
        throw new GameError('Your wood changed while that was in flight — try again.', 409);
      }
    }

    if (recipe.kind === 'axe') {
      /*
       * Never downgrade.
       *
       * Conditional on the current axe being worse, so crafting a Felling Axe
       * while carrying a Splitting one is a no-op rather than a demotion. A
       * player who does that by accident has wasted wood; one whose better axe
       * was silently replaced has lost hours.
       */
      const tier = AXES[recipe.id as AxeId]?.tier ?? 0;
      const worse = Object.values(AXES).filter((a) => a.tier < tier).map((a) => a.id);
      db.prepare(
        `UPDATE users SET axe_id = ?
           WHERE wallet = ? AND (axe_id IS NULL OR axe_id IN (${worse.map(() => '?').join(',') || "''"}))`
      ).run(recipe.id, wallet, ...worse);
    }

    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }

  // Outside the transaction: addToPack goes through the CARRIABLE allowlist,
  // which is the one place that decides what a player can lose, and it must not
  // be bypassed by an inline INSERT for the sake of one commit boundary.
  if (recipe.kind !== 'axe') {
    addToPack(wallet, { kind: packKind(recipe), ref: recipe.id, quantity: yielded });
  }

  addXp(wallet, 'scouting', recipe.xp);
  recordQuestProgress(wallet, 'craft_item');

  return { recipe: recipe.id, name: recipe.name, spent: plan, yielded, xp: recipe.xp };
}

/** Which carry class a recipe's output belongs to. */
function packKind(recipe: Recipe): 'weapon' | 'ammo' | 'material' {
  if (recipe.kind === 'crossbow') return 'weapon';
  if (recipe.kind === 'ammo') return 'ammo';
  return 'material';
}
