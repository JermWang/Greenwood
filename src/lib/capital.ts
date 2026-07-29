// The fund's capital budget — the one binding constraint on a floor.
//
// Before this, the only limit on a floor was a desk COUNT (COMPOUND_LEVELS
// .maxNodes). That is not a constraint, it is an ordering: a new desk cost
// 1,000 BNTY for 1.00x, while taking one desk L1 -> L10 cost ~28,200 BNTY for
// 5.00x. Per BNTY, minting beat levelling roughly five to one, so the optimal
// play was always "fill every slot, then level whatever is left over". Every
// player converged on the same floor and there was no build to talk about.
//
// A budget fixes that by making width and height draw on the SAME pool. You can
// have many shallow desks or a few deep ones, and you have to decide which.
//
// The pricing rule below is the whole idea, so it is worth stating plainly:
//
//   Capital is priced so that raw yield per unit of capital is FLAT across the
//   level curve.
//
// That sounds like it removes the decision, but it does the opposite. If tall
// paid more per unit of capital, everyone would build tall; if wide paid more,
// everyone would build wide. Making the first-order return identical is what
// pushes the decision down onto the second-order effects, which are the
// interesting ones and the ones that reward actual skill:
//
//   - Instruments concentrate super-linearly. componentMultiplier stacks a
//     per-instrument boost multiplicatively on top of an averaged base, so four
//     Divine instruments on one desk are worth several times the same four
//     spread one-per-desk. Scarce elite gear pushes toward TALL.
//   - Geometry punishes density. scoreLayout charges a crowding penalty per
//     desk with a neighbour inside CROWDING_DISTANCE, and the aisle bonus only
//     covers a band SPINE_HALF_WIDTH wide, so a wide floor has to be arranged
//     well to keep its multiplier. Skill at packing pushes toward WIDE.
//   - Fees favour compounding. Reinvesting costs 0.75% against 2.00% to claim,
//     which is a flow advantage rather than a power one, and it rewards a lean
//     floor that is cheap to keep topped up.
//
// Three routes, different skills, similar returns — that is the goal, and
// archetype-balance.test.ts is what would keep it true.
//
// IT HOLDS NOW. The test passes at a 30.1% spread against a 35% tolerance.
//
// The history below is kept because it is the reasoning that got there, and
// because the failure mode it describes will come straight back if RARITY_MULT
// or the level curve is retuned without re-running that test.
//
// The budget below was necessary but not sufficient, and the test is what showed
// why. Measured at a maxed portfolio with an identical instrument bag, a deep
// build once finished 366% ahead of a wide one. The cause was not a mistuned constant
// here — it is that the game's power levers are wildly different sizes:
//
//     desk level     1.00x ->    5.00x
//     floor layout   0.80x ->    1.35x
//     instruments    1.00x -> 6486.00x
//
// Instruments are a lever roughly 1,300x wider than desk level, and desk power
// is levelMultiplier MULTIPLIED BY the instrument multiplier. So whichever desk
// is deepest is also where every scarce elite instrument wants to sit, and the
// two advantages compound. No capital price can undo that: charging capital for
// fitted gear was tried and only balances when capital is made exactly
// proportional to power, which flattens the decision into a cosmetic one and
// produces absurd floors (251 / 612 / 286 desks for the three routes).
//
// Balancing the routes therefore needs a decision about RARITY_MULT's 1 -> 3000
// span, which is an economic change well beyond this file — it sets what a
// crate is worth, what instruments trade for, and what a Divine drop feels
// like. The budget here is still worth having on its own: it removes the old
// "always mint, never level" ordering and makes width and depth draw on one
// pool. It just cannot finish the job alone, and the test says so out loud
// rather than letting the gap reach players.

import { levelMultiplier, MAX_COMPOUND_LEVEL } from './economy';

/**
 * Capital a desk consumes at a given level: BASE + PER_LEVEL * level^EXPONENT.
 *
 * The BASE term is what makes width cost something — every desk owes it,
 * whatever its level — and the exponent is what makes height cost something.
 * A model with only one of the two collapses back into a strict ordering.
 *
 * The three constants are not free. levelMultiplier runs 1.00 -> 5.00 over L1
 * to L10, and it happens to track (6.75 + L^1.5) very closely, so pricing
 * capital on that shape holds yield-per-capital flat to within about 1% across
 * the whole table. Change one of these and the balance test will tell you.
 */
