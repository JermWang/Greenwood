import { describe, it, expect } from 'vitest';
import { levelMultiplier, MAX_COMPOUND_LEVEL } from './economy';
import { DESK_MATERIAL, FRAMES_FROM_LEVEL, deskFrames, deskFramesTotal } from './capital';
import {
  deskCapital,
  upgradeCapital,
  capitalBudget,
  capitalUsage,
  yieldPerCapital,
  marginalYieldPerCapital,
  nodeUpgradeCost,
  deskBuildCost,
  CAPITAL_BUDGETS,
} from './capital';

describe('desk capital', () => {
  it('rises with level', () => {
    for (let level = 1; level < 20; level += 1) {
      expect(deskCapital(level + 1)).toBeGreaterThan(deskCapital(level));
    }
  });

  it('charges a base every desk owes, so width is not free', () => {
    // Two L1 desks must cost more than one L2 desk, or width would be strictly
    // cheaper than depth for the same total level and the budget would push
    // everyone back onto a single shape.
    expect(deskCapital(1) * 2).toBeGreaterThan(deskCapital(2));
  });

  it('accelerates with level, so depth is not free either', () => {
    // Compared across a two-level gap rather than adjacent ones. deskCapital
    // rounds to whole units, and L^1.5 grows slowly enough at the bottom of the
    // table that rounding alone can make one step a unit cheaper than the last
    // (L2->L3 costs 10, L3->L4 costs 11, L4->L5 costs 13, but L9->L10 and
    // L8->L9 both land on 17). The trend is what matters, not each step.
    for (let level = 1; level < 15; level += 1) {
      expect(upgradeCapital(level + 2)).toBeGreaterThan(upgradeCapital(level));
    }
  });

  it('clamps sub-level-1 input rather than returning something negative', () => {
    expect(deskCapital(0)).toBe(deskCapital(1));
    expect(deskCapital(-5)).toBe(deskCapital(1));
  });
});

describe('the pricing rule', () => {
  /**
   * The load-bearing invariant. Capital is priced so that raw yield per unit of
   * capital is flat across the level curve — that is what stops the budget from
   * simply relocating the old "always mint, never level" ordering rather than
   * removing it. If levelMultiplier or the capital constants are edited
   * independently, this is what notices.
   */
  it('holds yield per capital flat across the whole level table', () => {
    const ratios = Array.from({ length: MAX_COMPOUND_LEVEL }, (_, i) => yieldPerCapital(i + 1));
    const spread = Math.max(...ratios) / Math.min(...ratios) - 1;
    expect(spread, `yield per capital varies by ${(spread * 100).toFixed(1)}% across L1-L10`).toBeLessThan(0.05);
  });

  it('decays past the level table, so one desk cannot be levelled forever', () => {
    // Beyond L10 levelMultiplier goes linear while capital keeps climbing at
    // L^1.5, so the marginal return has to fall away.
    expect(marginalYieldPerCapital(20)).toBeLessThan(marginalYieldPerCapital(10));
    expect(levelMultiplier(30) / deskCapital(30)).toBeLessThan(yieldPerCapital(10));
  });
});

describe('capital budget', () => {
  it('rises with every portfolio level', () => {
    for (let level = 1; level < MAX_COMPOUND_LEVEL; level += 1) {
      expect(capitalBudget(level + 1)).toBeGreaterThan(capitalBudget(level));
    }
  });

  it('defines a budget for every portfolio level, with no gaps', () => {
    for (let level = 1; level <= MAX_COMPOUND_LEVEL; level += 1) {
      expect(CAPITAL_BUDGETS[level], `no budget defined for portfolio level ${level}`).toBeGreaterThan(0);
    }
  });

  it('clamps out-of-range portfolio levels instead of returning undefined', () => {
    expect(capitalBudget(0)).toBe(capitalBudget(1));
    expect(capitalBudget(999)).toBe(capitalBudget(MAX_COMPOUND_LEVEL));
  });

  it('starts a new fund with room for about four L1 desks, as the old cap did', () => {
    // The old count cap gave a portfolio L1 fund 2 Equity + 2 Treasury desks.
    // Replacing it should not quietly change how the first session feels.
    expect(Math.floor(capitalBudget(1) / deskCapital(1))).toBe(4);
  });
});

