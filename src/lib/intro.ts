// The introduction: the first eight things a new fund does, in order.
//
// Structurally different from dailies and the difference matters. A daily is one
// of three drawn from a pool, resets, and assumes you already know what the
// words mean. The introduction is a fixed ORDERED chain, completed once, and its
// job is not to give you something to do — it is to make the game legible.
//
// So the steps are sequenced by DEPENDENCY, not by reward. You cannot fit an
// instrument before you own one, and being shown a fitting task while your
// Instruments panel is empty teaches you that the game's instructions are
// unreliable. Each step also carries a `why`, because "open a Treasury Desk" is
// an instruction and "Treasury Desks reinvest at 0.75% instead of 2%, so they
// compound cheaper" is a reason — and a player who understands the reason has
// learned the game rather than followed a checklist.
//
// One step is visible at a time. A list of eight tasks on a fresh account is a
// wall; one task with a stated reason is a next move.

import { getDb } from './db';
import { GameError } from './errors';
import { addXp, type XpTrack } from './progression';
import { grantScrip } from './scrip';
import type { QuestAction } from './quests';

export interface IntroStep {
  key: string;
  /** Imperative, and specific enough to act on without opening a wiki. */
  label: string;
  /** The mechanic this step exists to teach. */
  why: string;
  action: QuestAction;
  target: number;
  track: XpTrack;
  xp: number;
  scrip: number;
  /** Where the player has to be. The client links straight to it. */
  href: string;
}

/**
 * The chain.
 *
 * Front-loaded rewards. The first two steps pay more Scrip per unit of effort
 * than anything later, because the cost of a player quitting is highest in the
 * first ten minutes and lowest once they have a floor running.
 *
 * THE LAST TWO STEPS GO OUTSIDE, and that is the point of the whole chain.
 *
 * It used to end on "buy something on the Exchange" — eight steps, all indoors,
 * finishing inside the same building it started in. The Scrip total was tuned so
 * a finisher could afford a Satchel on the reasoning that this "hands you the
 * key to the outdoors", and then nothing ever mentioned the outdoors, no step
 * bought a pack, and there was no route to a door. A tutorial's last instruction
 * is the one that decides what a player does next, and that one said: stop.
 *
 * So the total is now tuned to leave a finisher having ALREADY walked out to the
 * Grounds and bought a Satchel, with change. The key and the lock, not the key.
 *
 * THE FIRST STEPS HAPPEN IN THE MACHINE ROOM, not on the dashboard.
 *
 * A fund now STARTS outside, at the arrival gate on the Grounds (lib/demo,
 * DEMO_ENTRY), which makes `href` load-bearing in a way it was not when every
 * player began on /app already looking at the buttons. Building, routing and
 * levelling a desk are all things you can do standing next to one in the
 * Machine Room — a door twelve tiles from where the player spawns — and sending
 * them to a wall of panels instead would teach them, in the first thirty
 * seconds, that the rooms are scenery and the dashboard is the game. The
 * dashboard is still there and still does all of it; it is not where a player
 * should be told to learn it.
 */
