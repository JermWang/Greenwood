// The crafting ladder, and the properties that keep it a ladder rather than a
// price list.
import { describe, expect, it } from 'vitest';
import {
  LOG_TIER,
  RECIPES,
  canCraft,
  eligibleLogs,
  recipeById,
  recipesOf,
  spendPlan,
  tierName,
  type LogRef,
} from './crafting';
import { ALL_SPECIES, AXES, SPECIES, type AxeId } from './woodcutting';

const held = (over: Partial<Record<LogRef, number>> = {}) => over;

describe('the catalogue', () => {
  it('gives every recipe a unique id', () => {
    expect(new Set(RECIPES.map((r) => r.id)).size).toBe(RECIPES.length);
  });

  /**
   * LOG_TIER is duplicated from lib/woodcutting because this module is
   * zero-import for the same reason that one is. The duplication is safe only
   * while something checks it — a drifted tier would silently make a recipe
   * cost the wrong wood, and nothing else in the system would notice.
   */
  it('agrees with woodcutting about what each log is worth', () => {
    for (const species of ALL_SPECIES) {
      const ref = `log-${species.id}` as LogRef;
      expect(LOG_TIER[ref], `${ref} tier drifted`).toBe(species.tier);
    }
    // And no ref here that woodcutting does not produce.
    const known = new Set(ALL_SPECIES.map((s) => `log-${s.id}`));
    for (const ref of Object.keys(LOG_TIER)) expect(known.has(ref), ref).toBe(true);
  });

  it('never asks for a tool that is not itself craftable or buyable', () => {
    const craftable = new Set(RECIPES.map((r) => r.id));
    const buyable = new Set(Object.keys(AXES));
    for (const r of RECIPES) {
      if (!r.requires) continue;
      expect(
        craftable.has(r.requires) || buyable.has(r.requires),
        `${r.id} requires ${r.requires}, which cannot be obtained`
      ).toBe(true);
    }
  });
});

describe('the axe loop closes', () => {
  /**
   * THE WHOLE DESIGN, asserted.
   *
   * Every axe is made from wood its PREREQUISITE can already fell, and unlocks
   * the tier above — a Felling Axe is pine, which a Hatchet cuts, and it takes
   * oak. If a rung ever needs wood its prerequisite cannot fell, the ladder has
   * a hole and the only way up is Scrip, which would make the gathering skill
   * decorative.
   *
   * This assertion earned itself on its first run: the table shipped with the
   * Felling Axe made of OAK, which a Hatchet cannot cut.
   */
  it('makes every axe from wood the previous axe can fell', () => {
    for (const recipe of recipesOf('axe')) {
      expect(recipe.requires, `${recipe.id} has no prerequisite`).not.toBeNull();
      const tool = AXES[recipe.requires as AxeId];
      expect(tool, `${recipe.requires} is not an axe`).toBeDefined();
      expect(
        tool.tier,
        `${tool.name} cannot fell the ${tierName(recipe.tier)} that ${recipe.name} needs`
      ).toBeGreaterThanOrEqual(recipe.tier);
    }
  });

  it('starts from the one axe you can only buy', () => {
    // The Hatchet is not craftable: something has to be the first rung, and a
    // ladder whose bottom step is made of wood you need the ladder to reach is
    // not a ladder.
    expect(recipeById('hatchet')).toBeNull();
    expect(AXES.hatchet.scripCost).toBeGreaterThan(0);
  });

  it('leaves Scrip as a parallel route to every rung', () => {
    // Two routes to the same rung, so a player who would rather pay is not
    // locked out and one who would rather gather is not taxed.
    for (const recipe of recipesOf('axe')) {
      expect(AXES[recipe.id as AxeId], `${recipe.id} cannot be bought`).toBeDefined();
    }
  });
});

