// Crafting: what logs are FOR.
//
// NO IMPORTS, the same contract the map modules and lib/woodcutting hold. A
// recipe has to be readable by the client (to show a bench) and by the server
// (to validate a craft), and the two must not be able to disagree about what a
// thing costs.
//
// WHY A LADDER AND NOT A SHOP
//
// Woodcutting without this is a treadmill: logs accumulate, nothing consumes
// them, and the only feedback is a number going up. A gathering skill needs a
// SINK or it stops being a skill and becomes a counter.
//
// The shape mirrors the axe ladder deliberately, because that ladder already
// works: an axe fells its own tier and below, and a recipe needs its own tier
// and above. So the loop closes on itself —
//
//     buy a Hatchet  ->  fell pine  ->  craft a Felling Axe from pine
//                    ->  fell oak   ->  craft a Splitting Axe from oak
//                    ->  fell black pine -> craft an Ironbark Axe from that
//                    ->  fell ironbark   -> craft the Ironbark Crossbow
//
// EVERY RUNG IS MADE FROM WOOD THE RUNG BELOW CAN FELL, and unlocks the tier
// above. That constraint is not obvious and it is easy to get backwards: the
// first draft of this table made the Felling Axe out of OAK, which a Hatchet
// cannot cut — so the ladder had no second rung and the only route up was Scrip,
// which would have made the whole gathering skill decorative. A test caught it
// on its first run and now holds the rule.
//
// Scrip can still buy an axe outright, which matters: a player who would rather
// pay than gather is not locked out, and one who would rather gather than pay is
// not taxed. Two routes to the same rung, priced so neither is obviously right.
//
// WHAT MAKES IRONBARK MATTER
//
// Not price. An expensive material that produces the same object as a cheap one
// is just a longer wait, and players correctly ignore it. Ironbark matters
// because it is the ONLY route to something that does not exist below it — the
// Ironbark Crossbow, and whatever is added at that tier later. Note what this
// means: ironbark is not an ingredient in any AXE, because the axe that fells it
// is the last rung of the ladder. Reaching ironbark is the reward for finishing
// the ladder, and spending it is a separate ambition.

/** Wood, as crafting sees it. Mirrors SpeciesId in lib/woodcutting. */
export type LogRef =
  | 'log-pine'
  | 'log-birch'
  | 'log-oak'
  | 'log-blackpine'
  | 'log-ironbark';

/**
 * Species tier, duplicated here rather than imported.
 *
 * lib/woodcutting owns SPECIES, and this module is zero-import for the same
 * reason that one is. The duplication is one small table and it is checked
 * against the real thing in crafting.test — a mismatch fails the build rather
 * than quietly making a recipe cost the wrong wood.
 */
export const LOG_TIER: Record<LogRef, number> = {
  'log-pine': 1,
  'log-birch': 1,
  'log-oak': 2,
  'log-blackpine': 3,
  'log-ironbark': 4,
};

export type CraftKind = 'axe' | 'crossbow' | 'ammo' | 'material';

export interface Recipe {
  id: string;
  name: string;
  kind: CraftKind;
  /**
   * The minimum wood tier this can be made from.
   *
   * Any log at this tier OR ABOVE is accepted, which is the same rule an axe
   * uses in reverse. It means a player who has moved on is never punished for
   * spending better wood on an older recipe — they are only wasting it, which
   * is their business.
   */
  tier: number;
  /** How many logs of that tier or above. */
  logs: number;
  /**
   * What must already be owned. Not consumed — a tool is not an ingredient.
   *
   * The Felling Axe needs a Hatchet because you cannot cut the twenty pine logs
   * it is made of without one, so requiring it states a fact that is already
   * true rather than adding a rule. It exists to stop the ladder being skipped
   * by somebody who bought or traded their way to a pile of good wood.
   */
  requires: string | null;
  /** Scouting XP for a successful craft. */
  xp: number;
  /**
   * How many the craft produces. Absent means one.
   *
   * Only ammunition uses it. A tool is a tool; a bolt is a handful, and making
   * a player craft twelve times to fill a quiver would be a chore rather than a
   * decision.
   */
  yields?: number;
  blurb: string;
}