export const INTRO_STEPS: IntroStep[] = [
  {
    key: 'intro_mint',
    label: 'Open your first desk',
    why: 'Desks are the only thing that earns. Everything else in Evergreen exists to make a desk earn more.',
    action: 'mint_desk',
    target: 1,
    track: 'operations',
    xp: 200,
    scrip: 600,
    // The Machine Room: walk to a bare tile and "Build a desk here" appears
    // under your feet. The dashboard's Open Desk modal does the same thing from
    // a list, which is the wrong first impression of a game you navigate by
    // walking.
    href: '/app/floor',
  },
  {
    key: 'intro_claim',
    label: 'Route your first yield',
    why: 'Yield accrues whether you are here or not, but it stops at a 12-hour ceiling. Routing it empties the buffer so the desk keeps earning.',
    action: 'claim',
    target: 1,
    track: 'operations',
    xp: 200,
    scrip: 600,
    // Routed at the desk that made it, where the storage bar is a thing you can
    // see filling rather than a number in a list.
    href: '/app/floor',
  },
  {
    key: 'intro_allocation',
    label: 'Open an allocation',
    why: 'Allocations are where instruments come from. They are capped per day across the whole protocol, so they are the one thing you cannot simply buy your way through.',
    action: 'open_allocation',
    target: 1,
    track: 'scouting',
    xp: 250,
    scrip: 500,
    // The dashboard, not the Portfolio. Allocations are OPENED here; the
    // Portfolio is where the instrument lands afterwards, and sending a player
    // there gives them a panel whose own empty state tells them to go back.
    href: '/app',
  },
  {
    key: 'intro_equip',
    label: 'Fit an instrument to a desk',
    why: 'Four slots per desk, averaged and then raised to the power 0.75 — which means spreading rare instruments thin is worth less than concentrating them. This is the single biggest lever on your yield.',
    action: 'equip_instrument',
    target: 1,
    track: 'scouting',
    xp: 250,
    scrip: 500,
    href: '/app/inventory',
  },
  {
    key: 'intro_place',
    label: 'Arrange a desk on your floor',
    why: 'Where a desk stands changes what it earns. Support desks pay a bonus to everything in reach, the central aisle pays more, and crowding costs you.',
    action: 'place_desk',
    target: 1,
    track: 'operations',
    xp: 250,
    scrip: 400,
    href: '/app/floor',
  },
  {
    key: 'intro_upgrade',
    label: 'Take a desk to level 2',
    why: 'Levelling multiplies a desk. It also consumes fund capital, which is shared — so a taller floor is a narrower one, and choosing between them is the whole game.',
    action: 'upgrade_desk',
    target: 1,
    track: 'operations',
    xp: 300,
    scrip: 400,
    // Levelled at the desk it levels, quoted against the live balance — the
    // price IS the decision, because the capital is shared with every other
    // desk standing on that floor.
    href: '/app/floor',
  },
  {
    key: 'intro_note',
    label: 'Open a Fixed Income Note',
    why: 'A Note locks BNTY for a fixed term at a published rate. The long end pays more than six times the short one, because the point is taking float out of circulation.',
    action: 'open_note',
    target: 1,
    track: 'treasury',
    xp: 300,
    scrip: 400,
    href: '/app/stake',
  },
  {
    key: 'intro_market',
    label: 'Buy something on the Exchange',
    why: 'Every instrument and cosmetic is tradeable between players. The house takes 2% and gives all of it back — half burned, half into the rewards pool.',
    action: 'market_buy',
    target: 1,
    track: 'trading',
    xp: 300,
    scrip: 600,
    href: '/app/market',
  },
  {
    key: 'intro_outside',
    label: 'Step outside',
    why: 'Evergreen is a place, not a menu. There is no nav bar — the Machine Room, the Exchange and everything past the fence are doors you walk to, and they are all off the Grounds.',
    action: 'enter_region',
    target: 1,
    track: 'scouting',
    xp: 250,
    scrip: 400,
    href: '/app/grounds',
  },
  {
    key: 'intro_pack',
    label: 'Buy a pack',
    why: 'A pack is the only thing that carries salvage home. It is never dropped and never lost — what you lose is whatever is inside it when something kills you, which is the whole risk past the fence.',
    action: 'buy_pack',
    target: 1,
    track: 'scouting',
    xp: 350,
    scrip: 600,
    href: '/app/grounds',
  },
];

export const INTRO_TOTAL_SCRIP = INTRO_STEPS.reduce((sum, s) => sum + s.scrip, 0);

const BY_KEY = new Map(INTRO_STEPS.map((s) => [s.key, s]));

interface IntroRow {
  quest_key: string;
  progress: number;
  claimed_at: number | null;
}

function rows(wallet: string): Map<string, IntroRow> {
  const found = getDb()
    .prepare("SELECT quest_key, progress, claimed_at FROM daily_quests WHERE wallet = ? AND day = -1")
    .all(wallet) as unknown as IntroRow[];
  return new Map(found.map((r) => [r.quest_key, r]));
}

