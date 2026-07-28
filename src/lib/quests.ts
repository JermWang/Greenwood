// Daily quests.
//
// Three a day, drawn from a pool. Which three you get is DERIVED from your
// wallet and the day index rather than stored, which has two consequences worth
// keeping: the set is stable for the whole day however many times it is read,
// and it cannot be rerolled by wiping local state or replaying the endpoint.
//
// Rewards are XP, not tokens. Quests exist to give a session a shape — three
// concrete things to go and do — and paying them in BNTY would turn a retention
// device into an emission tap that the halving schedule never budgeted for.

import { getDb } from './db';
import { recordIntroProgress } from './intro';
import { GameError } from './errors';
import { addXp, type XpTrack } from './progression';
import { grantScrip } from './scrip';

/** The verbs the game reports. A quest listens to exactly one. */
export type QuestAction =
  | 'claim'
  | 'open_allocation'
  | 'equip_instrument'
  | 'mint_desk'
  | 'upgrade_desk'
  | 'place_desk'
  | 'open_note'
  | 'market_buy'
  | 'market_list'
  | 'cosmetic_upgrade'
  /** Bought a pack, or upgraded to a bigger one. */
  | 'buy_pack'
  /**
   * Walked into an OUTDOOR region.
   *
   * Deliberately not fired for the Machine Room or the Trading Floor. Those are
   * where a player already is; counting them would let the introduction's "step
   * outside" complete without anybody stepping outside, which is the one thing
   * that step exists to cause.
   */
  | 'enter_region'
  /** Felled a tree. Counted in LOGS, not swings -- an ironbark is worth four. */
  | 'chop_tree';

export interface QuestDef {
  key: string;
  label: string;
  action: QuestAction;
  target: number;
  track: XpTrack;
  xp: number;
}

/**
 * The pool. Every entry has to be completable in one sitting by a mid-game
 * fund without spending real money — a daily that cannot be finished is worse
 * than no daily, because it teaches players to ignore the panel.
 */
export const QUEST_POOL: QuestDef[] = [
  { key: 'route_3', label: 'Route yield 3 times', action: 'claim', target: 3, track: 'operations', xp: 220 },
  { key: 'route_1', label: 'Route your yield', action: 'claim', target: 1, track: 'operations', xp: 90 },
  { key: 'open_2_allocations', label: 'Open 2 allocations', action: 'open_allocation', target: 2, track: 'scouting', xp: 260 },
  { key: 'open_1_allocation', label: 'Open an allocation', action: 'open_allocation', target: 1, track: 'scouting', xp: 120 },
  { key: 'equip_1', label: 'Fit an instrument to a desk', action: 'equip_instrument', target: 1, track: 'scouting', xp: 140 },
  { key: 'mint_1_desk', label: 'Open a new desk', action: 'mint_desk', target: 1, track: 'operations', xp: 200 },
  { key: 'upgrade_1_desk', label: 'Level up a desk', action: 'upgrade_desk', target: 1, track: 'operations', xp: 180 },
  { key: 'rearrange_3', label: 'Rearrange 3 desks on your floor', action: 'place_desk', target: 3, track: 'operations', xp: 130 },
  { key: 'open_note', label: 'Open a Fixed Income Note', action: 'open_note', target: 1, track: 'treasury', xp: 240 },
  { key: 'market_buy_1', label: 'Buy anything on the Exchange', action: 'market_buy', target: 1, track: 'trading', xp: 210 },
  { key: 'market_list_1', label: 'List something on the Exchange', action: 'market_list', target: 1, track: 'trading', xp: 150 },
  { key: 'chop_10', label: 'Bring Dez ten logs', action: 'chop_tree', target: 10, track: 'scouting', xp: 240 },
  { key: 'chop_3', label: 'Fell three trees for Dez', action: 'chop_tree', target: 3, track: 'scouting', xp: 110 },
  { key: 'refine_1', label: 'Refine a cosmetic at the Outfitter', action: 'cosmetic_upgrade', target: 1, track: 'trading', xp: 190 },
];

const BY_KEY = new Map(QUEST_POOL.map((q) => [q.key, q]));

/**
 * Scrip paid per point of XP a quest awards.
 *
 * Derived rather than a column on every pool entry so the whole daily payout
 * curve is one number to tune. At 1:1 the three dailies come to roughly 500
 * Scrip a day, which puts a standard cosmetic about five days of play away —
 * close enough to feel reachable in the first session, far enough that buying
 * Scrip with BNTY is still worth something.
 *
 * Paid in Scrip and never in BNTY, for the same reason as always: a daily that
 * pays the token is an emission tap the halving schedule never budgeted for.
 */
export const SCRIP_PER_QUEST_XP = 1;

export const questScrip = (def: QuestDef) => Math.round(def.xp * SCRIP_PER_QUEST_XP);

export const DAILY_COUNT = 3;

export const dayIndex = (now = Date.now()) => Math.floor(now / 86_400_000);

/** Small deterministic hash, so the same wallet+day always yields the same set. */
function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * The three quests for this wallet today.
 *
 * Picked by walking the pool from a seeded offset with a stride, which spreads
 * the set out instead of handing back three neighbours.
 *
 * Both passes are bounded, and the second exists because the stride is only
 * guaranteed to visit every entry when it is coprime with the pool size. At a
 * prime pool size every stride qualifies; at a composite one — 12 with a stride
 * of 6, say — the walk cycles through two entries forever. An unbounded loop
 * there does not return a short list, it hangs the request, so the pool size is
 * not something a later edit should be able to turn into an outage.
 */
