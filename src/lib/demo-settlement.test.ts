// A demo account must never touch the chain, in either direction.
//
// This is the test that was missing when the token address was set, and the gap
// it covers was invisible from every direction at once: the type checker was
// happy, all 626 tests passed, and the failure needed the token to be LIVE to
// appear at all — which no test configured, because until that afternoon
// nothing in production had it either.
//
// Two things broke the moment it went live.
//
//   SPENDS   every priced action returned payment instructions to an account
//            with no wallet behind it. A demo player walked to the Machine Room
//            and was asked to send 1,000 GREEN to open their first desk, which
//            they cannot do and never could. The demo — the whole no-wallet
//            funnel, and the button on the landing page — became a dead end.
//
//   PAYOUTS  quieter and more expensive. `claim` consumed the accrual and then
//            sent real GREEN from the treasury to `0xfacade00…`, an address
//            nobody controls and nobody can ever spend from. An empty treasury
//            merely fails; a funded one loses the tokens, once per claim, for
//            as long as nobody looks.
//
// SETTLEMENT_CONFIGURED is read at module load, so each case needs its own
// module registry — resetModules and a re-import, with the env set BEFORE the
// import. Same shape as starter-grant.test.ts.

import { describe, test, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.OSR_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'eg-demo-settle-'));
delete process.env.VERCEL;

const REAL = `0x${'1'.repeat(40)}`;
const DEMO = `0xfacade00${'2'.repeat(32)}`;

/**
 * A key whose address is the published treasury.
 *
 * SETTLEMENT_CONFIGURED requires all three to line up — token, treasury, and a
 * signer that IS that treasury — so a made-up address pair is not enough to
 * turn settlement on. Derived rather than hardcoded so this cannot drift if the
 * derivation ever changes.
 */
async function signerPair() {
  const { privateKeyToAccount } = await import('viem/accounts');
  const key = `0x${'3'.repeat(64)}` as `0x${string}`;
  return { key, address: privateKeyToAccount(key).address };
}

/** Load a fresh copy of settlement with the token configured or not. */
async function settlementWith(configured: boolean) {
  vi.resetModules();
  if (configured) {
    const { key, address } = await signerPair();
    process.env.NEXT_PUBLIC_OSR_TOKEN = `0x${'a'.repeat(40)}`;
    process.env.NEXT_PUBLIC_OSR_TREASURY_WALLET = address;
    process.env.OSR_TREASURY_PK = key;
  } else {
    delete process.env.NEXT_PUBLIC_OSR_TOKEN;
    delete process.env.NEXT_PUBLIC_OSR_TREASURY_WALLET;
    delete process.env.OSR_TREASURY_PK;
  }
  const settlement = await import('./settlement');
  expect(
    settlement.SETTLEMENT_CONFIGURED,
    'test setup: SETTLEMENT_CONFIGURED did not take'
  ).toBe(configured);
  return settlement;
}

beforeEach(() => vi.resetModules());

describe('with the token live', () => {
  test('a real wallet settles on-chain', async () => {
    const { settlesOnChain } = await settlementWith(true);
    expect(settlesOnChain(REAL)).toBe(true);
  });

  test('a demo wallet does NOT', async () => {
    // The whole point. Everything else in this file is scaffolding for this
    // line: with settlement configured, a demo address still takes the
    // mirrored path, for spends and for payouts alike.
    const { settlesOnChain } = await settlementWith(true);
    expect(settlesOnChain(DEMO)).toBe(false);
  });

  test('the demo check is the prefix, not the exact address', async () => {
    // Demo addresses are minted at random behind a fixed prefix, so matching
    // one literal address would pass this test and protect nobody.
    const { settlesOnChain } = await settlementWith(true);
    for (const suffix of ['0'.repeat(32), 'f'.repeat(32), '0123456789abcdef'.repeat(2)]) {
      expect(settlesOnChain(`0xfacade00${suffix}`)).toBe(false);
    }
  });

  test('an address merely CONTAINING the prefix still settles', async () => {
    // `isDemoWallet` is a startsWith, and it has to stay one: a real wallet
    // that happens to contain "facade00" further along is a real wallet, and
    // refusing to settle it would strand somebody's money in the mirror.
    const { settlesOnChain } = await settlementWith(true);
    expect(settlesOnChain(`0xabcdef00facade00${'1'.repeat(24)}`)).toBe(true);
  });
});

describe('before the token exists', () => {
  test('nobody settles on-chain', async () => {
    const { settlesOnChain } = await settlementWith(false);
    expect(settlesOnChain(REAL)).toBe(false);
    expect(settlesOnChain(DEMO)).toBe(false);
  });
});
