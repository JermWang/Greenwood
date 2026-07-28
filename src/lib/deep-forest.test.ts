// The Deep Forest's safety rules, asserted.
//
// These cover the two properties the whole zone rests on: that only what is in
// the pack can ever be lost, and that nobody can read a loot pile they are not
// standing next to. Both are the kind of rule that is obviously true when it is
// written and quietly false two refactors later, and both fail in ways that are
// invisible in a diff — the first as a player losing a desk, the second as a
// patched client scanning every pile on the map from cover.

import { describe, it, expect } from 'vitest';
import {
  REGIONS,
  regionById,
  canEnter,
  availableRegions,
  nextRegion,
  isHostileRegion,
  arrivalCellFor,
} from './regions';
import {
  PACK_TIERS,
  MAX_PACK_STEP,
  NO_PACK,
  POCKET_SLOTS,
  packSlots,
  packTier,
  hasPack,
  packUpgradeCost,
  packTotalCost,
  assertCanUpgradePack,
  packHasRoom,
  packUsage,
  isCarriable,
  CARRIABLE,
  NOT_CARRIABLE,
  type CarriedStack,
} from './packs';
import {
  LOOT_PEEK_RANGE,
  LOOT_DESPAWN_MS,
  canPeek,
  hasExpired,
  visibleTo,
  pilesVisibleTo,
  takeFromPile,
  type LootPile,
} from './loot';

const stack = (ref: string, quantity = 1, kind: CarriedStack['kind'] = 'salvage'): CarriedStack => ({
  kind,
  ref,
  quantity,
});

const pileAt = (x: number, z: number, contents: CarriedStack[] = [stack('generator-core')]): LootPile => ({
  id: `pile-${x}-${z}`,
  regionId: 'deep-forest',
  x,
  z,
  droppedBy: '0xdead',
  droppedAt: 1_000,
  contents,
});

