// The woodcutting ladder, and the properties that keep it a ladder.
import { describe, expect, it } from 'vitest';
import {
  ALL_AXES,
  ALL_SPECIES,
  AXES,
  SPECIES,
  canFell,
  chopReward,
  hasRegrown,
  respawnMs,
  speciesAt,
  treeId,
  type SpeciesId,
} from './woodcutting';

describe('the species ladder', () => {
  it('gives every species a unique tier-ordered place', () => {
    for (const s of ALL_SPECIES) {
      expect(s.tier, s.id).toBeGreaterThanOrEqual(1);
      expect(s.tier, s.id).toBeLessThanOrEqual(4);
    }
    expect(new Set(ALL_SPECIES.map((s) => s.id)).size).toBe(ALL_SPECIES.length);
  });

  /**
   * Respawn climbs with tier, and that is what stops the best tree being the
   * only tree anybody cuts. An ironbark is worth four pines and makes you wait
   * roughly fifteen times as long, so somebody working a stand of pine is not
   * being foolish — which is the difference between a ladder and a single
   * correct answer.
   */
  it('makes better wood slower to come back', () => {
    const byTier = [...ALL_SPECIES].sort((a, b) => a.tier - b.tier);
    for (let i = 1; i < byTier.length; i += 1) {
      if (byTier[i].tier === byTier[i - 1].tier) continue;
      expect(byTier[i].respawn, `${byTier[i].id} regrows too fast`).toBeGreaterThan(
        byTier[i - 1].respawn
      );
    }
  });

  /**
   * XP climbs faster than logs do, on purpose.
   *
   * Logs are the economy and XP is the progression. If they were the same curve
   * the fastest way to level would always be the fastest way to earn, and there
   * would never be a decision about which tree to cut.
   */
  it('separates the progression curve from the economy curve', () => {
    const pine = SPECIES.pine;
    const iron = SPECIES.ironbark;
    const logRatio = iron.logs / pine.logs;
    const xpRatio = iron.xp / pine.xp;
    expect(xpRatio).toBeGreaterThan(logRatio);
  });
});

describe('axes', () => {
  it('fells its own tier and everything below it', () => {
    expect(canFell('hatchet', 'pine')).toBe(true);
    expect(canFell('hatchet', 'birch')).toBe(true);
    expect(canFell('hatchet', 'oak')).toBe(false);
    expect(canFell('felling', 'oak')).toBe(true);
    expect(canFell('felling', 'blackpine')).toBe(false);
    expect(canFell('ironbark-axe', 'ironbark')).toBe(true);
  });

  it('fells nothing without an axe', () => {
    // Bare hands are not a tool. A tree you can take without one would make the
    // whole tier system decorative.
    for (const s of ALL_SPECIES) {
      expect(canFell(null, s.id), s.id).toBe(false);
      expect(canFell(undefined, s.id), s.id).toBe(false);
    }
  });

  it('covers every species with some axe', () => {
    // A species nothing can fell is content nobody can reach.
    for (const s of ALL_SPECIES) {
      expect(ALL_AXES.some((a) => canFell(a.id, s.id)), s.id).toBe(true);
    }
  });

  /**
   * An axe is a TOOL first and a weapon second, and the numbers have to say so.
   * The best axe hitting harder than a purpose-made weapon would make every
   * other weapon in the game pointless, and the axe is meant to be the thing you
   * bought to work with and discovered you could fight with.
   */
  it('climbs in damage but stays modest', () => {
    const byTier = [...ALL_AXES].sort((a, b) => a.tier - b.tier);
    for (let i = 1; i < byTier.length; i += 1) {
      expect(byTier[i].damage, byTier[i].id).toBeGreaterThan(byTier[i - 1].damage);
      expect(byTier[i].scripCost, byTier[i].id).toBeGreaterThan(byTier[i - 1].scripCost);
    }
    // Comfortably above unarmed (12), nowhere near a weapon tier of its own.
    expect(AXES.hatchet.damage).toBeGreaterThan(12);
    expect(AXES['ironbark-axe'].damage).toBeLessThan(60);
  });
});

describe('where things grow', () => {
  const sample = (region: string) => {
    const seen = new Set<SpeciesId>();
    for (let x = -40; x <= 40; x += 1) {
      for (let z = -40; z <= 40; z += 1) seen.add(speciesAt(region, x, z));
    }
    return seen;
  };

  it('is deterministic — the same tile is the same tree forever', () => {
    for (const [x, z] of [[3, 7], [-20, 14], [0, 0]]) {
      expect(speciesAt('deep-forest', x, z)).toBe(speciesAt('deep-forest', x, z));
    }
  });

  it('gives the same tile different trees in different regions', () => {
    // The ladder is a map of the world's danger, so region has to matter.
    const grounds = sample('grounds');
    const deep = sample('deep-forest');
    expect(grounds).not.toEqual(deep);
  });

  /**
   * The best wood is not gated behind a LEVEL, it is gated behind being
   * somewhere frightening. That is a gate a player feels rather than reads, and
   * it is the reason the Deep Forest is worth the walk once combat exists.
   */
  it('keeps the two best species out of the settlement', () => {
    const grounds = sample('grounds');
    expect(grounds.has('ironbark')).toBe(false);
    expect(grounds.has('blackpine')).toBe(false);
    expect(sample('deep-forest').has('ironbark')).toBe(true);
  });

  it('makes ironbark genuinely rare where it does grow', () => {
    let iron = 0;
    let total = 0;
    for (let x = -40; x <= 40; x += 1) {
      for (let z = -40; z <= 40; z += 1) {
        total += 1;
        if (speciesAt('deep-forest', x, z) === 'ironbark') iron += 1;
      }
    }
    const share = iron / total;
    // Rare enough to be worth telling somebody about, common enough to exist.
    expect(share).toBeGreaterThan(0.01);
    expect(share).toBeLessThan(0.06);
  });
});

describe('stumps', () => {
  it('keys a tree by region as well as tile', () => {
    // The same coordinate exists in every region; a stump recorded without one
    // would regrow in the wrong forest.
    expect(treeId('grounds', 4, -2)).not.toBe(treeId('deep-forest', 4, -2));
  });

  it('regrows only once the species says so', () => {
    const at = 1_000_000;
    const span = respawnMs('oak');
    expect(hasRegrown('oak', at, at + span - 1)).toBe(false);
    expect(hasRegrown('oak', at, at + span)).toBe(true);
  });

  it('pays logs and XP together', () => {
    // Returned as one object so a caller cannot award the XP and forget the
    // logs — the sort of thing that surfaces as an economy complaint weeks later.
    const reward = chopReward('blackpine');
    expect(reward.logs).toBe(SPECIES.blackpine.logs);
    expect(reward.xp).toBe(SPECIES.blackpine.xp);
    expect(reward.ref).toBe('log-blackpine');
  });
});
