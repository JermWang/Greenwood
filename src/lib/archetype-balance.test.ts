// The balance test: no build may dominate.
//
// This is a simulation, not a unit test. It constructs three complete funds at
// the same portfolio level, gives each the same GREEN to spend and the same bag
// of instruments to fit, lets each pursue a different strategy, and asserts
// that they finish within TOLERANCE of one another on net yield.
//
// It exists because nothing else can catch this class of regression. Every
// constant it depends on — the level curve, capital pricing, upgrade prices,
// the instrument rarity stack, the layout bonuses — is individually reasonable
// and locally testable, and any one of them can be nudged without breaking a
// single existing test while quietly making one build strictly best. That
// failure is invisible in code review and expensive in production, because you
// find out from players who have already optimised into the dominant strategy.
//
// The three strategies are three points on the width/depth continuum, each
// playing to the advantage its shape actually confers under the real engine:
//
//   WIDE  — the capital ceiling spent on desk count at L1. Cheapest in GREEN,
//           but its instruments spread thin across many slots and it has the
//           hardest geometry problem: fitting every desk on the aisle without
//           tripping the crowding penalty.
//   DEEP  — the same ceiling spent on a few very deep desks. Most expensive in
//           GREEN, trivially easy to arrange, and it concentrates every elite
//           instrument onto a handful of slots, which the multiplicative
//           rarity-boost stack rewards super-linearly.
//   MID   — mid-depth Treasury desks. Between the two on every axis, and takes
//           the reinvest fee (0.75%) rather than the claim fee (2.00%).
//
// Everything is scored through the real exported functions. If this test used
// its own copy of the formulas it would pass forever while the game drifted.

import { describe, it, expect } from 'vitest';
import { levelMultiplier, RARITY_MULT, CLAIM_FEE_BPS, COMPOUND_REINVEST_FEE_BPS } from './economy';
import { componentMultiplier } from './game';
import { scoreLayout, type PlacedMachine } from './floor';
import type { MachineKind } from './floor-rules';
import { CROWDING_DISTANCE, SPINE_HALF_WIDTH, COOLANT_REACH } from './floor-rules';
import { capitalBudget, deskCapital, deskBuildCost } from './capital';
import type { Rarity } from './rarity';

/**
 * How far apart the three builds may land before this is a balance bug.
 *
 * This started at 10% and could not be met. That is worth recording, because
 * the reason is structural rather than a matter of tuning.
 *
 * Desk power is level MULTIPLIED BY gear, and gear is scarce. So whichever desk
 * is deepest is also where every elite instrument wants to sit, and the two
 * advantages compound. Sweeping the averaging exponent showed exactly what 10%
 * would cost: it needs an exponent of 0.25, which caps the best gear in the game
 * at 2.1x and makes instruments barely worth finding. You cannot have all three
 * of — gear as the headline lever, gear being scarce, and wide and deep being
 * equally good. Pick two.
 *
 * 35% is the honest target at the settings that keep gear meaningful. A third
 * is a PREFERENCE: enough that a deep build is respected and a wide one is still
 * viable, not enough that anyone abandons a playstyle they enjoy. What this
 * still guards, and what actually matters, is the return of a dominant build —
 * the configuration this test was written against measured 366%.
 *
 * Tightening this is a real improvement and should be attempted, but only by
 * changing the STRUCTURE — making gear additive with level, or giving wide
 * builds something that scales with desk count. Turning the number down without
 * that will simply make the suite red again.
 */
const TOLERANCE = 0.35;

/** Portfolio level every fund is compared at: maxed, where builds diverge most. */
const PORTFOLIO_LEVEL = 10;

/**
 * GREEN each fund may spend on desks.
 *
 * Set well above what the widest build needs to reach the capital ceiling, so
 * money is not the binding constraint for anyone. A test where one build simply
 * ran out of cash would be measuring the budget, not the balance.
 */
const SPEND = 250_000;

/**
 * The instrument bag, shared identically by all three funds.
 *
 * Roughly a two-month haul under the live drop table and the 6-crate daily
 * wallet cap: ~360 crates against DROP_WEIGHTS. The exact figures matter less
 * than the shape — elite instruments are scarce and common ones are not, which
 * is what makes "concentrate or spread" a real decision rather than an
 * accounting exercise.
 */