describe('regions', () => {
  it('gates the Deep Forest at total level 10 and the Treeline at 6', () => {
    expect(regionById('deep-forest')!.minTotalLevel).toBe(10);
    expect(regionById('treeline')!.minTotalLevel).toBe(6);
  });

  it('makes the Deep Forest the only place players can kill each other', () => {
    const pvp = REGIONS.filter((region) => region.pvp).map((region) => region.id);
    expect(pvp).toEqual(['deep-forest']);
  });

  it('never puts hostiles or PvP in a region that does not require a pack', () => {
    // The pack is the entry ticket to everywhere dangerous. A hostile region
    // reachable without one is a region where a player can lose a run they were
    // never told they had started.
    for (const region of REGIONS) {
      if (isHostileRegion(region)) expect(region.requiresPack, `${region.id}`).toBe(true);
    }
  });

  it('keeps the starting rooms open to a brand new player', () => {
    const fresh = { totalLevel: 0, hasPack: false };
    const open = availableRegions(fresh).map((region) => region.id);
    expect(open).toContain('machine-room');
    expect(open).toContain('trading-floor');
    expect(open).toContain('grounds');
    expect(open).not.toContain('deep-forest');
  });

  it('refuses on level before it refuses on pack, so the hint names the real blocker', () => {
    // A level-4 player without a pack is not one purchase away from the Deep
    // Forest, and telling them to go buy one would be a lie that costs Scrip.
    const check = canEnter('deep-forest', { totalLevel: 4, hasPack: false });
    expect(check.allowed).toBe(false);
    expect(check.code).toBe('level');
  });

  it('asks for a pack once the level and the desks are there', () => {
    const check = canEnter('deep-forest', { totalLevel: 10, hasPack: false, bestDeskLevel: 8 });
    expect(check.allowed).toBe(false);
    expect(check.code).toBe('pack');
  });

  it('lets a levelled, built, packed player through', () => {
    expect(canEnter('deep-forest', { totalLevel: 10, hasPack: true, bestDeskLevel: 8 })).toEqual({
      allowed: true,
      reason: null,
      code: 'ok',
    });
  });

  /**
   * The desk gate asks a different question from the level gate.
   *
   * Total Level is the sum of four action-XP tracks, so it can be reached
   * entirely by trading — a legitimate way to play that says nothing about
   * whether the fund can absorb a bad run. Someone who ground the Exchange to
   * level 10 could otherwise walk into the only PvP zone in the game with a
   * level-1 desk and nothing at stake, and a player with nothing to lose is the
   * ideal griefer.
   */
  it('turns away a high-level player with nothing built', () => {
    const trader = { totalLevel: 25, hasPack: true, bestDeskLevel: 1 };
    const check = canEnter('deep-forest', trader);
    expect(check.allowed).toBe(false);
    expect(check.code).toBe('desk');
    expect(check.reason).toMatch(/desk at level 8/);
  });

  it('treats a missing desk level as zero rather than as no requirement', () => {
    // Failing OPEN here would mean any caller that forgot the field silently
    // disabled the gate. Failing closed gets reported instead.
    expect(canEnter('deep-forest', { totalLevel: 25, hasPack: true }).code).toBe('desk');
  });

  it('refuses on desk before it refuses on pack', () => {
    // A player who cannot enter yet must not be sold a 2,500 Scrip pack for a
    // region they still cannot enter. The order is the order things are earned.
    const check = canEnter('deep-forest', { totalLevel: 10, hasPack: false, bestDeskLevel: 1 });
    expect(check.code).toBe('desk');
  });

  it('leaves the Grounds ungated on desks as well as on level', () => {
    // The Grounds are the only route to the Machine Room and the Trading Floor.
    // A desk requirement here would lock a player out of their own fund.
    expect(regionById('grounds')!.minDeskLevel).toBe(0);
    expect(canEnter('grounds', { totalLevel: 0, hasPack: false, bestDeskLevel: 0 }).allowed).toBe(true);
  });

  it('refuses an unknown region rather than defaulting open', () => {
    expect(canEnter('the-moon', { totalLevel: 99, hasPack: true }).code).toBe('unknown-region');
  });

  it('points at the nearest locked region, not the first in the table', () => {
    // HQ is the first gate now: it opens at 3, ahead of the Treeline's 6.
    const early = nextRegion({ totalLevel: 2, hasPack: false });
    expect(early!.region.id).toBe('greenwood-hq');
    expect(early!.check.code).toBe('level');
  });

  it('names the region a purchase would open before one a level would', () => {
    // A level-7 player without a pack is one purchase from the Treeline and
    // three levels from the Deep Forest. The hint has to name the Treeline —
    // it is the step they can actually take today.
    const next = nextRegion({ totalLevel: 7, hasPack: false, bestDeskLevel: 3 });
    expect(next!.region.id).toBe('treeline');
    expect(next!.check.code).toBe('pack');

    // Once they hold one, the Treeline is open and the Deep Forest is next.
    const packed = nextRegion({ totalLevel: 7, hasPack: true, bestDeskLevel: 3 });
    expect(packed!.region.id).toBe('deep-forest');
    expect(packed!.check.code).toBe('level');
  });
});

describe('where a region drops you', () => {
  it('puts you inside the region, never outside its bounds', () => {
    for (const region of REGIONS) {
      const cell = arrivalCellFor(region);
      expect(cell.x, region.id).toBeGreaterThanOrEqual(region.bounds.minX);
      expect(cell.x, region.id).toBeLessThanOrEqual(region.bounds.maxX);
      expect(cell.z, region.id).toBeGreaterThanOrEqual(region.bounds.minZ);
      expect(cell.z, region.id).toBeLessThanOrEqual(region.bounds.maxZ);
    }
  });

  it('arrives at an edge, not in the middle of the map', () => {
    // Materialising in the centre is the thing that made the two original rooms
    // read as web pages. Two tiles in from the south edge matches the door
    // convention in components/iso/portals.
    for (const region of REGIONS) {
      expect(arrivalCellFor(region).z, region.id).toBe(region.bounds.maxZ - 2);
    }
  });

  it('is deterministic, so it cannot be influenced by a caller', () => {
    // The spawn is a pure function of the region. There is no seed, no clock and
    // no argument a client could supply — which is what stops someone entering
    // the Deep Forest at a spot of their choosing, behind another player.
    const deep = regionById('deep-forest')!;
    expect(arrivalCellFor(deep)).toEqual(arrivalCellFor(deep));
  });
});