export const CAPITAL_BASE = 27;
export const CAPITAL_PER_LEVEL = 4;
export const CAPITAL_LEVEL_EXPONENT = 1.5;

/**
 * Capital consumed by one desk at `level`.
 *
 * Family-neutral on purpose. The engine pays both families the same
 * levelMultiplier, so charging them different capital would make one strictly
 * better than the other at equal spend. The families differ in mint price and
 * in the reinvest discount, which is where their identity actually lives.
 */
export function deskCapital(level: number): number {
  const l = Math.max(1, Math.floor(level));
  return Math.round(CAPITAL_BASE + CAPITAL_PER_LEVEL * Math.pow(l, CAPITAL_LEVEL_EXPONENT));
}

/** Extra capital needed to take a desk from `level` to the next one. */
export function upgradeCapital(level: number): number {
  return deskCapital(level + 1) - deskCapital(level);
}

/**
 * Capital budget granted by each portfolio level.
 *
 * A pure function of portfolio level, deliberately. Letting staked BNTY or any
 * other balance raise the budget would make the ceiling something you buy
 * rather than something you reach, which is the dynamic the welcome boost and
 * the 30% share cap exist to soften — and it would make the balance test
 * meaningless, because "equal spend" would no longer be equal once spending
 * also bought the budget the spend is measured against.
 *
 * If Fixed Income Notes should ever raise the budget, they belong here as a
 * multiplier on the value this returns, not as a second pool.
 *
 * Sized against how floors actually looked under the old count cap rather than
 * against its theoretical maximum. A portfolio L1 fund can field four L1 desks,
 * matching the old 2 rigs + 2 shafts; a maxed one can field roughly forty
 * shallow desks, eight deep ones, or anything between.
 */
export const CAPITAL_BUDGETS: Record<number, number> = {
  1: 130,
  2: 190,
  3: 260,
  4: 350,
  5: 450,
  6: 570,
  7: 700,
  8: 860,
  9: 1030,
  10: 1220,
};

export function capitalBudget(portfolioLevel: number): number {
  const level = Math.min(Math.max(1, Math.floor(portfolioLevel)), MAX_COMPOUND_LEVEL);
  return CAPITAL_BUDGETS[level];
}

export interface CapitalUsage {
  /** Capital currently committed to desks. */
  used: number;
  /** Total capital this portfolio level supports. */
  budget: number;
  /** Capital still available to commit. Never negative. */
  free: number;
}

/**
 * What a set of desks costs against the budget.
 *
 * Takes plain levels rather than rows so the balance test, the API payload and
 * the engine can all call it without a database in the way.
 */
export function capitalUsage(deskLevels: number[], portfolioLevel: number): CapitalUsage {
  const used = deskLevels.reduce((sum, level) => sum + deskCapital(level), 0);
  const budget = capitalBudget(portfolioLevel);
  return { used, budget, free: Math.max(0, budget - used) };
}

// ---------------------------------------------------------------------------
// What a desk costs in money, as opposed to what it costs in capital
// ---------------------------------------------------------------------------

/**
 * BNTY to take a desk from `level` to the next one.
 *
 * Lives here rather than in the engine because it is half of one decision. The
 * capital budget says how DEEP a fund may build; this curve says what that
 * depth costs, and the two only balance when they are chosen together.
 *
 * The ratio is the tuning knob, and it is doing a specific job. Capital pricing
 * already holds raw yield-per-capital flat across the level curve, so on power
 * alone a deep build and a wide one are worth the same. But a deep build also
 * concentrates scarce elite instruments onto few slots, and componentMultiplier
 * stacks the rarity boost multiplicatively, so depth gets a large second-order
 * bonus for free. This curve is the counterweight: depth costs more money than
 * width for the same capital, and the ratio sets by how much.
 *
 * It was 1.6, chosen when desk COUNT was the only constraint. At that steepness
 * taking one desk L1 -> L10 cost ~28,200 BNTY against ~1,000 for a fresh desk —
 * a 5.2x money premium on depth on top of nothing at all in return, which is
 * why nobody levelled and every floor looked identical. The value here is set
 * by archetype-balance.test.ts, which fails if it drifts far enough to make any
 * one build dominant.
 */
export const UPGRADE_COST_BASE = 250;
export const UPGRADE_COST_RATIO = 1.6;