/**
 * Stored in `daily_quests` under the reserved day index -1.
 *
 * A real day index is a count of days since the epoch and is never negative, so
 * -1 cannot collide with one. Reusing the table rather than adding another keeps
 * the progress-recording path single: one INSERT shape, one conflict clause, one
 * place where a write can go wrong. A separate intro_quests table would have
 * meant a second copy of that logic that only runs for new players — which is
 * the code least likely to be exercised and most likely to be broken.
 */
export const INTRO_DAY = -1;

export interface IntroStepView extends IntroStep {
  progress: number;
  done: boolean;
  claimed: boolean;
  /** The one step the player should be looking at. Exactly one is ever true. */
  current: boolean;
}

export interface IntroState {
  steps: IntroStepView[];
  /** Null once every step is claimed. */
  currentKey: string | null;
  completed: number;
  total: number;
  finished: boolean;
}

/**
 * The introduction as the player should see it.
 *
 * `current` is the first UNCLAIMED step, not the first incomplete one — a step
 * you finished but have not collected is still the thing in front of you, and
 * skipping past it would leave the reward stranded behind a panel nobody
 * reopens.
 */
export function introState(wallet: string): IntroState {
  const stored = rows(wallet);
  let currentKey: string | null = null;

  const steps = INTRO_STEPS.map((step) => {
    const row = stored.get(step.key);
    const progress = Math.min(step.target, row?.progress ?? 0);
    const claimed = Boolean(row?.claimed_at);
    if (!claimed && currentKey === null) currentKey = step.key;
    return {
      ...step,
      progress,
      done: progress >= step.target,
      claimed,
      current: false,
    };
  });

  for (const step of steps) step.current = step.key === currentKey;

  const completed = steps.filter((s) => s.claimed).length;
  return {
    steps,
    currentKey,
    completed,
    total: steps.length,
    finished: completed === steps.length,
  };
}

/**
 * Record progress against the introduction.
 *
 * Only the CURRENT step advances. Without that, a player who happened to open
 * three allocations while working on step one would find steps three and four
 * already complete and never read what they were for — and the introduction's
 * entire job is to be read.
 *
 * Called from the same places recordQuestProgress is, and equally forbidden from
 * throwing: a broken tutorial must never cost somebody the action that triggered
 * it.
 */
export function recordIntroProgress(wallet: string, action: QuestAction, amount = 1): void {
  if (!(amount > 0)) return;
  try {
    const state = introState(wallet);
    if (!state.currentKey) return;
    const step = BY_KEY.get(state.currentKey);
    if (!step || step.action !== action) return;
    getDb()
      .prepare(
        `INSERT INTO daily_quests (wallet, day, quest_key, progress) VALUES (?,?,?,?)
           ON CONFLICT(wallet, day, quest_key) DO UPDATE SET progress = progress + excluded.progress`
      )
      .run(wallet, INTRO_DAY, step.key, amount);
  } catch (error) {
    console.error('[intro] progress write failed', error);
  }
}

/** Collect a finished intro step. Guards against double-claiming. */
export function claimIntroStep(wallet: string, key: string) {
  const step = BY_KEY.get(key);
  if (!step) throw new GameError(`Unknown introduction step: ${key}`, 404);

  const state = introState(wallet);
  const view = state.steps.find((s) => s.key === key)!;
  if (view.claimed) throw new GameError('Already collected', 400);
  if (!view.done) throw new GameError('That step is not finished yet', 400);

  // Conditional on claimed_at still being null, so two requests arriving
  // together cannot both pay out. Same guard the dailies use.
  const marked = getDb()
    .prepare(
      'UPDATE daily_quests SET claimed_at = ? WHERE wallet = ? AND day = ? AND quest_key = ? AND claimed_at IS NULL'
    )
    .run(Date.now(), wallet, INTRO_DAY, key);
  if (Number(marked.changes) === 0) throw new GameError('Already collected', 400);

  addXp(wallet, step.track, step.xp);
  grantScrip(wallet, step.scrip, `intro:${key}`);

  return { key, xp: step.xp, scrip: step.scrip, track: step.track, intro: introState(wallet) };
}
