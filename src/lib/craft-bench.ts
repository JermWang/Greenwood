// Where the craft bench stands, and how close you have to be to use it.
//
// NO IMPORTS. The scene needs it to draw the prop, the floor needs it to decide
// whether to open the panel, and the two must not be able to disagree about
// where the bench is — a lit bench you cannot use, or a usable bench that looks
// dark, are both worse than no bench.
//
// Its own module rather than a constant in either consumer for exactly that
// reason. This is the same lesson the fence sign taught: a fact written twice
// is a fact that eventually differs.

/**
 * The tile the bench occupies, in Machine Room coordinates.
 *
 * Tucked into the north-west of the room, off the central service lane and
 * clear of the door aprons. It is deliberately NOT beside the entrance: a bench
 * you trip over on the way in would be the first thing every player interacts
 * with, and the first thing should be the floor itself.
 *
 * Must sit inside BOARD_BOUNDS (-12..12 x, -20..12 z) — asserted in
 * craft-bench.test, because a bench outside the room would be invisible and
 * unreachable with nothing to say so.
 */
export const BENCH_CELL = { x: -9, z: -14 } as const;

/** Facing, in radians about Y. 0 looks down +Z, toward the room. */
export const BENCH_FACING = 0;

/**
 * How close counts as being at the bench.
 *
 * One tile, Chebyshev — the same reach felling, desks and doors all use. There
 * is exactly one idea of "next to" in this game and it is worth keeping that
 * way: a player who has learned it once should never have to learn it again for
 * a different object.
 */
export const BENCH_REACH = 1;

/** Is this position close enough to work at the bench? */
export function atBench(x: number, z: number): boolean {
  return Math.max(Math.abs(x - BENCH_CELL.x), Math.abs(z - BENCH_CELL.z)) <= BENCH_REACH;
}
