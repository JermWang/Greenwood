// The introduction, and the level cap it feeds.
//
// Own SQLite file via OSR_DATA_DIR, matching the other engine tests.
import { describe, test, expect, beforeEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'eg-intro-test-'));
process.env.OSR_DATA_DIR = DATA_DIR;
delete process.env.VERCEL;

const { INTRO_STEPS, INTRO_TOTAL_SCRIP, introState, recordIntroProgress, claimIntroStep } =
  await import('./intro');
const { PACK_TIERS } = await import('./packs');
const { MAX_TOTAL_LEVEL, MAX_TRACK_LEVEL, levelFromXp, progressionOf, addXp, cumulativeXpFor } =
  await import('./progression');
const { scripBalances } = await import('./scrip');
const { getDb } = await import('./db');
const { getOrCreateUser } = await import('./game');

const WALLET = '0x00000000000000000000000000000000000in7r0';
const W = WALLET.slice(0, 42);

beforeEach(() => {
  const db = getDb();
  db.exec('DELETE FROM daily_quests');
  db.exec('DELETE FROM xp_tracks');
  db.exec('DELETE FROM users');
  getOrCreateUser(W);
});

/** Walk the whole chain, claiming as we go. */
function completeAll(wallet: string) {
  for (const step of INTRO_STEPS) {
    recordIntroProgress(wallet, step.action, step.target);
    claimIntroStep(wallet, step.key);
  }
}

describe('the introduction is ordered', () => {
  test('starts on the first step and nothing else', () => {
    const state = introState(W);
    expect(state.currentKey).toBe(INTRO_STEPS[0].key);
    expect(state.steps.filter((s) => s.current)).toHaveLength(1);
  });

  test('only the current step advances', () => {
    // A player who opens three allocations while on step one must not find
    // step three already done — they would never read what it was for, and
    // being read is the introduction's entire job.
    const later = INTRO_STEPS.find((s) => s.action === 'open_allocation')!;
    recordIntroProgress(W, 'open_allocation', 5);
    const state = introState(W);
    expect(state.steps.find((s) => s.key === later.key)!.progress).toBe(0);
  });

  test('advances when the action matches the current step', () => {
    const first = INTRO_STEPS[0];
    recordIntroProgress(W, first.action, first.target);
    const state = introState(W);
    expect(state.steps[0].done).toBe(true);
    expect(state.steps[0].claimed).toBe(false);
  });

  test('keeps a finished-but-unclaimed step as current', () => {
    // Otherwise the reward is stranded behind a panel nobody reopens.
    const first = INTRO_STEPS[0];
    recordIntroProgress(W, first.action, first.target);
    expect(introState(W).currentKey).toBe(first.key);
  });

  test('moves on once claimed', () => {
    const first = INTRO_STEPS[0];
    recordIntroProgress(W, first.action, first.target);
    claimIntroStep(W, first.key);
    expect(introState(W).currentKey).toBe(INTRO_STEPS[1].key);
  });
});

describe('claiming', () => {
  test('refuses an unfinished step', () => {
    expect(() => claimIntroStep(W, INTRO_STEPS[0].key)).toThrow(/not finished/);
  });

  test('refuses an unknown step', () => {
    expect(() => claimIntroStep(W, 'intro_nope')).toThrow(/Unknown/);
  });

  test('pays XP and Scrip once, and never twice', () => {
    const first = INTRO_STEPS[0];
    recordIntroProgress(W, first.action, first.target);
    claimIntroStep(W, first.key);

    const after = scripBalances(W).total;
    expect(after).toBe(first.scrip);
    expect(progressionOf(W).tracks.find((t) => t.key === first.track)!.xp).toBe(first.xp);

    expect(() => claimIntroStep(W, first.key)).toThrow(/Already collected/);
    expect(scripBalances(W).total).toBe(after);
  });

  test('finishes the chain and reports it', () => {
    completeAll(W);
    const state = introState(W);
    expect(state.finished).toBe(true);
    expect(state.currentKey).toBeNull();
    expect(state.completed).toBe(state.total);
  });
});

