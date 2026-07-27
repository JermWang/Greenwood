import { NextResponse } from 'next/server';
import { GameError } from './game';
import { DEV_WALLET } from './dev-mode';
import { DEMO_COOKIE, isDemoWallet } from './demo';
import { verifyPrivyWalletOwner } from './privy-server';

export function ok(data: unknown) {
  return NextResponse.json(data);
}

export async function handle(fn: () => unknown | Promise<unknown>) {
  try {
    return NextResponse.json(await fn());
  } catch (e) {
    if (e instanceof GameError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error('[api]', e);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}

// Robinhood Chain uses standard 20-byte EVM addresses.
const EVM = /^0x[0-9a-fA-F]{40}$/;

export function requireWallet(w: unknown): string {
  if (typeof w !== 'string' || !EVM.test(w)) {
    throw new GameError('invalid wallet address', 400);
  }
  return w.toLowerCase();
}

/**
 * Resolve the caller's wallet and prove they own it.
 *
 * Verification is unconditional. Gating it on the Privy app id being present
 * would fail open: a deploy that lost that one variable would keep serving every
 * mutating route with no authentication at all, and the only symptom would be
 * that anyone could act as any wallet. verifyPrivyWalletOwner answers an
 * unconfigured server with a 503, which is the safe direction to fail.
 */
export async function requireAuthenticatedWallet(request: Request, value: unknown): Promise<string> {
  // Local development without a wallet. DEV_WALLET is null unless the variable
  // is set AND this is a non-production build AND nothing marks the process as
  // deployed, so this branch cannot be reached anywhere real — see lib/dev-mode
  // for why all three conditions are checked rather than just the variable.
  //
  // It returns the DEV wallet rather than the requested one on purpose. Honouring
  // the caller's address would turn the bypass into "act as anybody" even
  // locally, and a developer testing multi-wallet behaviour would get results
  // that could never happen once auth is back on.
  if (DEV_WALLET) return DEV_WALLET;

  const wallet = requireWallet(value);

  /*
   * Demo accounts authenticate with the cookie that created them.
   *
   * There is no signature to check because there is no key — nobody owns a demo
   * address. What the cookie proves is the only thing that needs proving: that
   * this browser is the one this throwaway account was minted for, so two demo
   * players cannot drive each other's fund.
   *
   * The prefix check runs against the REQUESTED wallet and the cookie has to
   * match it exactly. Accepting any demo-prefixed address on sight would let
   * anyone act as any demo account, and taking the cookie's word for which
   * account this is without comparing would let a real address be driven by a
   * demo cookie. Both halves are load-bearing.
   *
   * A demo account cannot sign, and every financial path is gated behind a
   * signature and NEXT_PUBLIC_ONCHAIN, so this widens the door to game state
   * only — never to money.
   */
  if (isDemoWallet(wallet)) {
    const cookie = request.headers
      .get('cookie')
      ?.split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${DEMO_COOKIE}=`))
      ?.slice(DEMO_COOKIE.length + 1);
    if (cookie && cookie.toLowerCase() === wallet) return wallet;
    throw new GameError('This demo session has expired. Start a new one.', 401);
  }

  await verifyPrivyWalletOwner(request, wallet);
  return wallet;
}

// Mainnet write gating now lives in settlement.ts: requireSettlement() blocks
// only while the contracts or signer are genuinely unconfigured, and reports
// which one is missing, rather than being an unconditional stub.
