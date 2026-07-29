// Wallet-session auth, including a real signature round-trip.
//
// The security claims here are worth testing against a genuine signer rather
// than a stub: a nonce is single-use, a session resolves only to its own
// wallet, and a signature over the server's message verifies while a signature
// over anything else does not. viem signs and verifies exactly as the browser
// wallet and the verify route do, so this exercises the real path.
import { describe, test, expect, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { privateKeyToAccount } from 'viem/accounts';
import { verifyMessage } from 'viem';

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'osr-siwe-test-'));
process.env.OSR_DATA_DIR = DATA_DIR;
delete process.env.VERCEL;

const {
  issueNonce,
  consumeNonce,
  createSession,
  walletForSession,
  endSession,
  endAllSessions,
  requireSessionWallet,
  signInMessage,
  SESSION_COOKIE,
} = await import('./siwe');
const { GameError } = await import('./errors');

// Hardhat account 0 — a published test key, no value anywhere real.
const account = privateKeyToAccount('0xac0974bec39a17e36ba4a6b4d238ff944bababceac72cf4bff02d1e46e6c9a51');
const WALLET = account.address.toLowerCase();

const cookieReq = (token: string | null) =>
  new Request('http://localhost/api/x', {
    headers: token ? { cookie: `${SESSION_COOKIE}=${token}` } : {},
  });

afterAll(() => {
  try {
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
  } catch {
    /* Windows keeps the handle. */
  }
});

describe('nonces', () => {
  test('a freshly issued nonce can be consumed exactly once', () => {
    const nonce = issueNonce(WALLET);
    expect(consumeNonce(WALLET, nonce)).toBe(true);
    // The whole point: a replay finds nothing to spend.
    expect(consumeNonce(WALLET, nonce)).toBe(false);
  });

  test('a nonce is bound to the wallet it was issued to', () => {
    const nonce = issueNonce(WALLET);
    const other = `0x${'99'.repeat(20)}`;
    expect(consumeNonce(other, nonce)).toBe(false);
    // Still spendable by the rightful wallet — the wrong-wallet attempt did not
    // consume it.
    expect(consumeNonce(WALLET, nonce)).toBe(true);
  });

  test('an invented nonce cannot be consumed', () => {
    expect(consumeNonce(WALLET, 'never-issued')).toBe(false);
  });
});

describe('the full sign-in round trip', () => {
  test('a signature over the server message verifies', async () => {
    const nonce = issueNonce(WALLET);
    const message = signInMessage(WALLET, nonce, 'playgreenwood.xyz', 4663);
    const signature = await account.signMessage({ message });
    expect(await verifyMessage({ address: account.address, message, signature })).toBe(true);
  });

  test('a signature over a DIFFERENT message does not verify', async () => {
    const nonce = issueNonce(WALLET);
    const real = signInMessage(WALLET, nonce, 'playgreenwood.xyz', 4663);
    const tampered = signInMessage(WALLET, 'a-different-nonce', 'playgreenwood.xyz', 4663);
    const signature = await account.signMessage({ message: tampered });
    // This is the replay/phishing guard: the signature is valid for what was
    // signed, but not for the message the server rebuilds from the real nonce.
    expect(await verifyMessage({ address: account.address, message: real, signature })).toBe(false);
  });

  test('the message names the domain and chain the wallet is signing for', () => {
    const msg = signInMessage(WALLET, 'n', 'playgreenwood.xyz', 4663);
    expect(msg).toContain('playgreenwood.xyz');
    expect(msg).toContain('Chain ID: 4663');
    expect(msg).toContain('Nonce: n');
  });
});

describe('sessions', () => {
  test('a created session resolves to its wallet', () => {
    const { token } = createSession(WALLET);
    expect(walletForSession(token)).toBe(WALLET);
  });

  test('an unknown token resolves to nobody', () => {
    expect(walletForSession('not-a-token')).toBeNull();
    expect(walletForSession(null)).toBeNull();
  });

  test('ending a session revokes it', () => {
    const { token } = createSession(WALLET);
    endSession(token);
    expect(walletForSession(token)).toBeNull();
  });

  test('endAllSessions revokes every session for a wallet — the incident lever', () => {
    createSession(WALLET);
    createSession(WALLET);
    const removed = endAllSessions(WALLET);
    expect(removed).toBeGreaterThanOrEqual(2);
  });

  test('requireSessionWallet accepts the matching wallet', () => {
    const { token } = createSession(WALLET);
    expect(requireSessionWallet(cookieReq(token), WALLET)).toBe(WALLET);
  });

  /**
   * The check that stops one session driving another wallet's fund. This is the
   * exact protection the Privy linked-account comparison provided, reimplemented
   * — and the easiest thing to leave out when replacing auth.
   */
  test('requireSessionWallet refuses a wallet the session does not belong to', () => {
    const { token } = createSession(WALLET);
    const other = `0x${'77'.repeat(20)}`;
    expect(() => requireSessionWallet(cookieReq(token), other)).toThrow(GameError);
  });

  test('requireSessionWallet refuses when there is no session at all', () => {
    expect(() => requireSessionWallet(cookieReq(null), WALLET)).toThrow(/sign in/i);
  });
});
