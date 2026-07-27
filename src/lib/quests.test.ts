// Progression and daily-quest coverage. The things that matter here are that a
// day's quests are stable and unrerollable, that XP cannot be claimed twice,
// and that the level curve is actually invertible.
import { describe, test, expect, beforeEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'gpu-quests-test-'));
process.env.OSR_DATA_DIR = DATA_DIR;
delete process.env.VERCEL;

const { questsFor, dailyQuests, recordQuestProgress, claimQuest, QUEST_POOL, DAILY_COUNT, dayIndex } =
  await import('./quests');
const { progressionOf, addXp, levelFromXp, cumulativeXpFor, TRACKS, MAX_TRACK_LEVEL } = await import('./progression');
const { getOrCreateUser } = await import('./game');
const { getDb } = await import('./db');

const wallet = (n: number) => `0x${String(n).padStart(40, '0')}`;

beforeEach(() => {
  const db = getDb();
  db.exec('DELETE FROM daily_quests');
  db.exec('DELETE FROM xp_tracks');
  db.exec('DELETE FROM users');
});

describe('the level curve', () => {
  test('levelFromXp inverts cumulativeXpFor exactly at every boundary below the cap', () => {
    // Bounded by MAX_TRACK_LEVEL rather than a fixed 40: levelFromXp now clamps,
    // so the inverse property only holds up to the ceiling. Testing past it
    // would be asserting that the cap does not exist.
    for (let level = 0; level <= MAX_TRACK_LEVEL; level += 1) {
      const need = cumulativeXpFor(level);
      expect(levelFromXp(need)).toBe(level);
      // One XP short of the boundary must still be the previous level.
      if (level > 0) expect(levelFromXp(need - 1)).toBe(level - 1);
    }
  });

  test('clamps rather than continuing past the cap', () => {
    for (const level of [MAX_TRACK_LEVEL + 1, MAX_TRACK_LEVEL + 15, 200]) {
      expect(levelFromXp(cumulativeXpFor(level))).toBe(MAX_TRACK_LEVEL);
    }
  });

  test('starts at zero and the first level is reachable in one sitting', () => {
    expect(levelFromXp(0)).toBe(0);
    expect(cumulativeXpFor(1)).toBe(100);
  });
});

describe('daily quest selection', () => {
  test('gives three distinct quests', () => {
    const picked = questsFor(wallet(1), 20_000);
    expect(picked).toHaveLength(DAILY_COUNT);
    expect(new Set(picked.map((q) => q.key)).size).toBe(DAILY_COUNT);
  });

  test('is stable for the same wallet and day, and cannot be rerolled', () => {
    const a = questsFor(wallet(2), 20_000).map((q) => q.key);
    for (let i = 0; i < 5; i += 1) {
      expect(questsFor(wallet(2), 20_000).map((q) => q.key)).toEqual(a);
    }
  });

  test('changes with the day, and differs between wallets', () => {
    const day1 = questsFor(wallet(3), 20_000).map((q) => q.key).join();
    const day2 = questsFor(wallet(3), 20_001).map((q) => q.key).join();
    expect(day1).not.toBe(day2);
    const other = questsFor(wallet(4), 20_000).map((q) => q.key).join();
    expect(other).not.toBe(day1);
  });

  test('every wallet gets a valid, distinct set across many days', () => {
    // Guards the strided pick. The stride is only guaranteed to reach every
    // entry when it is coprime with the pool size; at a composite size some
    // strides cycle through two entries forever, so the picker has a bounded
    // top-up scan behind it. Sweeping wallets as well as days exercises far
    // more of the stride space than one wallet can, which is what makes this a
    // guard against a future pool size rather than against today's.
    for (let w = 0; w < 40; w += 1) {
      for (let d = 0; d < 40; d += 1) {
        const picked = questsFor(wallet(w), 20_000 + d);
        expect(new Set(picked.map((q) => q.key)).size).toBe(DAILY_COUNT);
        picked.forEach((q) => expect(QUEST_POOL).toContain(q));
      }
    }
  });
});