/**
 * The catalogue.
 *
 * Three families, and the reason there are exactly three:
 *
 *   AXES close the gathering loop. Every rung is made from the wood the rung
 *   below unlocked, so the skill funds its own progression.
 *
 *   CROSSBOWS are the payoff that leaves the skill. They are the first ranged
 *   weapon in the game and the only route to one is through wood, which gives a
 *   player who has never fought a reason to have been cutting trees.
 *
 *   MATERIALS are the hook for everything else — desks, and whatever comes
 *   next. See DESK_FRAME below for why the desk itself is not here yet.
 */
export const RECIPES: Recipe[] = [
  // --- axes: the loop -----------------------------------------------------
  {
    id: 'felling',
    name: 'Felling Axe',
    kind: 'axe',
    tier: 1,
    logs: 20,
    requires: 'hatchet',
    xp: 120,
    blurb: 'Laminated pine, heavier head. Twenty logs of it, and it takes oak.',
  },
  {
    id: 'splitting',
    name: 'Splitting Axe',
    kind: 'axe',
    tier: 2,
    logs: 24,
    requires: 'felling',
    xp: 340,
    blurb: 'Oak through the haft. Heavy enough for black pine.',
  },
  {
    id: 'ironbark-axe',
    name: 'Ironbark Axe',
    kind: 'axe',
    tier: 3,
    logs: 30,
    requires: 'splitting',
    xp: 900,
    blurb: 'Black pine, laminated and banded. The only thing that takes ironbark.',
  },

  // --- crossbows: the payoff ----------------------------------------------
  {
    id: 'hunting-crossbow',
    name: 'Hunting Crossbow',
    kind: 'crossbow',
    tier: 2,
    logs: 10,
    requires: null,
    xp: 200,
    blurb: 'Oak stock and a steel prod. Reaches further than an axe does.',
  },
  {
    id: 'heavy-crossbow',
    name: 'Heavy Crossbow',
    kind: 'crossbow',
    tier: 3,
    logs: 14,
    requires: 'hunting-crossbow',
    xp: 520,
    blurb: 'Slower to span, and it does not care what it is pointed at.',
  },
  {
    id: 'ironbark-crossbow',
    name: 'Ironbark Crossbow',
    kind: 'crossbow',
    tier: 4,
    logs: 20,
    requires: 'heavy-crossbow',
    xp: 1200,
    blurb: 'Ironbark prod. Nobody has a good answer about the noise it makes.',
  },

  /*
   * --- ammunition ---------------------------------------------------------
   *
   * The thing that makes ironbark WORTH FINDING TWICE.
   *
   * Every other recipe here is a one-off: you make the axe once and that wood
   * is finished with you forever. For the top of a gathering ladder that is a
   * dead end — a player fells their eight ironbarks, crafts the crossbow, and
   * the rarest material in the game has nothing left to do.
   *
   * Bolts are a REPEATING sink, which is what a top tier actually needs. It
   * also answers the design doc's requirement that ranged weapons be limited by
   * ammunition rather than by rate of fire (docs/greenwood-turn.md): a crossbow
   * you cannot feed is self-limiting without a cooldown, and the limiter is
   * something you go and gather rather than something you wait out.
   *
   * Cheap per craft and generous per batch on purpose. The cost is the WALK —
   * ironbark only grows in the Deep Forest, past the PvP gate — not the count.
   */
  {
    id: 'ironbark-bolts',
    name: 'Ironbark Bolts',
    kind: 'ammo',
    tier: 4,
    logs: 2,
    // No point making bolts with nothing to fire them from, and saying so here
    // is cheaper than letting somebody spend ironbark on a mistake.
    requires: 'hunting-crossbow',
    xp: 90,
    yields: 12,
    blurb: 'A dozen, cut and fletched. They ring faintly in the quiver.',
  },

  /*
   * --- materials ----------------------------------------------------------
   *
   * A desk frame, and NOT a desk.
   *
   * Desks are the game's BNTY sink — opening one is where the token goes, and
   * the halving schedule is written against that. A desk craftable from wood
   * alone would quietly remove the sink and inflate the supply, which is an
   * economic decision and not one to make as a side effect of adding a
   * gathering skill.
   *
   * So the frame is the honest intermediate: it exists, it consumes wood, and
   * what it eventually DISCOUNTS is a question for whoever owns the economy.
   * Until then it is a material with a price and no buyer, which is a smaller
   * problem than a broken emission curve.
   */
  {
    id: 'desk-frame',
    name: 'Desk Frame',
    kind: 'material',
    tier: 2,
    logs: 24,
    requires: null,
    xp: 260,
    blurb: 'A carcass, ready for the fittings. Not a desk until it is fitted.',
  },
];

