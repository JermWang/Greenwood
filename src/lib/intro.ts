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
//
// ORDERED IS NOT THE SAME AS BLOCKING, and that distinction is why `canAct`
// exists. Five of these steps wait on something the player does not control — a
// random find, money they have not earned yet, another player having listed
// something — and a strictly ordered chain stops dead at the first of them with
// everything behind it unreachable, including the two outdoor steps the whole
// chain was written to reach.
//
// That is not hypothetical here. Since the token went live the starter grant is
// zero (starterGrantFor in lib/game), so a real new fund holds no GREEN at all
// and the wall arrives at step THREE of ten.
//
// So a step whose gate is shut is DEFERRED, not blocking: it keeps its place in
// the list, the chain moves past it, and it becomes current again the moment the
// gate opens. Deferred rather than skipped, because the ordering still teaches
// the dependencies and a player who never fits an instrument has missed the
// biggest lever in the game.

import { getDb } from './db';
import { GameError } from './errors';
import { addXp, type XpTrack } from './progression';
import { grantScrip } from './scrip';
import type { QuestAction } from './quests';

/**
 * What the player can act on right now.
 *
 * Supplied by the caller rather than read here, because the introduction must
 * not reach into the game modules that own these numbers — lib/game already
 * imports this file to record progress, and importing it back would close the
 * cycle.
 *
 * Every field is optional and every gate treats "not supplied" as PASSING. A
 * caller that cannot afford the extra reads gets the plain ordered chain, which
 * is exactly the behaviour this had before gating existed.
 */