describe('progress and claiming', () => {
  const setup = (n: number) => {
    const w = wallet(n);
    getOrCreateUser(w);
    return w;
  };

  test('only advances quests the wallet actually has today', () => {
    const w = setup(10);
    const mine = questsFor(w);
    const target = mine[0];
    recordQuestProgress(w, target.action, target.target);
    const view = dailyQuests(w).quests.find((q) => q.key === target.key)!;
    expect(view.progress).toBe(target.target);
    expect(view.complete).toBe(true);
  });

  test('an unrelated action records nothing', () => {
    const w = setup(11);
    const actions = new Set(questsFor(w).map((q) => q.action));
    const unrelated = QUEST_POOL.map((q) => q.action).find((a) => !actions.has(a));
    if (!unrelated) return; // pool happened to cover everything today
    recordQuestProgress(w, unrelated, 5);
    expect(dailyQuests(w).quests.every((q) => q.progress === 0)).toBe(true);
  });

  test('pays XP once and refuses a second claim', () => {
    const w = setup(12);
    const quest = questsFor(w)[0];
    recordQuestProgress(w, quest.action, quest.target);

    const result = claimQuest(w, quest.key);
    expect(result.xp).toBe(quest.xp);
    const after = progressionOf(w).tracks.find((t) => t.key === quest.track)!;
    expect(after.xp).toBe(quest.xp);

    expect(() => claimQuest(w, quest.key)).toThrow(/Already claimed/);
    // XP must not have moved on the failed second claim.
    expect(progressionOf(w).tracks.find((t) => t.key === quest.track)!.xp).toBe(quest.xp);
  });

  test('refuses to pay an unfinished quest', () => {
    const w = setup(13);
    const quest = questsFor(w).find((q) => q.target > 1) ?? questsFor(w)[0];
    if (quest.target > 1) recordQuestProgress(w, quest.action, quest.target - 1);
    expect(() => claimQuest(w, quest.key)).toThrow(/not finished/);
  });

  test('refuses a quest that is not in today\'s set', () => {
    const w = setup(14);
    const todays = new Set(questsFor(w).map((q) => q.key));
    const outsider = QUEST_POOL.find((q) => !todays.has(q.key))!;
    expect(() => claimQuest(w, outsider.key)).toThrow(/not one of today/);
  });

  test('progress is capped at the target in the view', () => {
    const w = setup(15);
    const quest = questsFor(w)[0];
    recordQuestProgress(w, quest.action, quest.target + 50);
    const view = dailyQuests(w).quests.find((q) => q.key === quest.key)!;
    expect(view.progress).toBe(quest.target);
  });
});

describe('total level', () => {
  test('sums the track levels and starts at zero', () => {
    const w = wallet(20);
    getOrCreateUser(w);
    expect(progressionOf(w).totalLevel).toBe(0);

    addXp(w, 'trading', cumulativeXpFor(3));
    addXp(w, 'treasury', cumulativeXpFor(2));
    const p = progressionOf(w);
    expect(p.tracks.find((t) => t.key === 'trading')!.level).toBe(3);
    expect(p.tracks.find((t) => t.key === 'treasury')!.level).toBe(2);
    expect(p.totalLevel).toBe(5);
  });

  test('always reports every track, even untouched ones', () => {
    const w = wallet(21);
    getOrCreateUser(w);
    expect(progressionOf(w).tracks.map((t) => t.key)).toEqual(TRACKS.map((t) => t.key));
  });

  test('ignores XP for an unknown track rather than inventing a bar', () => {
    const w = wallet(22);
    getOrCreateUser(w);
    addXp(w, 'nonsense' as never, 5_000);
    expect(progressionOf(w).totalXp).toBe(0);
  });

  test('reports how far into the current level a track is', () => {
    const w = wallet(23);
    getOrCreateUser(w);
    addXp(w, 'scouting', cumulativeXpFor(2) + 40);
    const track = progressionOf(w).tracks.find((t) => t.key === 'scouting')!;
    expect(track.level).toBe(2);
    expect(track.intoLevel).toBe(40);
    expect(track.levelSpan).toBe(300);
  });
});

describe('the daily reset', () => {
  test('counts down to the next day boundary', () => {
    const w = wallet(30);
    getOrCreateUser(w);
    const now = (dayIndex() + 1) * 86_400_000 - 5_000;
    expect(dailyQuests(w, now).resetsInMs).toBe(5_000);
  });
});
