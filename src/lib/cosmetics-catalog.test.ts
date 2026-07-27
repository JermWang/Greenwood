// The catalogue's own invariants.
//
// A cosmetic is defined by how it RENDERS, so the failure that matters here is
// not a bad price — it is an entry a player can buy and then never see, because
// the catalogue and the model drifted apart. That cannot be caught by reading
// either file alone, which is exactly why it belongs in a test.

import { describe, it, expect } from 'vitest';
import { COSMETICS, priceOf, currenciesFor, cosmeticDef } from './cosmetics';
import { AVATAR_SKINS } from '../components/iso/avatar-skins';
import { DESK_LIVERIES, PLINTH_LIVERIES } from '../components/iso/desk-liveries';

/** Every slot's catalogue keys against the map that draws them. */
const RENDER_MAPS: Array<{ slot: 'avatar' | 'desk' | 'plinth'; map: Record<string, unknown>; name: string }> = [
  { slot: 'avatar', map: AVATAR_SKINS, name: 'AVATAR_SKINS' },
  { slot: 'desk', map: DESK_LIVERIES, name: 'DESK_LIVERIES' },
  { slot: 'plinth', map: PLINTH_LIVERIES, name: 'PLINTH_LIVERIES' },
];

describe('the catalogue is internally consistent', () => {
  it('has no duplicate keys', () => {
    const keys = COSMETICS.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('prices every piece in BNTY and ETH', () => {
    for (const def of COSMETICS) {
      expect(def.bnty, def.key).toBeGreaterThan(0);
      expect(def.eth, def.key).toBeGreaterThan(0);
    }
  });

  it('never sells a piece for less Scrip than it is worth in effort', () => {
    // Scrip is earned, BNTY is bought. A Scrip price above the BNTY price would
    // make the earned route strictly worse than the paid one, which inverts the
    // reason the Scrip wardrobe exists.
    for (const def of COSMETICS) {
      if (def.scrip == null) continue;
      expect(def.scrip, `${def.key} costs more Scrip than BNTY`).toBeLessThanOrEqual(def.bnty);
    }
  });

  it('treats a missing Scrip price as a refusal, not as free', () => {
    const paidOnly = COSMETICS.find((def) => def.scrip == null)!;
    expect(() => priceOf(paidOnly, 'SCRIP')).toThrow(/not sold for Scrip/);
    expect(currenciesFor(paidOnly)).not.toContain('SCRIP');
  });

  it('offers Scrip on the pieces that carry a Scrip price', () => {
    const earnable = COSMETICS.find((def) => def.scrip != null)!;
    expect(currenciesFor(earnable)[0]).toBe('SCRIP');
    expect(priceOf(earnable, 'SCRIP')).toBe(earnable.scrip);
  });

  it('keeps most of the wardrobe reachable without ever buying the token', () => {
    // The specific thing being protected: a player who only plays should be
    // able to look different. If this ratio slips it means new cosmetics are
    // being added paid-only by default.
    const earnable = COSMETICS.filter((def) => def.scrip != null).length;
    expect(earnable / COSMETICS.length).toBeGreaterThan(0.6);
  });

  it('spreads Scrip pricing across every slot, not just one', () => {
    for (const slot of ['avatar', 'desk', 'plinth'] as const) {
      const earnable = COSMETICS.filter((def) => def.slot === slot && def.scrip != null);
      expect(earnable.length, `no Scrip-priced ${slot} cosmetic`).toBeGreaterThan(0);
    }
  });

  it('refuses an unknown key rather than returning undefined', () => {
    expect(() => cosmeticDef('avatar_does_not_exist')).toThrow();
  });
});

describe('every cosmetic can actually be seen', () => {
  /**
   * The load-bearing one, and the reason the render maps were split out of their
   * components at all.
   *
   * A catalogue entry with no row in its render map is a purchase that changes
   * nothing — the player pays, equips it, and looks exactly the same. Nothing
   * else in the codebase connects these lists, and the failure is invisible in
   * a diff: the catalogue change looks complete on its own.
   *
   * This ran for avatars only at first, which is precisely how eight desk and
   * plinth liveries shipped with no rendering at all.
   */
  it.each(RENDER_MAPS)('has a render definition for every $slot entry', ({ slot, map, name }) => {
    const missing = COSMETICS.filter((def) => def.slot === slot && !map[def.key]).map((def) => def.key);
    expect(missing, `${slot} cosmetics with no entry in ${name}: ${missing.join(', ')}`).toEqual([]);
  });

  it.each(RENDER_MAPS)('does not define a $slot look nobody can buy', ({ slot, map, name }) => {
    const sold = new Set(COSMETICS.filter((def) => def.slot === slot).map((def) => def.key));
    const orphans = Object.keys(map).filter((key) => !sold.has(key));
    expect(orphans, `${name} entries nobody can buy: ${orphans.join(', ')}`).toEqual([]);
  });

  it('gives every skin a shell and a trim colour', () => {
    for (const [key, skin] of Object.entries(AVATAR_SKINS)) {
      expect(skin.shell, key).toMatch(/^#[0-9a-f]{6}$/i);
      expect(skin.trim, key).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});
