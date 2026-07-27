// The people of Greenwood, and the two rules their dialogue must not break.
//
// Most of this file guards the REVEAL. docs/greenwood-turn.md is explicit that
// the turn is environmental, lands between levels three and ten, and is worth
// nothing if a player arrives already knowing — and dialogue is by far the
// easiest place to leak it, because writing an ominous line is fun and writing a
// mundane line that happens to be ominous is work. These assertions make the
// easy version fail.
import { describe, expect, it } from 'vitest';
import { NPCS, greetingFor, linesFor, npcAt, npcsIn, TALK_RADIUS } from './npcs';
import { isWalkable, onPath } from './grounds-map';
// The player palette, so a resident can be checked against it rather than
// against a copy that would drift the first time somebody added a colour.
// Imported from palette rather than from Character: this test runs in a node
// environment with no JSX transform, so pulling in a .tsx would fail to parse.
import { OUTFITS } from '../components/iso/palette';
import { HAT_STYLES, SKIN_TONES } from '../components/iso/avatar-skins';
import { MAX_TOTAL_LEVEL } from './progression';

/**
 * Words that give the game away.
 *
 * Nobody in Greenwood knows they are in a horror story — every one of these
 * characters believes they work at a fund. A line containing any of this is a
 * line where the writer knew something the speaker does not.
 */
const SPOILERS = [
  'zombie', 'undead', 'infected', 'outbreak', 'apocalyp', 'survivor', 'survival',
  'horror', 'monster', 'creature', 'shambler', 'the dead', 'corpse', 'plague',
  'quarantine', 'evacuat', 'the end of the world',
];

