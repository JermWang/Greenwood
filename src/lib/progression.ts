// Experience tracks and Total Level.
//
// One number going up is a scoreboard; three numbers going up are three reasons
// to come back. The tracks are split along the things a fund actually DOES, so
// a player who only trades still sees a bar move, and a player who only farms
// sees a different one. Total Level is their sum — the single figure a profile
// can lead with, the way Kintara's dashboard does.
//
// XP is awarded for ACTIONS, never for holding. Paying out for balance would
// make progression a function of capital, which is exactly the dynamic the
// welcome boost and share cap exist to soften.

import { getDb } from './db';

export type XpTrack = 'trading' | 'treasury' | 'scouting' | 'operations';

export interface TrackDef {
  key: XpTrack;
  name: string;
  blurb: string;
}

export const TRACKS: TrackDef[] = [
  { key: 'trading', name: 'Trading', blurb: 'Buying, listing and selling — the Exchange and the Outfitter.' },
  { key: 'treasury', name: 'Treasury', blurb: 'Opening and running Fixed Income Notes.' },
  { key: 'scouting', name: 'Scouting', blurb: 'Opening allocations and fitting instruments.' },
  { key: 'operations', name: 'Operations', blurb: 'Opening desks, upgrading them, and running the floor.' },
];

const TRACK_KEYS = new Set<string>(TRACKS.map((t) => t.key));

/**
 * XP to go from `level` to the next one.
 *
 * Linear per level, so cumulative cost is quadratic: reaching level L costs
 * 50 * L * (L + 1). Level 5 is 1,500 and level 20 is 21,000 — steep enough that
 * a high level means something, shallow enough that the first few arrive in one
 * session. A player who never sees a level in their first sitting rarely
 * returns for the second.
 */
export const XP_PER_LEVEL_STEP = 100;

/**
 * The published ceiling on Total Level.
 *
 * Total Level is the sum of the four tracks, so without a cap it has no top and
 * the number on a profile means nothing except "has played longer". A ceiling
 * gives the leaderboard a finish line and lets the region gates be written
 * against a known range — the Deep Forest opening at 10 means something
 * different if the maximum is 25 than if it is unbounded.
 *
 * 25 is deliberately temporary. Raising a cap is a content release; lowering one
 * takes levels away from people who earned them, so the only safe direction to
 * be wrong in is low.
 *
 * XP KEEPS ACCRUING PAST THE CAP. Only the level is clamped. A player who plays
 * hard at the ceiling banks that work and collects the levels the moment the cap
 * moves — the alternative is telling your most engaged players that the next
 * fortnight does not count.
 */
export const MAX_TOTAL_LEVEL = 25;

/**
 * The most any single track may contribute.
 *
 * Equal to the total cap rather than a quarter of it, on purpose: a player who
 * only ever trades should still be able to reach the ceiling on Trading alone.
 * Forcing a spread would turn four optional routes into four chores.
 */
export const MAX_TRACK_LEVEL = MAX_TOTAL_LEVEL;

export function xpForNextLevel(level: number): number {
  return XP_PER_LEVEL_STEP * (level + 1);
}

/** Total XP required to have reached `level`. */
export function cumulativeXpFor(level: number): number {
  return (XP_PER_LEVEL_STEP * level * (level + 1)) / 2;
}

export function levelFromXp(xp: number): number {
  if (xp <= 0) return 0;
  // Inverse of cumulativeXpFor, floored. Solving 50*L*(L+1) = xp for L.
  const level = Math.floor((-1 + Math.sqrt(1 + (8 * xp) / XP_PER_LEVEL_STEP)) / 2);
  return Math.min(MAX_TRACK_LEVEL, Math.max(0, level));
}

export interface TrackProgress {
  key: XpTrack;
  name: string;
  blurb: string;
  xp: number;
  level: number;
  /** XP accumulated inside the current level. */
  intoLevel: number;
  /** True once this track has reached MAX_TRACK_LEVEL. */
  atCap: boolean;
  /** XP the current level requires in total. */
  levelSpan: number;
}

function readXp(wallet: string): Map<string, number> {
  const rows = getDb()
    .prepare('SELECT track, xp FROM xp_tracks WHERE wallet = ?')
    .all(wallet) as unknown as Array<{ track: string; xp: number }>;
  return new Map(rows.map((r) => [r.track, r.xp]));
}

/**
 * Award XP. Unknown tracks are ignored rather than inserted, so a typo at a
 * call site cannot quietly create a fourth bar nobody can see.
 */
export function addXp(wallet: string, track: XpTrack, amount: number): void {
  if (!TRACK_KEYS.has(track) || !(amount > 0)) return;
  getDb()
    .prepare(
      `INSERT INTO xp_tracks (wallet, track, xp) VALUES (?,?,?)
         ON CONFLICT(wallet, track) DO UPDATE SET xp = xp + excluded.xp`
    )
    .run(wallet, track, amount);
}

export function progressionOf(wallet: string): {
  tracks: TrackProgress[];
  totalLevel: number;
  totalXp: number;
  /** The ceiling, so the UI can say "18 / 25" without hardcoding the number. */
  maxTotalLevel: number;
  /** True once Total Level has hit the cap and further XP is banked, not spent. */
  capped: boolean;
} {
  const stored = readXp(wallet);
  const tracks = TRACKS.map((def) => {
    const xp = stored.get(def.key) ?? 0;
    const level = levelFromXp(xp);
    const atCap = level >= MAX_TRACK_LEVEL;
    return {
      ...def,
      xp,
      level,
      intoLevel: xp - cumulativeXpFor(level),
      // A capped track reports a full bar rather than a partial one into a level
      // it can never reach. Showing 40% toward level 26 would be a promise the
      // cap does not keep.
      levelSpan: atCap ? Math.max(1, xp - cumulativeXpFor(level)) : xpForNextLevel(level),
      atCap,
    };
  });
  const rawTotal = tracks.reduce((sum, t) => sum + t.level, 0);
  return {
    tracks,
    totalLevel: Math.min(MAX_TOTAL_LEVEL, rawTotal),
    totalXp: tracks.reduce((sum, t) => sum + t.xp, 0),
    maxTotalLevel: MAX_TOTAL_LEVEL,
    capped: rawTotal >= MAX_TOTAL_LEVEL,
  };
}
