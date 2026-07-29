'use client';

// The client half of wallet sign-in: turn a connected wallet into a session.
//
// Three calls: ask the server for a nonce, have the wallet personal_sign the
// exact message the server will rebuild, submit the signature. The server sets
// the session cookie on the last step, so there is nothing to store here — the
// browser carries it from then on.
//
// The message is NOT built here and sent up; it is built on the server from the
// nonce, and rebuilt identically for the wallet to sign. If the client composed
// the message, a compromised client could show the user one thing and have the
// server verify another. Both sides call the same signInMessage.

import { api } from './api-client';
// From siwe-message, NOT siwe: siwe touches the database, and importing it into
// this client module would pull node:sqlite into the browser bundle.
import { signInMessage } from './siwe-message';
import { CHAIN } from './config';
import { getActiveProvider } from './evm';

/**
 * Sign in the connected wallet. Returns the authenticated address.
 *
 * Throws if no wallet is connected or the user rejects the signature — the
 * caller surfaces that as a normal "connect and sign to continue" state, since
 * declining to sign is a choice, not a failure.
 */
export async function signInWithWallet(address: string): Promise<string> {
  const provider = getActiveProvider();
  if (!provider) throw new Error('Connect a wallet first');

  const wallet = address.toLowerCase();
  const { nonce } = await api.authNonce(wallet);
  const message = signInMessage(wallet, nonce, window.location.host, CHAIN.id);

  // personal_sign is the method every injected wallet implements and displays
  // as human-readable text. The [message, address] parameter order is the
  // long-standing convention injected wallets expect.
  const signature = (await provider.request({
    method: 'personal_sign',
    params: [message, wallet],
  })) as string;

  const result = await api.authVerify(wallet, nonce, signature);
  return result.wallet;
}