const BY_ID = new Map(RECIPES.map((r) => [r.id, r]));

export function recipeById(id: string | null | undefined): Recipe | null {
  return id ? BY_ID.get(id) ?? null : null;
}

/** Recipes that produce a given kind, in ladder order. */
export function recipesOf(kind: CraftKind): Recipe[] {
  return RECIPES.filter((r) => r.kind === kind).sort((a, b) => a.tier - b.tier);
}

/**
 * Which logs may be spent on a recipe.
 *
 * Tier or above, so better wood is always accepted. The caller picks WHICH to
 * spend; this only says what qualifies.
 */
export function eligibleLogs(recipe: Recipe): LogRef[] {
  return (Object.keys(LOG_TIER) as LogRef[]).filter((ref) => LOG_TIER[ref] >= recipe.tier);
}

export interface CraftCheck {
  ok: boolean;
  /** Player-facing sentence. Null when it would succeed. */
  reason: string | null;
  code: 'ok' | 'unknown-recipe' | 'missing-tool' | 'not-enough-wood';
}

/**
 * May this be crafted right now?
 *
 * Pure, so the client can grey a bench entry out before a round trip and the
 * server can answer the same question authoritatively. Takes plain values for
 * the same reason `canEnter` does: it has to be callable from a route, a test
 * and a component, and only one of those has a database.
 *
 * `held` is a count per log ref — the caller flattens a pack into it.
 */
export function canCraft(
  recipeId: string,
  player: { held: Partial<Record<LogRef, number>>; tools: string[] }
): CraftCheck {
  const recipe = recipeById(recipeId);
  if (!recipe) {
    return { ok: false, reason: 'No such recipe.', code: 'unknown-recipe' };
  }

  // Tool before wood, deliberately. A player who is short of BOTH should be
  // told about the tool: it is the harder of the two to fix, and telling them
  // to go and cut more wood they cannot cut is a lie that costs an hour.
  if (recipe.requires && !player.tools.includes(recipe.requires)) {
    const needed = recipeById(recipe.requires);
    return {
      ok: false,
      reason: `You need a ${needed?.name ?? recipe.requires} before you can make this.`,
      code: 'missing-tool',
    };
  }

  const have = eligibleLogs(recipe).reduce((sum, ref) => sum + (player.held[ref] ?? 0), 0);
  if (have < recipe.logs) {
    return {
      ok: false,
      reason: `Needs ${recipe.logs} logs of ${tierName(recipe.tier)} or better. You have ${have}.`,
      code: 'not-enough-wood',
    };
  }

  return { ok: true, reason: null, code: 'ok' };
}

/** Reader-friendly name for a tier, for the refusal sentence. */
export function tierName(tier: number): string {
  return ['', 'pine', 'oak', 'black pine', 'ironbark'][tier] ?? `tier ${tier}`;
}

/**
 * Which logs to actually spend, worst first.
 *
 * Spending the WORST eligible wood is the only defensible default: a player who
 * holds oak and ironbark and crafts something needing oak did not mean to burn
 * the ironbark, and a system that quietly took the rarest thing they owned would
 * be one they stopped trusting. Returned as a plan rather than applied, so the
 * caller can show it before committing.
 */
export function spendPlan(
  recipe: Recipe,
  held: Partial<Record<LogRef, number>>
): Array<{ ref: LogRef; quantity: number }> {
  const plan: Array<{ ref: LogRef; quantity: number }> = [];
  let left = recipe.logs;
  const cheapestFirst = eligibleLogs(recipe).sort((a, b) => LOG_TIER[a] - LOG_TIER[b]);
  for (const ref of cheapestFirst) {
    if (left <= 0) break;
    const take = Math.min(left, held[ref] ?? 0);
    if (take > 0) {
      plan.push({ ref, quantity: take });
      left -= take;
    }
  }
  return left > 0 ? [] : plan;
}
