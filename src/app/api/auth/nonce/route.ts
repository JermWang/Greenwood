import { NextResponse } from 'next/server';
import { requireWallet } from '@/lib/api-util';
import { issueNonce } from '@/lib/siwe';
import { consume, LIMITS } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * Step one of signing in: hand the wallet a one-time nonce to sign.
 *
 * No session guards this — it is the thing you call BEFORE you have one, and it
 * grants nothing on its own. The nonce is useless without a signature over it
 * from the very address it was issued to, and it expires in minutes.
 *
 * IT IS STILL RATE LIMITED, because it is the only UNAUTHENTICATED write in the
 * app: every call inserts a row, so without a limit anyone could grow the nonce
 * table for free. issueNonce prunes expired rows opportunistically, which bounds
 * the damage to a TTL's worth of traffic rather than forever — but a TTL's worth
 * of an unthrottled flood is still a lot of rows on a volume that also holds the
 * ledger.
 *
 * Limited by CLIENT IP rather than by wallet, which is the whole point: the
 * wallet is just a string in the body here, so a flood would simply vary it and
 * walk straight past a per-wallet bucket. The address is not proven until the
 * verify step.
 */
function clientIp(request: Request): string {
  // Railway terminates TLS in front of the app, so the socket address is a proxy.
  // First hop in x-forwarded-for is the real client.
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip')?.trim() || 'unknown';
}

export async function POST(request: Request) {
  try {
    const verdict = consume(`nonce-ip:${clientIp(request)}`, LIMITS.signIn);
    if (!verdict.allowed) {
      const seconds = Math.max(1, Math.ceil(verdict.resetMs / 1000));
      return NextResponse.json(
        { error: `Too many sign-in attempts. Try again in ${seconds}s.` },
        { status: 429 }
      );
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const wallet = requireWallet(body.wallet);
    return NextResponse.json({ nonce: issueNonce(wallet) });
  } catch (e) {
    const status = e && typeof e === 'object' && 'status' in e ? Number((e as { status: number }).status) : 400;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
}