export function nodeUpgradeCost(level: number): number {
  return Math.round(UPGRADE_COST_BASE * Math.pow(UPGRADE_COST_RATIO, Math.max(1, level) - 1));
}

/** Total BNTY sunk into a desk taken from mint to `level`. */
export function deskBuildCost(level: number, mintCost: number): number {
  let total = mintCost;
  for (let l = 1; l < level; l += 1) total += nodeUpgradeCost(l);
  return total;
}

/**
 * Yield per unit of capital at a level — the figure the pricing rule holds flat.
 *
 * Exported because it is the thing worth showing an optimiser. They want the
 * derivative, not the total: "this upgrade costs 21 capital and returns 0.45
 * multiplier" is actionable in a way that a headline grow-power number is not.
 */
export function yieldPerCapital(level: number): number {
  return levelMultiplier(level) / deskCapital(level);
}

/**
 * Marginal yield per unit of capital for one more level on a desk.
 *
 * Negative-free by construction above L1, and it decays past L10 where
 * levelMultiplier goes linear while capital keeps climbing at L^1.5 — which is
 * the soft ceiling that stops a whale simply levelling one desk forever.
 */
export function marginalYieldPerCapital(level: number): number {
  const gain = levelMultiplier(level + 1) - levelMultiplier(level);
  return gain / upgradeCapital(level);
}

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

/**
 * The crafted part a desk is built and rebuilt from.
 *
 * Matches the recipe id in lib/crafting. Named here rather than imported so
 * this module keeps its own dependency shape; crafting.test asserts the two
 * agree, which is the same trade LOG_TIER makes.
 */
export const DESK_MATERIAL = 'desk-frame';

/**
 * Frames to reach a given desk level from the one below.
 *
 * MATERIALS ARE ON TOP OF THE TOKEN, NEVER INSTEAD OF IT. Desks are the BNTY
 * sink and the halving schedule is written against them; a desk payable in wood
 * would quietly remove that sink. So this is a second, parallel requirement —
 * you need the capital AND the timber — and the capital curve above is
 * completely unchanged by it.
 *
 * IT SCALES, and that is the interesting decision rather than a detail.
 *
 * A flat cost would make wood a one-time tax on opening a desk: paid once,
 * outgrown immediately, and woodcutting stays a beginner activity that a
 * serious player never thinks about again. Scaling makes timber a PERMANENT
 * parallel demand — the level-15 floor still wants wood — which is what keeps a
 * gathering skill relevant to somebody a hundred hours in.
 *
 * The curve is deliberately shallow: ceil(level / 4). Reaching level 8 — the
 * Deep Forest's desk gate — costs eleven frames all told, which is 264 oak logs
 * or roughly three circuits of a wood. Enough to be a real trip, nowhere near
 * enough to become the thing standing between a player and their own floor.
 *
 * Shallow ON PURPOSE, because this cost stacks with a capital curve that is
 * already the binding constraint. Two steep curves multiplied together is not
 * twice the decision, it is a wall.
 */
/**
 * The level at which timber starts being required at all.
 *
 * BELOW THIS, DESKS COST ONLY CAPITAL — and that is a correction, not a
 * softening. The first version charged a frame to OPEN a desk and one for every
 * level after, which made the game unstartable: a Desk Frame needs 24 oak, oak
 * needs a Felling Axe, a Felling Axe needs 20 pine and a Hatchet, and a Hatchet
 * needs 400 Scrip. The first thing the introduction asks anybody to do is open a
 * desk, and its sixth step is taking one to level 2. Fourteen tests failed at
 * once, which is what a prerequisite loop looks like from the outside.
 *
 * Five is chosen so the wood ladder becomes a requirement exactly where it also
 * becomes possible: by level 5 a player has been outside, has Scrip for an axe,
 * and has somewhere to cut oak. It also lands the Deep Forest's desk-8 gate
 * squarely inside the material curve, which couples the two ladders — you
 * cannot reach the PvP zone without having done some woodcutting.
 */
export const FRAMES_FROM_LEVEL = 5;

export function deskFrames(level: number): number {
  if (level < FRAMES_FROM_LEVEL) return 0;
  return Math.ceil(level / 4);
}

/** Total frames sunk to take a desk from nothing to `level`. */
export function deskFramesTotal(level: number): number {
  let total = 0;
  for (let l = 1; l <= level; l += 1) total += deskFrames(l);
  return total;
}
