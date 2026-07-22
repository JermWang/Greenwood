import { NextResponse } from 'next/server';
import { GameError } from './game';
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
  const wallet = requireWallet(value);
  await verifyPrivyWalletOwner(request, wallet);
  return wallet;
}

// Mainnet write gating now lives in settlement.ts: requireSettlement() blocks
// only while the contracts or signer are genuinely unconfigured, and reports
// which one is missing, rather than being an unconditional stub.
