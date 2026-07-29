// The swing curve, as pure maths.
//
// Extracted from Character.tsx for one reason: smoothness is a property that can
// be PROVEN rather than eyeballed, and a .tsx cannot be imported by the node test
// environment (no JSX transform). The jumpiness this replaced was two
// discontinuities — the arm teleporting from full follow-through back to neutral
// at every loop, and the body height dropping instantly at the strike boundary —
// and both are the kind of thing that reads as "a bit janky" in motion and is
// invisible in a screenshot. chop-curve.test asserts they cannot come back.

/** Smoothstep 0..1 — zero velocity at both ends, so joins never kink. */
export function smoothstep(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

/**
 * Ease-out cubic: quick off the mark, decelerating into the end.
 *
 * This is the strike, and it replaced Math.sqrt for a measurable reason. sqrt
 * has an INFINITE slope at t = 0, so the arm covered 0.15 radians in a single
 * frame at the instant the strike began — a visible hitch, and the largest
 * remaining jump after the wrap was fixed. Cubic keeps the same "fast then
 * settle" character with a finite starting velocity (slope 3), so the swing
 * still snaps without the frame-sized step.
 */
export function easeOutCubic(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return 1 - (1 - c) ** 3;
}

/**
 * Frame-rate-independent approach toward a target.
 *
 * Used to ease limbs INTO an action rather than snapping to the first frame of
 * its pose — arriving at a desk and starting to build was a hard cut before.
 * The exponential form makes the smoothing identical at 60 or 144 fps, which a
 * plain lerp on delta is not.
 */
export function approach(current: number, target: number, lambda: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

/** Arm angle at rest, and the two extremes of the swing. */
export const CHOP_REST = -0.25;
export const CHOP_BACK = -2.5;
export const CHOP_THROUGH = 0.5;
/** Phase boundaries: wind-up ends, then the strike ends. */
export const CHOP_WIND_END = 0.55;
export const CHOP_STRIKE_END = 0.75;

/**
 * The swing curve: a long wind-up, a fast strike, a settle.
 *
 * Returns the arm angle for a phase 0..1 through one swing.
 *
 * A sine would be the obvious thing and it is exactly wrong — it spends equal
 * time going up and coming down, which reads as waving rather than chopping. The
 * force is all in the strike: the arms travel back slowly, the head comes down
 * fast, then they settle before the next blow.
 *
 * THE CYCLE STARTS AND ENDS AT REST, which is the whole point. The old curve
 * began at 0 and ended at 0.55, so every loop the arm teleported back to
 * neutral — one visible jump per second. Three eased segments now, and because
 * the last lands exactly where the first starts, the wrap is seamless.
 *
 * The strike uses easeOutCubic rather than sqrt: sqrt's infinite slope at zero
 * moved the arm 0.15 radians in one frame at the strike boundary, which was the
 * biggest remaining hitch once the wrap was continuous.
 */
export function chopArm(phase: number): number {
  if (phase < CHOP_WIND_END) {
    return CHOP_REST + (CHOP_BACK - CHOP_REST) * smoothstep(phase / CHOP_WIND_END);
  }
  if (phase < CHOP_STRIKE_END) {
    const t = (phase - CHOP_WIND_END) / (CHOP_STRIKE_END - CHOP_WIND_END);
    return CHOP_BACK + (CHOP_THROUGH - CHOP_BACK) * easeOutCubic(t);
  }
  const t = (phase - CHOP_STRIKE_END) / (1 - CHOP_STRIKE_END);
  return CHOP_THROUGH + (CHOP_REST - CHOP_THROUGH) * smoothstep(t);
}

/**
 * How high the character rises, for a phase 0..1.
 *
 * Onto the balls of the feet through the wind-up, back down through the strike.
 * Zero at both ends of the cycle so it, too, is seamless across the wrap — the
 * old version branched at the strike boundary and dropped the body instantly.
 */
export function chopLift(phase: number): number {
  const PEAK = 0.05;
  return phase < CHOP_WIND_END
    ? PEAK * smoothstep(phase / CHOP_WIND_END)
    : PEAK * (1 - smoothstep((phase - CHOP_WIND_END) / (1 - CHOP_WIND_END)));
}

/**
 * Torso pitch, DERIVED from the arm angle rather than from the phase.
 *
 * Deriving it means it cannot introduce a seam of its own: the arm curve is
 * already continuous, so anything computed from it is too. The old version
 * branched on phase independently and jumped.
 */
export function chopPitch(arm: number): number {
  const span = (arm - CHOP_BACK) / (CHOP_THROUGH - CHOP_BACK); // 0 back → 1 through
  return -0.08 + 0.42 * span;
}
