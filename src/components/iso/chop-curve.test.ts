// Smoothness, asserted rather than eyeballed.
//
// The animation was jumpy for two reasons, both invisible in a screenshot and
// obvious in motion:
//
//   THE ARM TELEPORTED ONCE PER SWING. The old curve started at 0 and ended at
//   0.55, so at every loop the arm snapped from full follow-through back to
//   neutral — a discontinuity of half a radian, roughly once a second.
//
//   THE BODY DROPPED INSTANTLY AT THE STRIKE. Height was `p < 0.62 ? rising : 0`,
//   so it fell from its peak to zero between two adjacent frames.
//
// Both are continuity properties of pure functions, which means they can be
// tested exactly. That is the point of this file: "looks smooth" is a judgement,
// but "no frame-to-frame step exceeds X" is a fact, and a future retune cannot
// quietly reintroduce a seam without failing here.
import { describe, expect, it } from 'vitest';
import {
  approach,
  chopArm,
  easeOutCubic,
  chopLift,
  chopPitch,
  smoothstep,
  CHOP_REST,
  CHOP_BACK,
  CHOP_THROUGH,
  CHOP_WIND_END,
} from './chop-curve';

/** Sample a full cycle at a fine step, wrapping past 1 back to 0. */
function samples(fn: (p: number) => number, steps = 2000): number[] {
  return Array.from({ length: steps + 1 }, (_, i) => fn((i / steps) % 1));
}

/** The largest jump between consecutive samples. */
function maxStep(values: number[]): number {
  let worst = 0;
  for (let i = 1; i < values.length; i += 1) {
    worst = Math.max(worst, Math.abs(values[i] - values[i - 1]));
  }
  return worst;
}

describe('the swing curve', () => {
  /**
   * The bug this file exists for. Start and end must be the same angle, or the
   * loop has a teleport in it.
   */
  it('starts and ends at rest, so the loop wraps seamlessly', () => {
    expect(chopArm(0)).toBeCloseTo(CHOP_REST, 6);
    expect(chopArm(0.999999)).toBeCloseTo(CHOP_REST, 4);
  });

  /**
   * Thresholds are measured, not guessed.
   *
   * At 2000 samples the worst step is 0.022 rad, and it sits at the strike
   * boundary — which is correct, because the strike is the fast part. What
   * matters is that it is bounded and small: the wrap teleport was 0.80, and the
   * sqrt ease this replaced spiked 0.15 in a single sample because sqrt has an
   * infinite slope at zero. 0.03 leaves headroom for a retune without letting
   * either of those back in.
   */
  it('never steps more than a hair between adjacent frames', () => {
    expect(maxStep(samples(chopArm))).toBeLessThan(0.03);
  });

  it('actually swings: back on the wind-up, through on the strike', () => {
    // Not just smooth — still a chop. A curve that never moved would pass the
    // continuity checks perfectly.
    expect(chopArm(CHOP_WIND_END)).toBeCloseTo(CHOP_BACK, 4);
    const peak = Math.max(...samples(chopArm));
    expect(peak).toBeGreaterThan(CHOP_THROUGH - 0.01);
    expect(Math.min(...samples(chopArm))).toBeLessThan(CHOP_BACK + 0.01);
  });

  it('winds back monotonically, so the arm never stutters on the way up', () => {
    let previous = chopArm(0);
    for (let i = 1; i <= 500; i += 1) {
      const value = chopArm((i / 500) * CHOP_WIND_END);
      expect(value).toBeLessThanOrEqual(previous + 1e-9);
      previous = value;
    }
  });
});

describe('the rise', () => {
  it('is zero at both ends of the cycle, so it does not drop at the wrap', () => {
    expect(chopLift(0)).toBeCloseTo(0, 6);
    expect(chopLift(0.999999)).toBeCloseTo(0, 4);
  });

  it('never steps visibly between frames', () => {
    expect(maxStep(samples(chopLift))).toBeLessThan(0.002);
  });

  it('peaks at the top of the wind-up rather than somewhere arbitrary', () => {
    const values = samples(chopLift);
    const peakAt = values.indexOf(Math.max(...values)) / (values.length - 1);
    expect(peakAt).toBeGreaterThan(CHOP_WIND_END - 0.06);
    expect(peakAt).toBeLessThan(CHOP_WIND_END + 0.06);
  });
});

describe('the torso', () => {
  /**
   * Pitch is derived from the arm, so it inherits the arm's continuity. Asserted
   * anyway: the previous version computed it from its own phase branch and that
   * is exactly how the seam got in.
   */
  it('is continuous because it follows the arm', () => {
    expect(maxStep(samples((p) => chopPitch(chopArm(p))))).toBeLessThan(0.01);
  });

  it('leans back when wound up and forward when struck through', () => {
    expect(chopPitch(CHOP_BACK)).toBeLessThan(chopPitch(CHOP_THROUGH));
  });
});

describe('smoothstep', () => {
  it('is clamped and hits both ends exactly', () => {
    expect(smoothstep(-1)).toBe(0);
    expect(smoothstep(0)).toBe(0);
    expect(smoothstep(1)).toBe(1);
    expect(smoothstep(2)).toBe(1);
  });

  it('has zero slope at both ends, which is what stops a kink', () => {
    const e = 1e-4;
    expect(smoothstep(e) / e).toBeLessThan(0.01);
    expect((1 - smoothstep(1 - e)) / e).toBeLessThan(0.01);
  });
});

describe('the strike ease', () => {
  /**
   * The fix, as a property. sqrt(t) has an unbounded derivative at t = 0 and
   * that is exactly why the arm hitched at the strike; cubic's is 3. Asserting
   * the slope rather than the shape means swapping in another ease later cannot
   * quietly reintroduce an infinite one.
   */
  it('has a finite starting velocity, unlike sqrt', () => {
    const e = 1e-6;
    const cubicSlope = easeOutCubic(e) / e;
    const sqrtSlope = Math.sqrt(e) / e;
    expect(cubicSlope).toBeLessThan(4);
    expect(sqrtSlope).toBeGreaterThan(100); // what it used to be
  });

  it('still front-loads the movement, so a strike reads as a strike', () => {
    // More than half the distance covered in the first third.
    expect(easeOutCubic(1 / 3)).toBeGreaterThan(0.5);
  });
});

describe('easing into a pose', () => {
  it('moves toward the target without overshooting', () => {
    let v = 0;
    for (let i = 0; i < 200; i += 1) v = approach(v, 1, 22, 1 / 60);
    expect(v).toBeGreaterThan(0.99);
    expect(v).toBeLessThanOrEqual(1);
  });

  /**
   * Frame-rate independence. A plain `v += (t - v) * k` would converge at
   * different speeds on a 60Hz and a 144Hz display, so the same animation would
   * be visibly snappier on better hardware.
   */
  it('converges the same amount per unit time at any frame rate', () => {
    const run = (fps: number) => {
      let v = 0;
      for (let i = 0; i < fps; i += 1) v = approach(v, 1, 8, 1 / fps);
      return v;
    };
    expect(Math.abs(run(60) - run(144))).toBeLessThan
      (0.002);
  });
});
