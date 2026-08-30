// The onboarding "next step" state machine. Each test pins one branch and, just
// as importantly, that a higher-priority branch overrides a lower one — the
// whole point is that the guide shows ONE right thing, in the right order.
import { describe, test, expect } from 'vitest';
import { decideNextStep } from './next-step';
import type { UserOperation, InventoryItem, NodeInfo, RegionView } from './api-client';

function node(over: Partial<NodeInfo> = {}): NodeInfo {
  return {
    id: 'n1', type: 'mine', level: 1, productionRate: 0.1, isActive: true,
    totalProduced: 0, createdAt: '', layoutSeed: 0, components: [],
    componentMultiplier: 1, pendingGreen: 0, storageCap: 1000, nextLevelCost: 500,
    ...over,
  };
}

function op(over: Partial<UserOperation> = {}): UserOperation {
  return {
    level: 1, maxNodes: 2, shaftBonusSlots: 0, productionRate: 0, growPower: 0,
    networkGrowPower: 1, joinedAtMs: 0, welcomeBoostFactor: 1, greenBalance: 0,
    totalProduced: 0, totals: {}, pending: {}, claimCooldownRemainingMs: 0,
    crateCooldown: { rigCratesRemaining: 0, shaftCratesRemaining: 0 },
    crates: [], unseenCrates: [],
    compound: { level: 1, maxNodes: 2, shaftBonusSlots: 0, cratesPerDay: 10, crateCost: 10000, cooldownRemainingMs: 0, nextUpgradeCost: null },
    nodes: [],
    ...over,
  };
}

const part = (over: Partial<InventoryItem> = {}): InventoryItem => ({
  id: 1, slot: 'instrument', family: 'mine', nodeType: 'mine', rarity: 'rare',
  equippedNodeId: null, createdAt: 0, durability: 100, multiplier: 1.6, ...over,
});

describe('decideNextStep — priority order', () => {
  test('no lines -> mint the first one', () => {
    expect(decideNextStep(op(), []).id).toBe('mint-first');
  });

  test('pending yield off cooldown beats everything else', () => {
    const s = decideNextStep(
      op({ nodes: [node()], pending: { n1: 42 }, greenBalance: 999999, crates: [{ id: 1, crateType: 'treasury_allocation', foundAt: 0, foundNodeId: null }] }),
      [part()]
    );
    expect(s.id).toBe('claim');
    expect(s.action).toMatchObject({ kind: 'claim' });
  });

  test('pending on cooldown does NOT trigger the claim step', () => {
    const s = decideNextStep(op({ nodes: [node()], pending: { n1: 42 }, claimCooldownRemainingMs: 120000 }), []);
    expect(s.id).toBe('cooldown');
    expect(s.tone).toBe('wait');
  });

  test('a fitting unequipped part -> equip (when nothing to claim)', () => {
    const s = decideNextStep(op({ nodes: [node({ type: 'mine' })] }), [part({ family: 'mine' })]);
    expect(s.id).toBe('equip');
    expect(s.action).toMatchObject({ kind: 'link', href: '/app/inventory' });
  });

  test('a part for a family you do NOT own is ignored', () => {
    // Own only a mine line; hold an oil part -> should not suggest equip.
    const s = decideNextStep(op({ nodes: [node({ type: 'mine' })], greenBalance: 0 }), [part({ family: 'oil' })]);
    expect(s.id).not.toBe('equip');
  });

  test('a held pod only shows once affordable', () => {
    const held = { crates: [{ id: 1, crateType: 'treasury_allocation' as const, foundAt: 0, foundNodeId: null }] };
    // Can't afford: skip the pod.
    expect(decideNextStep(op({ nodes: [node()], greenBalance: 9999, ...held }), []).id).not.toBe('open-pod');
    // Can afford: offer it.
    expect(decideNextStep(op({ nodes: [node()], greenBalance: 10000, ...held }), []).id).toBe('open-pod');
  });

  test('affordable warehouse upgrade off cooldown -> upgrade', () => {
    const s = decideNextStep(
      op({ nodes: [node({ nextLevelCost: 1e9 })], greenBalance: 5000, compound: { level: 1, maxNodes: 2, shaftBonusSlots: 0, cratesPerDay: 10, crateCost: 10000, cooldownRemainingMs: 0, nextUpgradeCost: { targetLevel: 2, totalGreen: 1000, feeEth: 0, burnGreen: 0, reserveGreen: 0, treasuryGreen: 1000 } } }),
      []
    );
    expect(s.id).toBe('upgrade');
    expect(s.action).toMatchObject({ kind: 'scroll', scrollTo: 'compound-panel' });
  });

  test('upgrade on cooldown falls through to expand', () => {
    const s = decideNextStep(
      op({ nodes: [node({ nextLevelCost: 1e9 })], greenBalance: 5000, maxNodes: 4, compound: { level: 1, maxNodes: 4, shaftBonusSlots: 0, cratesPerDay: 10, crateCost: 10000, cooldownRemainingMs: 60000, nextUpgradeCost: { targetLevel: 2, totalGreen: 1000, feeEth: 0, burnGreen: 0, reserveGreen: 0, treasuryGreen: 1000 } } }),
      []
    );
    expect(s.id).toBe('expand');
  });

  test('capacity full + can only afford a level-up -> level up', () => {
    const s = decideNextStep(
      op({ nodes: [node({ id: 'a', type: 'oil', nextLevelCost: 400 }), node({ id: 'b', type: 'mine', nextLevelCost: 400 })], greenBalance: 500, maxNodes: 1 }),
      []
    );
    expect(s.id).toBe('level-up');
  });

  test('producing with nothing affordable -> the calm wait state', () => {
    const s = decideNextStep(op({ nodes: [node({ nextLevelCost: 1e9 })], greenBalance: 10, maxNodes: 1 }), []);
    expect(s.id).toBe('producing');
    expect(s.tone).toBe('wait');
  });
});