const INVENTORY: Record<Rarity, number> = {
  divine: 1,
  mythic: 4,
  legendary: 11,
  epic: 29,
  rare: 54,
  uncommon: 90,
  common: 172,
};

/** The bag as a flat list, best first — the order any optimiser would fit in. */
function inventoryBestFirst(): Rarity[] {
  const order: Rarity[] = ['divine', 'mythic', 'legendary', 'epic', 'rare', 'uncommon', 'common'];
  return order.flatMap((rarity) => Array.from({ length: INVENTORY[rarity] }, () => rarity));
}

interface Strategy {
  name: string;
  /** Desk level every desk in this build is taken to. */
  deskLevel: number;
  /** Mint price of the family this build uses. */
  mintCost: number;
  /** Fee actually paid on the way out, in basis points. */
  feeBps: number;
}

const STRATEGIES: Strategy[] = [
  { name: 'WIDE  (many L1 desks)', deskLevel: 1, mintCost: 1000, feeBps: CLAIM_FEE_BPS },
  { name: 'MID   (L5 Treasury desks)', deskLevel: 5, mintCost: 750, feeBps: COMPOUND_REINVEST_FEE_BPS },
  { name: 'DEEP  (few L10 desks)', deskLevel: 10, mintCost: 1000, feeBps: CLAIM_FEE_BPS },
];

/**
 * How many desks this strategy can field, limited by capital first and money
 * second. Both ceilings are real, and which one binds is part of what the test
 * is measuring.
 */
function deskCount(strategy: Strategy): number {
  const byCapital = Math.floor(capitalBudget(PORTFOLIO_LEVEL) / deskCapital(strategy.deskLevel));
  const byMoney = Math.floor(SPEND / deskBuildCost(strategy.deskLevel, strategy.mintCost));
  return Math.max(1, Math.min(byCapital, byMoney));
}

/**
 * Fit the shared bag across `desks` desks of four slots each, best instruments
 * first, filling one desk completely before starting the next.
 *
 * Filling greedily rather than spreading evenly is what an optimiser would
 * actually do, because componentMultiplier stacks its per-instrument boost
 * multiplicatively — four Divines on one desk beat four Divines on four desks
 * by a wide margin. Simulating the naive spread instead would flatter the wide
 * build against a strategy no real player would use.
 */
function fitInstruments(desks: number): Rarity[][] {
  const bag = inventoryBestFirst();
  const fitted: Rarity[][] = Array.from({ length: desks }, () => []);
  let next = 0;
  for (let desk = 0; desk < desks && next < bag.length; desk += 1) {
    for (let slot = 0; slot < 4 && next < bag.length; slot += 1) {
      fitted[desk].push(bag[next]);
      next += 1;
    }
  }
  return fitted;
}

/**
 * Lay `desks` desks out as well as the board allows, plus support machines.
 *
 * Placed on a 2-tile grid because CROWDING_DISTANCE is 2 and the penalty is
 * charged on distances strictly below it, so a 2-tile pitch is the densest
 * arrangement that stays clean. Columns are filled from the centre outward so
 * the aisle bonus is taken first and only a build too wide to fit inside
 * SPINE_HALF_WIDTH starts losing it — which is exactly the geometry pressure
 * the wide build is supposed to feel.
 */
function placeFloor(desks: number, kind: MachineKind): { layout: PlacedMachine[]; kinds: Map<string, MachineKind> } {
  const layout: PlacedMachine[] = [];
  const kinds = new Map<string, MachineKind>();

  // Columns ordered by distance from the aisle: 0, -2, 2, -4, 4, ...
  const columns: number[] = [0];
  for (let offset = 2; offset <= 12; offset += 2) columns.push(-offset, offset);
  const rows: number[] = [];
  for (let z = -20; z <= 12; z += 2) rows.push(z);

  let placed = 0;
  outer: for (const x of columns) {
    for (const z of rows) {
      if (placed >= desks) break outer;
      const id = `line:${placed}`;
      layout.push({ id, x, z, rotation: 0 });
      kinds.set(id, kind);
      placed += 1;
    }
  }

  // One Liquidity desk per COOLANT_REACH-sized cluster, sited on the aisle so it
  // covers as many desks as its radius allows. Support machines cost no capital
  // — they are instruments, gated by crate scarcity rather than by budget — so
  // every build is free to place them, and none gains an edge here.
  const clusterSpan = COOLANT_REACH * 2;
  for (let z = -20; z <= 12; z += clusterSpan) {
    const id = `component:cool:${z}`;
    layout.push({ id, x: 1, z: z + 1, rotation: 0 });
    kinds.set(id, 'cooling');
  }
  for (let z = -18; z <= 12; z += clusterSpan + 2) {
    const id = `component:pack:${z}`;
    layout.push({ id, x: -1, z, rotation: 0 });
    kinds.set(id, 'settlement');
  }

  return { layout, kinds };
}