describe('capital usage', () => {
  it('sums desks and reports the remainder', () => {
    const usage = capitalUsage([1, 1, 1], 1);
    expect(usage.used).toBe(deskCapital(1) * 3);
    expect(usage.budget).toBe(capitalBudget(1));
    expect(usage.free).toBe(usage.budget - usage.used);
  });

  it('never reports negative headroom when a fund is over budget', () => {
    // Reachable in practice: a portfolio level can only go up today, but a
    // refund, a migration or a rebalance could leave a fund above its ceiling,
    // and a negative "free" figure would read as available room in the UI.
    const usage = capitalUsage([10, 10, 10, 10, 10, 10, 10, 10, 10, 10], 1);
    expect(usage.used).toBeGreaterThan(usage.budget);
    expect(usage.free).toBe(0);
  });

  it('is empty for a fund with no desks', () => {
    expect(capitalUsage([], 5).used).toBe(0);
  });
});

describe('desk money cost', () => {
  it('matches the price the engine has always charged for the first upgrades', () => {
    // Moving this function out of lib/game must not reprice anything on its own.
    expect(nodeUpgradeCost(1)).toBe(250);
    expect(nodeUpgradeCost(2)).toBe(400);
    expect(nodeUpgradeCost(3)).toBe(640);
  });

  it('counts mint plus every upgrade along the way', () => {
    expect(deskBuildCost(1, 1000)).toBe(1000);
    expect(deskBuildCost(3, 1000)).toBe(1000 + nodeUpgradeCost(1) + nodeUpgradeCost(2));
  });
});

describe('desk materials', () => {
  /**
   * THE PREREQUISITE LOOP, pinned.
   *
   * The first draft charged a Desk Frame to open a desk and one for every level
   * after. That made the game unstartable: a frame is 24 oak, oak needs a
   * Felling Axe, a Felling Axe needs 20 pine and a Hatchet, and a Hatchet needs
   * 400 Scrip — while the introduction's very first instruction is to open a
   * desk and its sixth step is taking one to level 2. Fourteen tests failed at
   * once, which is what a prerequisite loop looks like from the outside.
   */
  it('asks for no timber at the levels the introduction walks through', () => {
    // Open a desk, then take it to 2. Both must be payable in capital alone.
    expect(deskFrames(1)).toBe(0);
    expect(deskFrames(2)).toBe(0);
  });

  it('starts asking exactly where the wood ladder becomes reachable', () => {
    expect(deskFrames(FRAMES_FROM_LEVEL - 1)).toBe(0);
    expect(deskFrames(FRAMES_FROM_LEVEL)).toBeGreaterThan(0);
  });

  /**
   * The Deep Forest wants a desk at level 8. Landing that inside the material
   * curve couples the two ladders: you cannot reach the PvP zone without having
   * done some woodcutting, which is the point of having both.
   */
  it('makes the Deep Forest desk gate require timber', () => {
    expect(deskFrames(8)).toBeGreaterThan(0);
    expect(deskFramesTotal(8)).toBeGreaterThan(0);
  });

  it('climbs, so timber is a permanent demand rather than a one-time tax', () => {
    // A flat cost would be outgrown immediately and woodcutting would stay a
    // beginner activity. A level-15 floor should still want wood.
    expect(deskFrames(20)).toBeGreaterThan(deskFrames(8));
    expect(deskFrames(8)).toBeGreaterThanOrEqual(deskFrames(FRAMES_FROM_LEVEL));
  });

  /**
   * Shallow ON PURPOSE. This cost stacks on a capital curve that is already the
   * binding constraint, and two steep curves multiplied together is not twice
   * the decision — it is a wall.
   */
  it('stays shallow enough to sit on top of the capital curve', () => {
    /*
     * PER LEVEL is the number that matters, not the cumulative.
     *
     * Taking one desk from 1 to 25 comes to 87 frames — about 2,000 logs — which
     * reads alarming until you notice it is spread across twenty levels. What a
     * player actually experiences is the cost of the NEXT level, and at the very
     * top that is 7 frames: 168 logs, or roughly two circuits of a wood. That is
     * a trip, which is what it should be.
     *
     * Asserting the cumulative would be asserting a number nobody meets in one
     * sitting. Asserting the step is asserting the thing they feel.
     */
    const LOGS_PER_FRAME = 24;
    const CIRCUIT = 90; // Oak logs from one walk of a wood, roughly.
    for (let level = FRAMES_FROM_LEVEL; level <= 25; level += 1) {
      const logs = deskFrames(level) * LOGS_PER_FRAME;
      expect(logs / CIRCUIT, `level ${level} costs too many circuits`).toBeLessThan(2.5);
    }
  });
});
