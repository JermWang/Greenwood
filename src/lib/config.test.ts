import { describe, expect, it } from 'vitest';
import {
  CHAIN,
  IS_MAINNET,
  networkEntry,
  TOKEN_LIVE,
  ZERO_ADDRESS,
  isConfiguredAddress,
} from './config';

describe('Robinhood Chain configuration', () => {
  /**
   * Mainnet by default, and specifically when nothing selects a network.
   *
   * The network is now a variable, so the risk this guards changed shape: a
   * missing or misspelled NEXT_PUBLIC_RH_NETWORK must land on mainnet rather
   * than on whichever entry happens to be first in the table. A build that
   * quietly ran on testnet would settle real spends against valueless tokens.
   */
  it('uses the official Robinhood Chain mainnet identifiers by default', () => {
    expect(CHAIN.id).toBe(4663);
    expect(CHAIN.hexId).toBe('0x1237');
    expect(CHAIN.rpcUrl).toContain('mainnet');
    expect(IS_MAINNET).toBe(true);
  });

  /**
   * The id and the hex id are the same number.
   *
   * Every wallet prompt goes through switchChain(CHAIN.id) while some UI reads
   * hexId, so a table entry where the two disagree would have an operator
   * signing for one network and the server verifying on another — the exact
   * class of mismatch that made the chain configurable in the first place.
   */
  it('keeps id and hexId in agreement on every network', () => {
    for (const network of ['mainnet', 'testnet'] as const) {
      const entry = networkEntry(network);
      expect(parseInt(entry.hexId, 16), `${network} hexId`).toBe(entry.id);
    }
  });

  it('knows the Robinhood Chain testnet', () => {
    const testnet = networkEntry('testnet');
    expect(testnet.id).toBe(46630);
    expect(testnet.defaultRpc).toContain('testnet');
  });

  it('treats the zero address as unconfigured so the token cannot read as live', () => {
    expect(isConfiguredAddress(ZERO_ADDRESS)).toBe(false);
    expect(TOKEN_LIVE).toBe(false);
  });
});