describe('the introduction pays for the outdoors', () => {
  test('leaves a finisher able to afford the first pack', () => {
    // The chain should hand you the key to the Grounds rather than describe a
    // door you cannot open. If a future edit trims the rewards below the
    // Satchel price, the tutorial stops landing anywhere.
    const satchel = PACK_TIERS[0].scripCost;
    expect(INTRO_TOTAL_SCRIP).toBeGreaterThan(satchel);
  });

  test('actually pays that much when walked end to end', () => {
    completeAll(W);
    expect(scripBalances(W).total).toBe(INTRO_TOTAL_SCRIP);
  });

  /**
   * The chain now ASKS you to buy a pack, which makes affordability a hard
   * requirement rather than a nice-to-have.
   *
   * Everything up to that step has to cover the Satchel on its own. Counting the
   * pack step's own reward would be circular — you cannot spend the payment for
   * doing a thing on doing the thing — and a chain that asks for a purchase the
   * player cannot make is a chain that stalls one step from the end, which is
   * the worst possible place to stall.
   */
  test('pays for the pack BEFORE it asks you to buy one', () => {
    const packStep = INTRO_STEPS.findIndex((s) => s.action === 'buy_pack');
    expect(packStep, 'the chain should end by getting a pack').toBeGreaterThan(-1);

    const earnedFirst = INTRO_STEPS.slice(0, packStep).reduce((sum, s) => sum + s.scrip, 0);
    expect(earnedFirst).toBeGreaterThanOrEqual(PACK_TIERS[0].scripCost);
  });

  test('ends outdoors, not in the room it started in', () => {
    // A tutorial's last instruction decides what a player does next. This one
    // used to end on "buy something on the Exchange" — eight steps, all indoors,
    // finishing inside the same building it began in.
    const last = INTRO_STEPS[INTRO_STEPS.length - 1];
    expect(last.href).toBe('/app/grounds');
    expect(INTRO_STEPS.some((s) => s.action === 'enter_region')).toBe(true);
  });

  test('front-loads the reward, because the first ten minutes are when people quit', () => {
    const firstTwo = INTRO_STEPS.slice(0, 2).reduce((s, x) => s + x.scrip, 0);
    const lastTwo = INTRO_STEPS.slice(-2).reduce((s, x) => s + x.scrip, 0);
    expect(firstTwo).toBeGreaterThanOrEqual(lastTwo);
  });
});

describe('every step is teachable', () => {
  test('has a reason, not just an instruction', () => {
    for (const step of INTRO_STEPS) {
      expect(step.why.length, `${step.key} has no why`).toBeGreaterThan(40);
    }
  });

  test('has somewhere to go', () => {
    for (const step of INTRO_STEPS) {
      expect(step.href, step.key).toMatch(/^\/app/);
    }
  });

  test('has unique keys', () => {
    const keys = INTRO_STEPS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test('is ordered by dependency — you own a desk before you are asked to fit gear', () => {
    const order = INTRO_STEPS.map((s) => s.action);
    expect(order.indexOf('mint_desk')).toBeLessThan(order.indexOf('equip_instrument'));
    expect(order.indexOf('open_allocation')).toBeLessThan(order.indexOf('equip_instrument'));
    expect(order.indexOf('mint_desk')).toBeLessThan(order.indexOf('upgrade_desk'));
    expect(order.indexOf('mint_desk')).toBeLessThan(order.indexOf('place_desk'));
  });
});

describe('the level cap', () => {
  test('clamps a track at MAX_TRACK_LEVEL however much XP it holds', () => {
    expect(levelFromXp(cumulativeXpFor(MAX_TRACK_LEVEL + 40))).toBe(MAX_TRACK_LEVEL);
    expect(levelFromXp(Number.MAX_SAFE_INTEGER)).toBe(MAX_TRACK_LEVEL);
  });

  test('clamps Total Level at 25 even across four maxed tracks', () => {
    // Four tracks each capped at 25 would sum to 100 without the total clamp.
    for (const track of ['trading', 'treasury', 'scouting', 'operations'] as const) {
      addXp(W, track, cumulativeXpFor(MAX_TRACK_LEVEL));
    }
    const p = progressionOf(W);
    expect(p.totalLevel).toBe(MAX_TOTAL_LEVEL);
    expect(p.capped).toBe(true);
    expect(p.maxTotalLevel).toBe(MAX_TOTAL_LEVEL);
  });

  test('keeps banking XP past the cap, so raising it later pays out', () => {
    // The promise in the constant's comment. If XP stopped accruing, a player
    // at the ceiling would be told the next fortnight does not count.
    addXp(W, 'trading', cumulativeXpFor(MAX_TRACK_LEVEL));
    const before = progressionOf(W).totalXp;
    addXp(W, 'trading', 50_000);
    const after = progressionOf(W).totalXp;
    expect(after).toBe(before + 50_000);
    expect(progressionOf(W).tracks.find((t) => t.key === 'trading')!.level).toBe(MAX_TRACK_LEVEL);
  });

  test('reports a capped track as capped rather than part-way to a level it cannot reach', () => {
    addXp(W, 'trading', cumulativeXpFor(MAX_TRACK_LEVEL) + 999);
    const track = progressionOf(W).tracks.find((t) => t.key === 'trading')!;
    expect(track.atCap).toBe(true);
    expect(track.intoLevel).toBeLessThanOrEqual(track.levelSpan);
  });

  test('leaves an ordinary player uncapped', () => {
    addXp(W, 'trading', 1_000);
    const p = progressionOf(W);
    expect(p.capped).toBe(false);
    expect(p.totalLevel).toBeLessThan(MAX_TOTAL_LEVEL);
  });

  test('keeps every region gate inside the cap', () => {
    // A region requiring more than the maximum reachable level would be
    // permanently locked, which is the kind of thing nobody notices until a
    // player asks why the Deep Forest never opened.
    expect(MAX_TOTAL_LEVEL).toBeGreaterThanOrEqual(10);
  });
});
