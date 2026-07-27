// Demo accounts, and the two properties that keep them safe.
//
// A demo plays the real game against the real database, which is what stops it
// drifting out of date — and also what makes these assertions worth having,
// because the same code path serves people with actual holdings.
import { describe, expect, it } from 'vitest';
import { DEMO_PREFIX, DEMO_SCRIP, isDemoWallet, newDemoWallet } from './demo';
import { PACK_TIERS } from './packs';

/** The same validator every API route runs a wallet through. */
const EVM = /^0x[0-9a-fA-F]{40}$/;

describe('demo addresses', () => {
  /**
   * The bug this exists for: the marker was "d3m0", which is not hex. Demo
   * addresses go through the same `requireWallet` as real ones — deliberately,
   * because a demo account that skipped validation would be a second and weaker
   * path into every route — so a non-hex marker is rejected by the very check it
   * has to pass, and every demo request 400s.
   */
  it('mints addresses that pass the real wallet validator', () => {
    for (let i = 0; i < 200; i += 1) {
      const wallet = newDemoWallet();
      expect(EVM.test(wallet), wallet).toBe(true);
      expect(wallet.length).toBe(42);
    }
  });

  it('marks every one of them recognisably', () => {
    for (let i = 0; i < 50; i += 1) {
      expect(isDemoWallet(newDemoWallet())).toBe(true);
    }
    expect(DEMO_PREFIX.slice(2)).toMatch(/^[0-9a-f]+$/);
  });

  /**
   * Two people opening the demo at the same moment must not land on the same
   * account and watch each other's desks appear.
   */
  it('does not collide', () => {
    const seen = new Set(Array.from({ length: 500 }, () => newDemoWallet()));
    expect(seen.size).toBe(500);
  });

  it('is deterministic when the randomness is', () => {
    const fixed = () => 0.42;
    expect(newDemoWallet(fixed)).toBe(newDemoWallet(fixed));
  });

  /**
   * The load-bearing negative. `isDemoWallet` gates the region waiver and the
   * cookie-based auth bypass, so a real address matching it would be a real
   * address that walks through locked gates and authenticates without a
   * signature.
   */
  it('never mistakes a real address for a demo one', () => {
    const real = [
      '0x7a3b9c1d4e5f60718293a4b5c6d7e8f901234567',
      '0x0000000000000000000000000000000000000000',
      '0xffffffffffffffffffffffffffffffffffffffff',
      '0xfacadeff00000000000000000000000000000000', // near miss on the prefix
    ];
    for (const wallet of real) expect(isDemoWallet(wallet), wallet).toBe(false);
    expect(isDemoWallet(null)).toBe(false);
    expect(isDemoWallet(undefined)).toBe(false);
    expect(isDemoWallet('')).toBe(false);
  });

  it('matches regardless of case, since addresses arrive both ways', () => {
    expect(isDemoWallet(newDemoWallet().toUpperCase().replace('0X', '0x'))).toBe(true);
  });
});

describe('the starting balance', () => {
  it('covers a pack with something left to spend', () => {
    // The point of a demo is to see the game, not to earn the right to see it —
    // but a balance so large the economy reads as meaningless teaches the wrong
    // thing about the real one.
    expect(DEMO_SCRIP).toBeGreaterThan(PACK_TIERS[0].scripCost);
    expect(DEMO_SCRIP).toBeLessThan(PACK_TIERS[PACK_TIERS.length - 1].scripCost);
  });
});
