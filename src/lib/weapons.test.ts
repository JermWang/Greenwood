// What you are holding decides the fight, so it gets asserted.
//
// bestWeapon is pure and takes plain data, which is the whole reason lib/weapons
// has no database in it: the rule that picks a weapon can be checked without a
// fixture, and the server module that reads the pack is then only doing the
// reading.
import { describe, expect, it } from 'vitest';
import { ALL_WEAPONS, WEAPONS, bestWeapon, isWeaponRef, weaponById } from './weapons';
import { UNARMED_DAMAGE } from './creatures';
import { AXES } from './woodcutting';

describe('the ladder', () => {
  it('always beats fists', () => {
    for (const weapon of ALL_WEAPONS) {
      expect(weapon.damage, `${weapon.id} is not worth carrying`).toBeGreaterThan(UNARMED_DAMAGE);
    }
  });

  /*
   * Monotonic within a class. A tier that costs more and hits softer is a trap,
   * and the crafting ladder charges ironbark for the top of each one.
   */
  it('never goes backwards as the tier climbs', () => {
    for (const cls of ['axe', 'crossbow'] as const) {
      const rungs = ALL_WEAPONS.filter((w) => w.weaponClass === cls).sort((a, b) => a.tier - b.tier);
      for (let i = 1; i < rungs.length; i += 1) {
        expect(rungs[i].damage, `${rungs[i].id} hits softer than ${rungs[i - 1].id}`).toBeGreaterThan(
          rungs[i - 1].damage
        );
      }
    }
  });

  /*
   * Melee reaches exactly as far as a shambler does, and no further. Reach is
   * the crossbow's entire reason to exist; an axe that outranged a bite would
   * take it away.
   */
  it('keeps every axe at one tile', () => {
    for (const weapon of ALL_WEAPONS) {
      if (weapon.weaponClass !== 'axe') continue;
      expect(weapon.reach).toBe(1);
      expect(weapon.ammo).toBeNull();
    }
  });

  it('gives every crossbow reach and an ammunition cost', () => {
    for (const weapon of ALL_WEAPONS) {
      if (weapon.weaponClass !== 'crossbow') continue;
      expect(weapon.reach).toBeGreaterThan(1);
      expect(weapon.ammo).toBe('ironbark-bolts');
    }
  });

  /*
   * COMBAT DAMAGE IS NOT FELLING DAMAGE. They are separate columns on purpose,
   * and this is the guard that keeps them separate — if somebody "simplifies"
   * lib/weapons by reading AXES.damage, retuning how long an oak takes would
   * silently change how many swings a shambler takes.
   */
  it('does not reuse the felling numbers', () => {
    const felling = Object.values(AXES).map((a) => a.damage);
    const combat = ALL_WEAPONS.filter((w) => w.weaponClass === 'axe').map((w) => w.damage);
    expect(combat).not.toEqual(felling);
  });

  it('knows its own refs', () => {
    expect(isWeaponRef('ironbark-crossbow')).toBe(true);
    expect(isWeaponRef('ironbark-bolts')).toBe(false);
    expect(weaponById('nope')).toBeNull();
    expect(weaponById(null)).toBeNull();
  });
});

describe('what ends up in your hand', () => {
  it('is nothing when you carry nothing', () => {
    expect(bestWeapon(null, [], false)).toBeNull();
  });

  it('is the axe you own when the pack is empty', () => {
    expect(bestWeapon('felling', [], false)?.id).toBe('felling');
  });

  it('is the hardest hitter available', () => {
    const picked = bestWeapon('hatchet', ['hunting-crossbow'], true);
    expect(picked?.id).toBe('hunting-crossbow');
    expect(picked?.damage).toBe(WEAPONS['hunting-crossbow'].damage);
  });

  /*
   * The case that matters most, and the one a naive "best by tier" would get
   * wrong: an empty crossbow is not a weapon. Picking it would leave somebody
   * pointing an unloaded stock at a wolf with a perfectly good axe on their belt.
   */
  it('ignores a crossbow with no bolts', () => {
    expect(bestWeapon('ironbark-axe', ['ironbark-crossbow'], false)?.id).toBe('ironbark-axe');
    expect(bestWeapon(null, ['ironbark-crossbow'], false)).toBeNull();
  });

  it('takes the crossbow once there are bolts for it', () => {
    expect(bestWeapon('ironbark-axe', ['ironbark-crossbow'], true)?.id).toBe('ironbark-crossbow');
  });

  it('is not confused by the rest of a pack', () => {
    const picked = bestWeapon('hatchet', ['pelt', 'oak-log', 'rotten-cell', 'heavy-crossbow'], true);
    expect(picked?.id).toBe('heavy-crossbow');
  });

  /*
   * A weaker axe never beats a stronger one just by being in the pack, which is
   * the shape of bug you get from reducing on tier instead of damage across two
   * different ladders.
   */
  it('compares across classes by damage, not by tier', () => {
    // Tier 4 axe (38) against a tier 2 crossbow (26): the axe wins on damage
    // even though the crossbow reaches further.
    expect(bestWeapon('ironbark-axe', ['hunting-crossbow'], true)?.id).toBe('ironbark-axe');
  });
});
