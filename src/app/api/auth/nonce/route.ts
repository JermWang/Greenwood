import { NextResponse } from 'next/server';
import { requireWallet } from '@/lib/api-util';
import { issueNonce } from '@/lib/siwe';

export const dynamic = 'force-dynamic';

/**
 * Step one of signing in: hand the wallet a one-time nonce to sign.
 *
 * No auth guards this — it is the thing you call BEFORE you have a session, and
 * it grants nothing on its own. The nonce is useless without a signature over
 * it from the very address it was issued to, and it expires in minutes.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const wallet = requireWallet(body.wallet);
    return NextResponse.json({ nonce: issueNonce(wallet) });
  } catch (e) {
    const status = e && typeof e === 'object' && 'status' in e ? Number((e as { status: number }).status) : 400;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
}