/**
 * The outdoor branches.
 *
 * Every branch above this used to be a fund action, and the chain terminated in
 * "nothing needs your attention right now" — the guide's final advice to its most
 * engaged players, while three regions sat unmentioned and unreachable. These
 * pin the fix, and pin that it did NOT come at the cost of the fund: anything
 * urgent still wins, because an expedition keeps and routing yield does not.
 */
const region = (over: Partial<RegionView> & { id: string }): RegionView => ({
  name: 'Somewhere',
  href: '/app/somewhere',
  blurb: 'A place.',
  minTotalLevel: 0,
  minDeskLevel: 0,
  pvp: false,
  hostiles: false,
  requiresPack: false,
  lighting: 'overcast-afternoon',
  allowed: true,
  reason: null,
  code: 'ok',
  ...over,
});

/** A fund with nothing left to do indoors — where the outdoor branches live. */
const idle = () => op({ nodes: [node({ nextLevelCost: 1e9 })], greenBalance: 10, maxNodes: 1 });

describe('decideNextStep — the outdoors', () => {
  test('without region data it behaves exactly as before', () => {
    expect(decideNextStep(idle(), []).id).toBe('producing');
  });

  test('an open region replaces the idle wait state', () => {
    const s = decideNextStep(idle(), [], [region({ id: 'grounds', name: 'Evergreen Grounds' })]);
    expect(s.id).toBe('go-outside');
    expect(s.tone).toBe('act');
    expect(s.action).toMatchObject({ kind: 'link', href: '/app/grounds' });
  });

  test('names the furthest open region, not the nearest', () => {
    // Pointing a Deep Forest player at the doorstep would be correct and useless.
    const s = decideNextStep(idle(), [], [
      region({ id: 'grounds', name: 'Evergreen Grounds' }),
      region({ id: 'deep-forest', name: 'The Deep Forest' }),
    ]);
    expect(s.title).toContain('Deep Forest');
  });

  test('a pack you could buy beats a region you could already walk into', () => {
    // Smaller, more concrete, and it opens somewhere new. "Go for a walk"
    // competes badly with a named purchase at a known price.
    const s = decideNextStep(idle(), [], [
      region({ id: 'grounds', name: 'Evergreen Grounds' }),
      region({ id: 'treeline', name: 'The Treeline', minTotalLevel: 6, allowed: false, code: 'pack', reason: 'You need a pack.' }),
    ]);
    expect(s.id).toBe('need-pack');
    expect(s.title).toContain('Treeline');
  });

  test('everything locked still names the nearest gate rather than going quiet', () => {
    const s = decideNextStep(idle(), [], [
      region({ id: 'treeline', name: 'The Treeline', minTotalLevel: 6, allowed: false, code: 'level', reason: 'Opens at 6.' }),
      region({ id: 'deep-forest', name: 'The Deep Forest', minTotalLevel: 10, allowed: false, code: 'level', reason: 'Opens at 10.' }),
    ]);
    expect(s.id).toBe('next-region');
    expect(s.title).toContain('Treeline');
    expect(s.tone).toBe('wait');
  });

  test('the fund still wins: routing yield beats going outside', () => {
    const s = decideNextStep(
      op({ nodes: [node()], pending: { n1: 42 } }),
      [],
      [region({ id: 'deep-forest', name: 'The Deep Forest' })]
    );
    expect(s.id).toBe('claim');
  });

  test('a brand-new fund is still told to open a desk first', () => {
    const s = decideNextStep(op(), [], [region({ id: 'grounds', name: 'Evergreen Grounds' })]);
    expect(s.id).toBe('mint-first');
  });

  test('every outdoor suggestion routes through the Grounds', () => {
    // The hub is where the doors are, where the refusal is, and where the pack
    // that gets you past it is sold. A deep link to a locked region would land
    // the player on a refusal with nothing to do about it.
    for (const regions of [
      [region({ id: 'deep-forest', name: 'The Deep Forest' })],
      [region({ id: 'treeline', name: 'The Treeline', allowed: false, code: 'pack' as const, reason: 'Pack.' })],
    ]) {
      const s = decideNextStep(idle(), [], regions);
      expect(s.action).toMatchObject({ kind: 'link', href: '/app/grounds' });
    }
  });
});