export interface IntroContext {
  /** Sealed allocations the player is holding, waiting to be opened. */
  heldAllocations?: number;
  /** Instruments in the Portfolio not currently fitted to a desk. */
  unfittedInstruments?: number;
  /** Spendable GREEN. */
  greenBalance?: number;
  /** What opening one allocation currently costs, in GREEN. */
  allocationCost?: number;
  /** The cheapest desk level-up available, in GREEN. */
  deskUpgradeCost?: number;
  /** The smallest Note the treasury will write, in GREEN. */
  noteMinimum?: number;
  /** Listings by OTHER players that this player could actually pay for. */
  affordableListings?: number;
}

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
  /** Where the player has to be. Used for resuming, never for teleporting. */
  href: string;
  /**
   * The ROOM, named the way a player would say it.
   *
   * The guide rendered `href` as a "Go there" button, which walked the player
   * to the door for them. A game whose entire navigation rule is that you move
   * through the world should not have its tutorial opt out of that on step one
   * — and a player who is teleported to the Machine Room six times still does
   * not know where the Machine Room is. Naming it makes the first thing the
   * introduction teaches "how to get somewhere", which every later step needs.
   */
  where: string;
  /**
   * Whether this step can be acted on at all right now.
   *
   * Only steps that depend on LUCK, on MONEY NOT YET EARNED, or on OTHER
   * PLAYERS define one. A step that merely takes effort is still actionable —
   * telling somebody to go and do it is the entire point of the chain.
   *
   * Absent means always actionable.
   */
  canAct?: (ctx: IntroContext) => boolean;
  /**
   * Shown INSTEAD of a call to action while `canAct` is false.
   *
   * It has to say what to do MEANWHILE, not merely that the player is stuck.
   * "Come back later" is the sentence that ends a session.
   */
  waiting?: string;
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
    where: 'the Machine Room',
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
    where: 'the Machine Room',
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
    href: '/app/floor',
    where: 'the Machine Room',
    /*
     * Two conditions, and the player directly controls neither. An allocation
     * has to be FOUND — desks turn them up as they run, and the whole protocol
     * only finds CRATES_FOUND_PER_DAY of them a day — and opening one costs
     * CRATE_OPEN_GREEN, which is ten times what the starter grant used to be and
     * infinitely more than the zero it is now.
     *
     * This is the step that made parking necessary. Ordered third of ten, it
     * stopped the chain dead on every real new account, and took both outdoor
     * steps down with it.
     */
    canAct: (ctx) =>
      (ctx.heldAllocations ?? 1) > 0 &&
      (ctx.greenBalance ?? Infinity) >= (ctx.allocationCost ?? 0),
    waiting:
      'No allocation to open yet — either none found, or not enough GREEN to cover one. Desks find them while they run, so keep yours producing and this comes back on its own.',
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
    where: 'the Machine Room',
    // Depends on the step above having actually paid out an instrument, which
    // is a roll, not a purchase.
    canAct: (ctx) => (ctx.unfittedInstruments ?? 1) > 0,
    waiting:
      'Nothing to fit yet — instruments come out of allocations. This step returns the moment you have one spare.',
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
    where: 'the Machine Room',
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
    where: 'the Machine Room',
    // Gated on the CHEAPEST level-up on the floor, not the dearest: the step
    // only asks for one desk to reach level 2, so pricing it off the most
    // expensive desk would park it while an affordable upgrade sat right there.
    canAct: (ctx) => (ctx.greenBalance ?? Infinity) >= (ctx.deskUpgradeCost ?? 0),
    waiting:
      'Not enough GREEN for a level-up yet. Your desk is earning it while you read this — route the yield when it builds and this comes straight back.',
  },
  {
    key: 'intro_note',
    label: 'Open a Fixed Income Note',
    why: 'A Note locks GREEN for a fixed term at a published rate. The long end pays more than six times the short one, because the point is taking float out of circulation.',
    action: 'open_note',
    target: 1,
    track: 'treasury',
    xp: 300,
    scrip: 400,
    href: '/app/stake',
    where: 'the Trading Floor',
    canAct: (ctx) => (ctx.greenBalance ?? Infinity) >= (ctx.noteMinimum ?? 0),
    waiting:
      'A Note needs at least the treasury minimum in GREEN and you are short of it. Keep the desk running and route what it makes — this returns as soon as you can cover it.',
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
    href: '/app/trading-floor',
    where: 'the Trading Floor',
    /*
     * The only step in the chain that depends on ANOTHER PLAYER. There is
     * nothing to buy until somebody else lists something, and no amount of
     * effort by this player changes that — which is exactly the shape of thing
     * that must never block a tutorial.
     */
    canAct: (ctx) => (ctx.affordableListings ?? 1) > 0,
    waiting:
      'Nothing on the Exchange you can afford right now — every listing comes from another player, so the shelf fills on its own. This step returns when there is something to buy.',
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
    where: 'Evergreen Grounds',
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
    where: 'Evergreen Grounds',
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
  /**
   * True when this step is unclaimed but cannot be acted on yet, so the chain
   * has moved past it for now. It comes back on its own.
   */
  parked: boolean;
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
export function introState(wallet: string, ctx: IntroContext = {}): IntroState {
  const stored = rows(wallet);

  const steps: IntroStepView[] = INTRO_STEPS.map((step) => {
    const row = stored.get(step.key);
    const progress = Math.min(step.target, row?.progress ?? 0);
    const claimed = Boolean(row?.claimed_at);
    const done = progress >= step.target;
    return {
      ...step,
      progress,
      done,
      claimed,
      current: false,
      // A finished step is never parked, whatever its gate now says — the player
      // did the thing, and it is waiting to be collected.
      parked: !claimed && !done && step.canAct ? !step.canAct(ctx) : false,
    };
  });

  /*
   * The current step is the first unclaimed one the player CAN act on.
   *
   * The fallback matters as much as the rule. If every remaining step is parked
   * there is still something to show, so the panel can say what it is waiting
   * for rather than vanishing and leaving a finished-looking tutorial that is
   * not finished.
   */
  const firstActionable = steps.find((s) => !s.claimed && !s.parked);
  const firstUnclaimed = steps.find((s) => !s.claimed);
  const currentKey = (firstActionable ?? firstUnclaimed)?.key ?? null;

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
    /*
     * Credit the first UNCLAIMED step that wants this action...
     *
     * It used to credit only whatever step this function computed as current,
     * and parking broke that in a way worth spelling out, because it is the
     * opposite of the obvious guess.
     *
     * This function calls introState WITHOUT a context — it cannot build one,
     * since parking needs IntroContext and lib/game already imports this file.
     * So the step it called current was the first UNCLAIMED one, gates ignored:
     * the parked step. The parked step therefore still recorded fine. What
     * could not record was the step the player was actually being told to do —
     * the panel had moved on to the first ACTIONABLE step, the recorder was
     * still watching the parked one behind it, and the two never agreed again.
     * Parking the chain without this would have handed players an instruction
     * that could not be completed, which is worse than the wall it replaced.
     *
     * Matching on the action instead sidesteps the disagreement: it does not
     * care which step either half thinks is current. Exactly one step carries
     * any given action and claimed steps are skipped, so opening five
     * allocations still only ever completes the one allocation step.
     */
    const state = introState(wallet);
    const index = state.steps.findIndex((s) => !s.claimed && s.action === action);
    if (index < 0) return;

    /*
     * ...but only once everything in front of it is settled or gateable.
     *
     * This is the line that keeps both properties. A step is creditable when
     * every earlier step is either already claimed or CARRIES A GATE — because
     * a gate is the only honest reason the player could be acting out here
     * instead of on the step in front of them. An ungated, unclaimed step ahead
     * of this one means they are simply running ahead, and the original rule
     * applies: pre-completing a step they have not read defeats the point of
     * the chain.
     *
     * Checked against the gate EXISTING rather than against it being shut,
     * because whether it is shut depends on IntroContext and this is called
     * from deep inside lib/game, which cannot build one without closing an
     * import cycle. Existence is the part that is knowable here, and it is
     * enough: a gated step is exactly the one that might have been parked.
     */
    const settledOrGated = state.steps
      .slice(0, index)
      .every((s) => s.claimed || s.canAct);
    if (!settledOrGated) return;

    const step = state.steps[index];
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
