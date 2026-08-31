// @vitest-environment jsdom

// What the dashboard's one button is aimed at.
//
// Worth asserting because every failure mode here is SILENT: a bad read does
// not throw, it just returns null, and the button quietly opens the Grounds
// instead of the region you were standing in. That is indistinguishable from
// "you have not been anywhere yet", so nothing in the UI would ever report it.

import { beforeEach, describe, expect, it } from 'vitest';
import { lastRegion, rememberRegion } from './last-region';

const WALLET = '0x7a3b9c1d4e5f60718293a4b5c6d7e8f901234567';
const KEY = 'evergreen:last-region';

describe('last-region', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('reads back what it recorded', () => {
    rememberRegion(WALLET, 'deep-forest');
    expect(lastRegion(WALLET)).toBe('deep-forest');
  });

  it('records only the latest region', () => {
    rememberRegion(WALLET, 'grounds');
    rememberRegion(WALLET, 'machine-room');
    expect(lastRegion(WALLET)).toBe('machine-room');
  });

  it('is case-insensitive about the wallet, because callers are not consistent', () => {
    // The operation store holds a lowercased address and Privy hands back a
    // checksummed one. A player who signed in through the other path must not
    // lose their place.
    rememberRegion(WALLET.toUpperCase(), 'treeline');
    expect(lastRegion(WALLET)).toBe('treeline');
  });

  it('tells a different wallet nothing', () => {
    // Not privacy — the value is in that browser's own storage either way. It
    // is that a fund which has never been outside must not resume into a region
    // the PREVIOUS account was standing in.
    rememberRegion(WALLET, 'deep-forest');
    expect(lastRegion('0x000000000000000000000000000000000000dead')).toBeNull();
  });

  it('has nothing to say without a wallet', () => {
    rememberRegion(WALLET, 'grounds');
    expect(lastRegion(null)).toBeNull();
    // And a signed-out write must not overwrite the signed-in one.
    rememberRegion(null, 'deep-forest');
    expect(lastRegion(WALLET)).toBe('grounds');
  });

  it('survives a corrupted value rather than throwing into the render', () => {
    // This runs inside a useMemo during render, so a throw here is a blank
    // dashboard — the one screen that must always offer a way back in.
    for (const junk of ['', 'not json', '{}', '[]', 'null', '{"wallet":1,"region":2}']) {
      window.localStorage.setItem(KEY, junk);
      expect(lastRegion(WALLET)).toBeNull();
    }
  });
});