describe('what makes ironbark matter', () => {
  /**
   * Not price — a rare material that makes the same object as a common one is
   * just a longer wait, and players correctly ignore it. Ironbark has to be the
   * ONLY route to things that do not exist below it.
   */
  it('puts items behind the top tier that exist nowhere else', () => {
    const top = RECIPES.filter((r) => r.tier === 4);
    expect(top.length).toBeGreaterThanOrEqual(2);
    for (const r of top) {
      const cheaper = RECIPES.filter((o) => o.kind === r.kind && o.tier < r.tier);
      // Same family exists below, but this specific item does not.
      expect(cheaper.every((o) => o.id !== r.id)).toBe(true);
    }
  });

  it('gives the top tier a repeating sink, not just a one-off', () => {
    // Every other recipe is made once and that wood is done with you forever.
    // For the TOP of a gathering ladder that is a dead end: fell eight
    // ironbarks, craft the crossbow, and the rarest material in the game has
    // nothing left to do. Ammunition is what makes it worth finding twice.
    const repeating = RECIPES.filter((r) => r.tier === 4 && (r.yields ?? 1) > 1);
    expect(repeating.length, 'ironbark has no recurring use').toBeGreaterThanOrEqual(1);
  });

  it('climbs cost and XP with tier', () => {
    for (const kind of ['axe', 'crossbow'] as const) {
      const ladder = recipesOf(kind);
      for (let i = 1; i < ladder.length; i += 1) {
        expect(ladder[i].logs, ladder[i].id).toBeGreaterThan(ladder[i - 1].logs);
        expect(ladder[i].xp, ladder[i].id).toBeGreaterThan(ladder[i - 1].xp);
      }
    }
  });

  it('does not make a desk out of thin wood', () => {
    // Desks are the GREEN sink and the halving schedule is written against it.
    // A wood-only desk would remove the sink, which is an economic decision and
    // not one to make as a side effect of a gathering skill.
    expect(RECIPES.some((r) => /desk/i.test(r.name) && r.kind !== 'material')).toBe(false);
  });
});

describe('eligibility', () => {
  it('accepts the recipe tier and anything above it', () => {
    const splitting = recipeById('splitting')!;
    expect(eligibleLogs(splitting)).toEqual(['log-oak', 'log-blackpine', 'log-ironbark']);
    // Never below: pine cannot become a splitting axe however much of it you have.
    expect(eligibleLogs(splitting)).not.toContain('log-pine');
  });

  it('refuses an unknown recipe rather than defaulting open', () => {
    expect(canCraft('nonsense', { held: {}, tools: [] }).code).toBe('unknown-recipe');
  });

  /**
   * Tool before wood, deliberately.
   *
   * A player short of both should be told about the TOOL: it is the harder of
   * the two to fix, and sending them to cut wood they cannot cut is a lie that
   * costs an hour.
   */
  it('names the missing tool before the missing wood', () => {
    const check = canCraft('splitting', { held: {}, tools: [] });
    expect(check.code).toBe('missing-tool');
    expect(check.reason).toMatch(/Felling Axe/);
  });

  it('counts every eligible tier toward the requirement', () => {
    const mixed = held({ 'log-oak': 12, 'log-ironbark': 12 });
    expect(canCraft('splitting', { held: mixed, tools: ['hatchet', 'felling'] }).ok).toBe(true);
  });

  it('says how short you are, not just that you are short', () => {
    const check = canCraft('felling', { held: held({ 'log-pine': 3 }), tools: ['hatchet'] });
    expect(check.code).toBe('not-enough-wood');
    expect(check.reason).toMatch(/20 logs/);
    expect(check.reason).toMatch(/You have 3/);
  });
});

describe('what gets spent', () => {
  /**
   * Worst wood first, and this is the one that would quietly lose players.
   *
   * Somebody holding oak and ironbark who crafts something needing oak did not
   * mean to burn the ironbark. A system that silently took the rarest thing they
   * owned is one they would stop trusting, and they would be right to.
   */
  it('spends the cheapest eligible wood first', () => {
    const plan = spendPlan(recipeById('splitting')!, held({ 'log-oak': 20, 'log-blackpine': 9 }));
    expect(plan[0]).toEqual({ ref: 'log-oak', quantity: 20 });
    expect(plan[1]).toEqual({ ref: 'log-blackpine', quantity: 4 });
  });

  it('spends exactly what the recipe asks for and no more', () => {
    const recipe = recipeById('felling')!;
    const plan = spendPlan(recipe, held({ 'log-pine': 100 }));
    expect(plan.reduce((n, p) => n + p.quantity, 0)).toBe(recipe.logs);
  });

  it('returns nothing at all when it cannot be paid', () => {
    // An empty plan is the refusal. A partial one would let a caller charge for
    // a craft that never completes.
    expect(spendPlan(recipeById('ironbark-axe')!, held({ 'log-blackpine': 2 }))).toEqual([]);
  });

  it('never plans to spend wood below the recipe tier', () => {
    const plan = spendPlan(recipeById('splitting')!, held({ 'log-pine': 99, 'log-blackpine': 12 }));
    for (const line of plan) expect(LOG_TIER[line.ref]).toBeGreaterThanOrEqual(SPECIES.blackpine.tier);
  });
});