describe('the cast', () => {
  it('gives everyone a name, a role and somewhere to stand', () => {
    for (const npc of NPCS) {
      expect(npc.name.length, npc.id).toBeGreaterThan(0);
      expect(npc.role.length, npc.id).toBeGreaterThan(0);
      expect(npc.lines.length, `${npc.id} has nothing to say`).toBeGreaterThan(0);
    }
  });

  it('uses ids that are unique', () => {
    expect(new Set(NPCS.map((n) => n.id)).size).toBe(NPCS.length);
  });

  it('stands everybody on paved, walkable ground', () => {
    // Props never spawn on a path, so a paved tile is the only placement that
    // cannot be quietly buried under a tree by a density change.
    for (const npc of npcsIn('grounds')) {
      expect(isWalkable(npc.x, npc.z), `${npc.id} is inside something`).toBe(true);
      expect(onPath(npc.x, npc.z), `${npc.id} is off the path`).toBe(true);
    }
  });

  it('keeps them far enough apart to talk to one at a time', () => {
    // npcAt returns the FIRST match, so two people within talking distance of
    // each other would make one of them unreachable — and which one would
    // depend on array order.
    const all = npcsIn('grounds');
    for (const a of all) {
      for (const b of all) {
        if (a === b) continue;
        expect(Math.hypot(a.x - b.x, a.z - b.z), `${a.id} / ${b.id}`).toBeGreaterThan(TALK_RADIUS * 2);
      }
    }
  });

  /**
   * A resident must not be mistakable for another player.
   *
   * Players get a jacket hashed out of a fixed six-colour list, with bare hands
   * and boots unless a cosmetic overrides them — so a crowd of players is a
   * crowd of plain two-tone figures. An NPC assembled the same way is
   * indistinguishable from one until you are close enough to read a nameplate,
   * which defeats the point of putting people in the world.
   */
  it('dresses everybody in something no player can be wearing', () => {
    for (const npc of NPCS) {
      expect(OUTFITS, `${npc.id} wears a player jacket colour`).not.toContain(npc.outfit);
      // Trim, gloves and boots together are the uniform; a missing one reads as
      // a half-dressed player rather than as staff.
      for (const part of ['trim', 'hand', 'boot'] as const) {
        expect(npc[part], `${npc.id} has no ${part}`).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });

  it('gives each of them a different look', () => {
    // Five people in one square wearing one uniform reads as a bug.
    const looks = NPCS.map((n) => `${n.outfit}|${n.cap}|${n.trim}`);
    expect(new Set(looks).size).toBe(NPCS.length);
  });

  /**
   * The head is where the eye lands first, and it was the one part of the model
   * that could not tell two characters apart — everybody wore the same peaked
   * cap over the same hardcoded pale. Silhouette and skin are the cheapest
   * identity available in a game drawn from flat-shaded boxes.
   */
  it('gives every resident a real skin tone and hat', () => {
    const tones = new Set(SKIN_TONES.map((t) => t.hex));
    const hats = new Set(HAT_STYLES.map((h) => h.id as string));
    for (const npc of NPCS) {
      expect(tones.has(npc.skin), `${npc.id} skin ${npc.skin} is not a tone`).toBe(true);
      expect(hats.has(npc.hat), `${npc.id} hat ${npc.hat} is not a style`).toBe(true);
    }
  });

  it('does not put the whole cast in one hat or one skin', () => {
    expect(new Set(NPCS.map((n) => n.hat)).size).toBeGreaterThan(3);
    expect(new Set(NPCS.map((n) => n.skin)).size).toBe(NPCS.length);
  });
});

describe('the avatar closet', () => {
  /**
   * Skin tone is IDENTITY, not drip.
   *
   * A player choosing what they look like should never be a purchase — putting
   * a paywall between somebody and their own face is a decision a game only
   * gets to make once. Hats, jackets, trims and boots are the sellable part.
   * This assertion is here so that stays true when the closet grows.
   */
  it('offers a wide range of tones, and never as a cosmetic id', () => {
    expect(SKIN_TONES.length).toBeGreaterThanOrEqual(8);
    for (const tone of SKIN_TONES) {
      expect(tone.hex).toMatch(/^#[0-9a-f]{6}$/i);
      // Cosmetic keys in this game are prefixed `avatar_`; a tone must not be
      // reachable that way.
      expect(tone.id.startsWith('avatar_')).toBe(false);
    }
    expect(new Set(SKIN_TONES.map((t) => t.hex)).size).toBe(SKIN_TONES.length);
  });

  it('keeps the default tone first, so old characters are unchanged', () => {
    // Character falls back to SKIN_TONES[0] when no skin is set, and that has to
    // be the pale the model has always used or every existing avatar shifts.
    expect(SKIN_TONES[0].hex).toBe('#d4d2cf');
  });

  it('offers distinct hat styles with the default first', () => {
    expect(HAT_STYLES.length).toBeGreaterThanOrEqual(5);
    expect(HAT_STYLES[0].id).toBe('cap');
    expect(new Set(HAT_STYLES.map((h) => h.id)).size).toBe(HAT_STYLES.length);
    for (const hat of HAT_STYLES) expect(hat.blurb.length).toBeGreaterThan(0);
  });

  it('finds the person you are standing next to', () => {
    for (const npc of npcsIn('grounds')) {
      expect(npcAt('grounds', npc.x, npc.z)?.id).toBe(npc.id);
    }
    expect(npcAt('grounds', 0, 0)).toBeNull();
  });
});

describe('the reveal survives the dialogue', () => {
  const everyLine = NPCS.flatMap((n) => n.lines.map((l) => ({ npc: n.id, ...l })));

  it('never names the turn, at any level', () => {
    for (const line of everyLine) {
      const text = line.text.toLowerCase();
      for (const word of SPOILERS) {
        expect(text.includes(word), `${line.npc}: "${line.text}"`).toBe(false);
      }
    }
  });

  /**
   * No line arrives before the player has had a chance to see the world.
   *
   * The design puts the reveal between levels three and ten. A hint on the
   * tutorial screen is not foreshadowing, it is a synopsis.
   */
  it('holds every hint back to at least level 3', () => {
    for (const line of everyLine) {
      if (line.kind !== 'hint') continue;
      expect(line.minLevel, `${line.npc}: "${line.text}"`).toBeGreaterThanOrEqual(3);
    }
  });

  it('leads with something useful, not something atmospheric', () => {
    // A player who talks to somebody and gets mood instead of help learns not to
    // talk to anybody, and then never hears the hints at all.
    for (const npc of NPCS) {
      const first = linesFor(npc, 0)[0];
      expect(first, `${npc.id} says nothing to a new player`).toBeDefined();
      expect(first.kind, `${npc.id} opens on ${first.kind}`).toBe('tip');
    }
  });

  it('gives a brand-new player real help and no hints at all', () => {
    for (const npc of NPCS) {
      const lines = linesFor(npc, 0);
      expect(lines.some((l) => l.kind === 'tip'), npc.id).toBe(true);
      expect(lines.some((l) => l.kind === 'hint'), npc.id).toBe(false);
    }
  });

  it('has more to say the further in you get', () => {
    for (const npc of NPCS) {
      expect(linesFor(npc, MAX_TOTAL_LEVEL).length, npc.id).toBeGreaterThan(
        linesFor(npc, 0).length
      );
    }
  });

  it('opens on the newest hint once there is one, so revisiting pays', () => {
    for (const npc of NPCS) {
      const late = greetingFor(npc, MAX_TOTAL_LEVEL);
      expect(late?.kind, npc.id).toBe('hint');
      // ...and on a tip before then, so the first meeting is useful.
      expect(greetingFor(npc, 0)?.kind, npc.id).toBe('tip');
    }
  });

  it('never gates a line above the level cap, which would hide it forever', () => {
    for (const line of everyLine) {
      expect(line.minLevel, `${line.npc}: "${line.text}"`).toBeLessThanOrEqual(MAX_TOTAL_LEVEL);
    }
  });

  it('spreads the hints across the reveal window instead of dumping them', () => {
    // All of them unlocking at one level would make the world change in a single
    // step, which reads as a switch being flipped rather than as dawning unease.
    const levels = new Set(everyLine.filter((l) => l.kind === 'hint').map((l) => l.minLevel));
    expect(levels.size).toBeGreaterThanOrEqual(4);
  });

  it('gives everyone at least one hint, so nobody is purely a help menu', () => {
    for (const npc of NPCS) {
      expect(npc.lines.some((l) => l.kind === 'hint'), npc.id).toBe(true);
    }
  });
});
