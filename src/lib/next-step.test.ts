// The onboarding "next step" state machine. Each test pins one branch and, just
// as importantly, that a higher-priority branch overrides a lower one — the
// whole point is that the guide shows ONE right thing, in the right order.
import { describe, test, expect } from 'vitest';
import { decideNextStep } from './next-step';
import type { UserOperation, InventoryItem, NodeInfo } from './api-client';

function node(over: Partial<NodeInfo> = {}): NodeInfo {
  return {
    id: 'n1', type: 'mine', level: 1, productionRate: 0.1, isActive: true,
    totalProduced: 0, createdAt: '', layoutSeed: 0, components: [],
    componentMultiplier: 1, pendingOsr: 0, storageCap: 1000, nextLevelCost: 500,
    ...over,
  };
}

function op(over: Partial<UserOperation> = {}): UserOperation {
  return {
    level: 1, maxNodes: 2, shaftBonusSlots: 0, productionRate: 0, growPower: 0,
    networkGrowPower: 1, joinedAtMs: 0, welcomeBoostFactor: 1, osrBalance: 0,
    totalProduced: 0, totals: {}, pending: {}, claimCooldownRemainingMs: 0,
    crateCooldown: { rigCratesRemaining: 0, shaftCratesRemaining: 0 },
    crates: [], unseenCrates: [],
    compound: { level: 1, maxNodes: 2, shaftBonusSlots: 0, cratesPerDay: 10, crateCost: 10000, cooldownRemainingMs: 0, nextUpgradeCost: null },
    nodes: [],
    ...over,
  };
}

const part = (over: Partial<InventoryItem> = {}): InventoryItem => ({
  id: 1, slot: 'drill_bit', family: 'mine', nodeType: 'mine', rarity: 'rare',
  equippedNodeId: null, createdAt: 0, durability: 100, multiplier: 1.6, ...over,
});

describe('decideNextStep — priority order', () => {
  test('no lines -> mint the first one', () => {
    expect(decideNextStep(op(), []).id).toBe('mint-first');
  });

  test('pending yield off cooldown beats everything else', () => {
    const s = decideNextStep(
      op({ nodes: [node()], pending: { n1: 42 }, osrBalance: 999999, crates: [{ id: 1, crateType: 'shaft_crate', foundAt: 0, foundNodeId: null }] }),
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
    const s = decideNextStep(op({ nodes: [node({ type: 'mine' })], osrBalance: 0 }), [part({ family: 'oil' })]);
    expect(s.id).not.toBe('equip');
  });

  test('a held pod only shows once affordable', () => {
    const held = { crates: [{ id: 1, crateType: 'shaft_crate' as const, foundAt: 0, foundNodeId: null }] };
    // Can't afford: skip the pod.
    expect(decideNextStep(op({ nodes: [node()], osrBalance: 9999, ...held }), []).id).not.toBe('open-pod');
    // Can afford: offer it.
    expect(decideNextStep(op({ nodes: [node()], osrBalance: 10000, ...held }), []).id).toBe('open-pod');
  });

  test('affordable warehouse upgrade off cooldown -> upgrade', () => {
    const s = decideNextStep(
      op({ nodes: [node({ nextLevelCost: 1e9 })], osrBalance: 5000, compound: { level: 1, maxNodes: 2, shaftBonusSlots: 0, cratesPerDay: 10, crateCost: 10000, cooldownRemainingMs: 0, nextUpgradeCost: { targetLevel: 2, totalOsr: 1000, feeEth: 0, burnOsr: 0, reserveOsr: 0, treasuryOsr: 1000 } } }),
      []
    );
    expect(s.id).toBe('upgrade');
    expect(s.action).toMatchObject({ kind: 'scroll', scrollTo: 'compound-panel' });
  });

  test('upgrade on cooldown falls through to expand', () => {
    const s = decideNextStep(
      op({ nodes: [node({ nextLevelCost: 1e9 })], osrBalance: 5000, maxNodes: 4, compound: { level: 1, maxNodes: 4, shaftBonusSlots: 0, cratesPerDay: 10, crateCost: 10000, cooldownRemainingMs: 60000, nextUpgradeCost: { targetLevel: 2, totalOsr: 1000, feeEth: 0, burnOsr: 0, reserveOsr: 0, treasuryOsr: 1000 } } }),
      []
    );
    expect(s.id).toBe('expand');
  });

  test('capacity full + can only afford a level-up -> level up', () => {
    const s = decideNextStep(
      op({ nodes: [node({ id: 'a', type: 'oil', nextLevelCost: 400 }), node({ id: 'b', type: 'mine', nextLevelCost: 400 })], osrBalance: 500, maxNodes: 1 }),
      []
    );
    expect(s.id).toBe('level-up');
  });

  test('producing with nothing affordable -> the calm wait state', () => {
    const s = decideNextStep(op({ nodes: [node({ nextLevelCost: 1e9 })], osrBalance: 10, maxNodes: 1 }), []);
    expect(s.id).toBe('producing');
    expect(s.tone).toBe('wait');
  });
});
