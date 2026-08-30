// The sign-in message, and nothing else.
//
// Split out from lib/siwe on purpose: siwe.ts touches the database (nonces and
// sessions live in SQLite), so importing it from a 'use client' module would
// drag node:sqlite into the browser bundle and fail the build. This file has
// ZERO imports, so both the client (to ask the wallet to sign) and the server
// (to rebuild and verify) can share the one definition — which is the whole
// point: if the two sides built the message differently, every valid signature
// would fail to verify.

/**
 * The exact text the wallet is asked to sign.
 *
 * Built from the nonce, domain and chain alone. The client must not compose its
 * own message and send it up — a compromised client could show the user one
 * thing and submit another — so this is called identically on both sides and
 * the server rebuilds it from the nonce it issued.
 */
export function signInMessage(wallet: string, nonce: string, domain: string, chainId: number): string {
  return [
    `${domain} wants you to sign in with your Ethereum account:`,
    wallet.toLowerCase(),
    '',
    'Sign in to Evergreen. This does not cost anything and does not approve any transaction.',
    '',
    `URI: https://${domain}`,
    `Chain ID: ${chainId}`,
    `Nonce: ${nonce}`,
  ].join('\n');
}