describe('packs', () => {
  /**
   * No pack means POCKETS, not nothing.
   *
   * This asserted zero, and playing the game found out why that was wrong: the
   * hatchet costs 400 Scrip and the cheapest pack costs 2,500, so woodcutting —
   * the errand meant to get a new player moving — was gated behind an item six
   * times the price of its own tool, and every chop answered "your pack is full"
   * while carrying nothing.
   *
   * The pack's real job is unchanged. `hasPack` is still step >= 1, so it is
   * still what the Treeline and the Deep Forest ask for, and still the thing
   * whose contents you lose. Pockets are useless for an expedition, which is
   * exactly the point.
   */
  it('gives a wallet with no pack pockets, but not a pack', () => {
    expect(hasPack(NO_PACK)).toBe(false);
    expect(packSlots(NO_PACK)).toBe(POCKET_SLOTS);
    expect(POCKET_SLOTS).toBeGreaterThan(0);
    // Comfortably below the smallest real pack, or buying one would be pointless.
    expect(POCKET_SLOTS).toBeLessThan(PACK_TIERS[0].slots);
  });

  it('grows slots at every step', () => {
    for (let step = 1; step < MAX_PACK_STEP; step += 1) {
      expect(packSlots(step + 1)).toBeGreaterThan(packSlots(step));
    }
  });

  it('prices later steps ahead of the slots they add', () => {
    // The marginal slot is worth far more than the first — a player two slots
    // from full behaves completely differently from one with ten — so the cost
    // per slot has to climb, or the ladder is just a tax on the early game.
    const perSlot = PACK_TIERS.map((tier) => tier.scripCost / tier.slots);
    for (let i = 1; i < perSlot.length; i += 1) {
      expect(perSlot[i]).toBeGreaterThan(perSlot[i - 1]);
    }
  });

  it('returns null rather than zero at the ceiling, so nothing is upgraded for free', () => {
    expect(packUpgradeCost(MAX_PACK_STEP)).toBeNull();
    expect(() => assertCanUpgradePack(MAX_PACK_STEP)).toThrow(/largest/);
  });

  it('sums the ladder', () => {
    expect(packTotalCost(0)).toBe(0);
    expect(packTotalCost(2)).toBe(PACK_TIERS[0].scripCost + PACK_TIERS[1].scripCost);
    expect(packTotalCost(MAX_PACK_STEP)).toBe(
      PACK_TIERS.reduce((sum, tier) => sum + tier.scripCost, 0)
    );
  });

  it('counts stacks rather than units, so ammunition is one slot', () => {
    const step = 1;
    const carried: CarriedStack[] = [stack('bolt', 200, 'ammo')];
    expect(packUsage(step, carried).used).toBe(1);
    expect(packHasRoom(step, carried, stack('bolt', 500, 'ammo'))).toBe(true);
  });

  it('refuses a new stack when every slot is taken', () => {
    const slots = packSlots(1);
    const carried = Array.from({ length: slots }, (_, i) => stack(`part-${i}`));
    expect(packHasRoom(1, carried, stack('one-more'))).toBe(false);
    // ...but still merges into a stack that is already occupying a slot.
    expect(packHasRoom(1, carried, stack('part-0'))).toBe(true);
  });
});