export function questsFor(wallet: string, day = dayIndex()): QuestDef[] {
  const seed = hash(`${wallet.toLowerCase()}:${day}`);
  const size = QUEST_POOL.length;
  const stride = 1 + (seed % (size - 1));
  const start = seed % size;
  const want = Math.min(DAILY_COUNT, size);
  const picked: QuestDef[] = [];
  const take = (index: number) => {
    const candidate = QUEST_POOL[index % size];
    if (!picked.includes(candidate)) picked.push(candidate);
  };
  for (let i = 0; i < size && picked.length < want; i += 1) take(start + i * stride);
  // Top-up scan: only runs when the strided walk came up short.
  for (let i = 0; i < size && picked.length < want; i += 1) take(start + i);
  return picked;
}

interface QuestRow {
  quest_key: string;
  progress: number;
  claimed_at: number | null;
}

function rowsFor(wallet: string, day: number): Map<string, QuestRow> {
  const rows = getDb()
    .prepare('SELECT quest_key, progress, claimed_at FROM daily_quests WHERE wallet = ? AND day = ?')
    .all(wallet, day) as unknown as QuestRow[];
  return new Map(rows.map((r) => [r.quest_key, r]));
}

export interface QuestView extends QuestDef {
  progress: number;
  complete: boolean;
  claimed: boolean;
  /** Scrip this quest pays on top of its XP. */
  scrip: number;
}

export function dailyQuests(wallet: string, now = Date.now()): {
  day: number;
  /** Milliseconds until the set rolls over, for the countdown. */
  resetsInMs: number;
  quests: QuestView[];
} {
  const day = dayIndex(now);
  const rows = rowsFor(wallet, day);
  return {
    day,
    resetsInMs: (day + 1) * 86_400_000 - now,
    quests: questsFor(wallet, day).map((def) => {
      const row = rows.get(def.key);
      const progress = Math.min(def.target, row?.progress ?? 0);
      return {
        ...def,
        progress,
        complete: progress >= def.target,
        claimed: Boolean(row?.claimed_at),
        scrip: questScrip(def),
      };
    }),
  };
}

/**
 * Report that the player did something.
 *
 * Only advances quests active for that wallet TODAY, so an action never banks
 * progress against a quest they have not been given. Safe to call from any game
 * action — unmatched verbs are a no-op.
 */
export function recordQuestProgress(
  wallet: string,
  action: QuestAction,
  amount = 1,
  now = Date.now()
): void {
  if (!(amount > 0)) return;

  // The introduction advances off the same signal, from here rather than from
  // each of the nine call sites. Every action that counts for a daily counts for
  // the tutorial, and wiring them separately would mean a new action was only
  // ever hooked up to one of the two — with the tutorial, the half nobody
  // notices, being the half left broken.
  recordIntroProgress(wallet, action, amount);

  const day = dayIndex(now);
  const active = questsFor(wallet, day).filter((q) => q.action === action);
  if (active.length === 0) return;
  const db = getDb();
  for (const quest of active) {
    try {
      db.prepare(
        `INSERT INTO daily_quests (wallet, day, quest_key, progress) VALUES (?,?,?,?)
           ON CONFLICT(wallet, day, quest_key) DO UPDATE SET progress = progress + excluded.progress`
      ).run(wallet, day, quest.key, amount);
    } catch (error) {
      // Never let quest bookkeeping fail the action that triggered it. A player
      // who opens a Note and loses it to a broken daily has lost real value; a
      // player whose daily missed one tick has lost almost nothing.
      console.error('[quests] progress write failed', error);
    }
  }
}

/** Collect a finished quest's XP. Guards against double-claiming. */
export function claimQuest(wallet: string, key: string, now = Date.now()) {
  const def = BY_KEY.get(key);
  if (!def) throw new GameError('Unknown quest', 404);
  const day = dayIndex(now);
  if (!questsFor(wallet, day).some((q) => q.key === key)) {
    throw new GameError('That quest is not one of today\'s', 400);
  }
  const row = rowsFor(wallet, day).get(key);
  if (!row || row.progress < def.target) throw new GameError('Quest is not finished yet', 400);
  if (row.claimed_at) throw new GameError('Already claimed', 400);

  // Conditional UPDATE, not a read-then-write: two requests arriving together
  // would both pass the check above and both pay out.
  const claimed = getDb()
    .prepare(
      'UPDATE daily_quests SET claimed_at = ? WHERE wallet = ? AND day = ? AND quest_key = ? AND claimed_at IS NULL'
    )
    .run(now, wallet, day, key);
  if (Number(claimed.changes) === 0) throw new GameError('Already claimed', 400);

  addXp(wallet, def.track, def.xp);
  // Bound Scrip: the faucet stays inside the game. grantScrip is the only door
  // it comes through, and bound is all it ever hands out.
  const scrip = grantScrip(wallet, questScrip(def), `quest:${key}`);
  return { key, track: def.track, xp: def.xp, scrip };
}