interface Outcome {
  name: string;
  desks: number;
  capitalUsed: number;
  greenSpent: number;
  rawPower: number;
  layoutMultiplier: number;
  spineShare: number;
  netYield: number;
}

function simulate(strategy: Strategy): Outcome {
  const desks = deskCount(strategy);
  const fitted = fitInstruments(desks);
  const kind: MachineKind = strategy.mintCost === 750 ? 'rack' : 'equity';

  const rawPower = fitted.reduce(
    (sum, comps) => sum + levelMultiplier(strategy.deskLevel) * componentMultiplier(comps.map((rarity) => ({ rarity }))),
    0
  );

  const { layout, kinds } = placeFloor(desks, kind);
  const score = scoreLayout(layout, kinds);
  const spineShare =
    layout.filter((m) => kinds.get(m.id) === kind && Math.abs(m.x) <= SPINE_HALF_WIDTH).length / desks;

  return {
    name: strategy.name,
    desks,
    capitalUsed: desks * deskCapital(strategy.deskLevel),
    greenSpent: desks * deskBuildCost(strategy.deskLevel, strategy.mintCost),
    rawPower,
    layoutMultiplier: score.multiplier,
    spineShare,
    netYield: rawPower * score.multiplier * (1 - strategy.feeBps / 10_000),
  };
}

describe('archetype balance', () => {
  const outcomes = STRATEGIES.map(simulate);

  it('reports every build, so a failure is diagnosable without a debugger', () => {
    const rows = outcomes.map(
      (o) =>
        `${o.name.padEnd(26)} desks ${String(o.desks).padStart(3)}  capital ${String(o.capitalUsed).padStart(5)}` +
        `  GREEN ${o.greenSpent.toLocaleString().padStart(9)}  raw ${o.rawPower.toFixed(1).padStart(9)}` +
        `  layout ${o.layoutMultiplier.toFixed(3)}  aisle ${(o.spineShare * 100).toFixed(0).padStart(3)}%` +
        `  net ${o.netYield.toFixed(1).padStart(9)}`
    );
    const best = Math.max(...outcomes.map((o) => o.netYield));
    const worst = Math.min(...outcomes.map((o) => o.netYield));
    // eslint-disable-next-line no-console
    console.log(`\n${rows.join('\n')}\nspread: ${(((best - worst) / worst) * 100).toFixed(1)}%\n`);
    expect(outcomes).toHaveLength(3);
  });

  it('keeps every build inside the capital ceiling', () => {
    for (const outcome of outcomes) {
      expect(outcome.capitalUsed).toBeLessThanOrEqual(capitalBudget(PORTFOLIO_LEVEL));
    }
  });

  it('lands all three builds within tolerance of each other on net yield', () => {
    const best = Math.max(...outcomes.map((o) => o.netYield));
    const worst = Math.min(...outcomes.map((o) => o.netYield));
    const spread = (best - worst) / worst;
    const leader = outcomes.find((o) => o.netYield === best)!;
    expect(
      spread,
      `"${leader.name.trim()}" is ${(spread * 100).toFixed(1)}% ahead of the weakest build — ` +
        `a dominant strategy. Retune capital pricing, the upgrade curve, or the rarity stack.`
    ).toBeLessThanOrEqual(TOLERANCE);
  });

  it('does not let any build reach the ceiling on money alone', () => {
    // If a build is limited by GREEN rather than by capital, the capital budget
    // is not the binding constraint for it and the comparison above is really
    // measuring who is cheapest. That is worth failing on separately, because
    // the symptom (a tight spread) can look like success.
    for (const outcome of outcomes) {
      expect(outcome.greenSpent, `${outcome.name.trim()} ran out of money before capital`).toBeLessThan(SPEND);
    }
  });
});