describe('what may be carried', () => {
  it('is an allowlist, so a new item type is not carryable by accident', () => {
    expect(isCarriable('salvage')).toBe(true);
    expect(isCarriable('mount')).toBe(false);
    expect(isCarriable('something-invented-next-year')).toBe(false);
  });

  it('never lets a pack, cosmetic or mount be carried', () => {
    for (const kind of ['pack', 'cosmetic', 'mount']) {
      expect(isCarriable(kind)).toBe(false);
      expect(NOT_CARRIABLE[kind], `${kind} has no explanation`).toBeTruthy();
    }
  });

  it('never lets an installed desk or a fitted instrument be carried', () => {
    // The load-bearing one. Nothing on a player's floor may enter a hostile
    // region, which is what makes "you lose what you carried" a complete
    // statement of the risk rather than the headline of a longer list.
    expect(isCarriable('desk')).toBe(false);
    expect(isCarriable('fitted_instrument')).toBe(false);
  });

  it('lets weapons be carried, and therefore lost', () => {
    // Deliberate. A weapon that survived death would be the one thing in the
    // zone with no downside to bringing, so everyone would always carry their
    // best one and ammo scarcity would be the only brake left.
    expect(isCarriable('weapon')).toBe(true);
    expect(CARRIABLE).toContain('weapon');
    expect(NOT_CARRIABLE.weapon).toBeUndefined();
  });

  it('lets a weapon into a pack and counts it as one slot', () => {
    const carried: CarriedStack[] = [];
    const rifle = stack('bolt-rifle', 1, 'weapon');
    expect(packHasRoom(1, carried, rifle)).toBe(true);
    expect(packUsage(1, [rifle]).used).toBe(1);
  });

  it('never lets BNTY or a Note be carried — only Scrip travels', () => {
    expect(isCarriable('bnty')).toBe(false);
    expect(isCarriable('note')).toBe(false);
    expect(CARRIABLE).toContain('scrip');
  });

  it('explains every refusal, so the message can name the actual reason', () => {
    for (const [kind, reason] of Object.entries(NOT_CARRIABLE)) {
      expect(isCarriable(kind), `${kind} is both carriable and refused`).toBe(false);
      expect(reason.length).toBeGreaterThan(10);
    }
  });
});

describe('loot piles are readable only up close', () => {
  it('reads a pile you are standing on', () => {
    expect(canPeek(pileAt(5, 5), 5, 5)).toBe(true);
  });

  it('reads a pile one tile away, diagonals included', () => {
    expect(canPeek(pileAt(5, 5), 6, 6)).toBe(true);
    expect(canPeek(pileAt(5, 5), 4, 5)).toBe(true);
  });

  it('does not read a pile two tiles away', () => {
    expect(canPeek(pileAt(5, 5), 7, 5)).toBe(false);
    expect(canPeek(pileAt(5, 5), 5, 7)).toBe(false);
  });

  /**
   * The rule that has to hold at the SOURCE rather than in the UI. A distant
   * pile must come back with no contents at all — not empty contents, and not
   * contents the client is trusted to hide.
   */
  it('withholds contents from a viewer who is not adjacent', () => {
    const seen = visibleTo(pileAt(5, 5, [stack('generator-core'), stack('coil', 3)]), { x: 12, z: 12 });
    expect(seen.readable).toBe(false);
    expect(seen.contents).toBeUndefined();
    expect('contents' in seen).toBe(false);
  });

  it('distinguishes "not allowed to look" from "looked and it was empty"', () => {
    const far = visibleTo(pileAt(0, 0, []), { x: 9, z: 9 });
    const near = visibleTo(pileAt(0, 0, []), { x: 0, z: 0 });
    expect(far.contents).toBeUndefined();
    expect(near.contents).toEqual([]);
  });

  it('still reveals that a pile is THERE, so approaching is a real decision', () => {
    // Position is public; contents are not. Seeing a pile from across a clearing
    // and having to walk into the open to find out what is in it is the whole
    // tension — hiding the pile entirely would remove it.
    const seen = visibleTo(pileAt(5, 5), { x: 30, z: 30 });
    expect(seen.x).toBe(5);
    expect(seen.z).toBe(5);
  });

  it('never leaks contents through the bulk region read either', () => {
    const piles = [pileAt(0, 0), pileAt(20, 20), pileAt(1, 0)];
    const seen = pilesVisibleTo(piles, { x: 0, z: 0 }, 2_000);
    const readable = seen.filter((pile) => pile.readable);
    expect(readable).toHaveLength(2);
    for (const pile of seen.filter((p) => !p.readable)) {
      expect(pile.contents).toBeUndefined();
    }
  });

  it('drops expired piles from the read rather than trusting a sweeper to have run', () => {
    const piles = [pileAt(0, 0)];
    expect(pilesVisibleTo(piles, { x: 0, z: 0 }, 1_000 + LOOT_DESPAWN_MS)).toHaveLength(0);
    expect(hasExpired(pileAt(0, 0), 1_000 + LOOT_DESPAWN_MS - 1)).toBe(false);
  });

  it('keeps the peek range tight enough that reading a pile exposes you', () => {
    expect(LOOT_PEEK_RANGE).toBeLessThanOrEqual(1);
  });
});

