import { describe, expect, it } from 'vitest';
import { requireWallet } from './api-util';
import { settlementBlocker, requireSettlement, encodeDetail } from './settlement';
import { decodeDetail } from './settle-route';

describe('API financial guards', () => {
  it('accepts only EVM addresses and normalizes their case', () => {
    expect(requireWallet('0x000000000000000000000000000000000000dEaD')).toBe(
      '0x000000000000000000000000000000000000dead'
    );
    expect(() => requireWallet('6sVZaZRvdU5X9W4SWckL7mxgPS4UYZtsgFjYMEwDCuGY')).toThrow(
      'invalid wallet address'
    );
  });

  it('keeps on-chain settlement locked until the token and wallet are set', () => {
    // The GREEN token address is unset in this environment, so the gate must hold
    // — and must name the missing piece rather than failing opaquely.
    const blocker = settlementBlocker();
    expect(blocker).not.toBeNull();
    expect(blocker).toMatch(/not set|not configured/);
    expect(() => requireSettlement()).toThrow(/On-chain settlement unavailable/);
  });
});

describe('settlement detail payload', () => {
  it('round-trips the action parameters that bind a receipt to its quote', () => {
    for (const value of ['equity_desk', 'treasury_desk', 'equity_allocation:42', 'L7', 'expedite']) {
      expect(decodeDetail(encodeDetail(value))).toBe(value);
    }
  });

  it('produces a fixed 32-byte payload', () => {
    expect(encodeDetail('equity_desk')).toHaveLength(66); // 0x + 64 hex chars
  });

  it('rejects a payload that would not fit on-chain', () => {
    expect(() => encodeDetail('x'.repeat(33))).toThrow(/too long/);
  });
});
