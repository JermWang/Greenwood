import { NextResponse } from 'next/server';
import { sessionCookie, walletForSession } from '@/lib/siwe';

export const dynamic = 'force-dynamic';

/**
 * Who, if anyone, this browser is signed in as.
 *
 * This used to be the Privy token-exchange endpoint; it is now a plain read of
 * the wallet session, so a page loading with a live cookie can restore its
 * signed-in state without prompting for another signature. Returns
 * authenticated:false rather than a 401 — "not signed in" is a normal answer to
 * this question, not an error.
 */
export async function GET(request: Request) {
  const wallet = walletForSession(sessionCookie(request));
  return NextResponse.json(wallet ? { authenticated: true, wallet } : { authenticated: false });
}