describe('looting a pile into a pack', () => {
  it('moves what fits and leaves the rest on the ground', () => {
    const pile = pileAt(0, 0, [stack('core'), stack('coil'), stack('rotor')]);
    const result = takeFromPile(pile, pile.contents, { slots: 2, carried: [] });
    expect(result.taken).toHaveLength(2);
    expect(result.remaining).toHaveLength(1);
    expect(result.full).toBe(true);
  });

  it('merges into a stack already held without spending a slot', () => {
    const pile = pileAt(0, 0, [stack('bolt', 50, 'ammo')]);
    const result = takeFromPile(pile, pile.contents, {
      slots: 1,
      carried: [stack('bolt', 10, 'ammo')],
    });
    expect(result.taken).toEqual([{ kind: 'ammo', ref: 'bolt', quantity: 50 }]);
    expect(result.remaining).toHaveLength(0);
    expect(result.full).toBe(false);
  });

  it('takes a partial quantity when that is all that was asked for', () => {
    const pile = pileAt(0, 0, [stack('coil', 10)]);
    const result = takeFromPile(pile, [stack('coil', 4)], { slots: 5, carried: [] });
    expect(result.taken[0].quantity).toBe(4);
    expect(result.remaining[0].quantity).toBe(6);
  });

  it('ignores a request for something that is not in the pile', () => {
    const pile = pileAt(0, 0, [stack('coil')]);
    const result = takeFromPile(pile, [stack('gold-bar')], { slots: 5, carried: [] });
    expect(result.taken).toHaveLength(0);
    expect(result.remaining).toHaveLength(1);
  });

  it('does not mutate the pile or the pack it was given', () => {
    // takeFromPile is the pure half of a database write. If it edited its
    // arguments, a failed transaction downstream would leave the caller holding
    // state that says the loot moved when it did not.
    const pile = pileAt(0, 0, [stack('coil', 10)]);
    const carried = [stack('coil', 1)];
    takeFromPile(pile, [stack('coil', 5)], { slots: 5, carried });
    expect(pile.contents[0].quantity).toBe(10);
    expect(carried[0].quantity).toBe(1);
  });
});

describe('the pack itself is never at risk', () => {
  it('has no representation as a carriable stack', () => {
    expect(isCarriable('pack')).toBe(false);
  });

  it('keeps its tier out of anything a pile can hold', () => {
    // A pile is CarriedStack[], and 'pack' is not a CarryClass, so a pack cannot
    // be expressed as loot even by a caller trying to.
    const tiers = PACK_TIERS.map((tier) => tier.name);
    expect(tiers).toHaveLength(MAX_PACK_STEP);
    expect(packTier(MAX_PACK_STEP)!.slots).toBeGreaterThan(packTier(1)!.slots);
  });
});
