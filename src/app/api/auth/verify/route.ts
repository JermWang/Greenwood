import { NextResponse } from 'next/server';
import { verifyMessage } from 'viem';
import { requireWallet } from '@/lib/api-util';
import {
  consumeNonce,
  createSession,
  signInMessage,
  SESSION_COOKIE,
  SESSION_TTL_MS,
} from '@/lib/siwe';
import { touchGlobalProfile } from '@/lib/profiles';
import { CHAIN } from '@/lib/config';

export const dynamic = 'force-dynamic';

/**
 * Step two: verify the signature and open a session.
 *
 * The order is the security. The nonce is CONSUMED before the signature is
 * checked, so a replayed request finds nothing to consume and is refused even
 * if the signature is valid — a signature is reusable, a spent nonce is not.
 * The message is rebuilt here from the nonce rather than trusted from the body,
 * so a caller cannot have the user sign one thing and submit another.
 *
 * The domain is read from the request host, not a variable, so the text the
 * wallet showed the user names the site they are actually on.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const wallet = requireWallet(body.wallet);
    const nonce = typeof body.nonce === 'string' ? body.nonce : '';
    const signature = typeof body.signature === 'string' ? body.signature : '';
    if (!nonce || !signature) {
      return NextResponse.json({ error: 'nonce and signature are required' }, { status: 400 });
    }

    // Spend the nonce first. If it was never issued to this wallet, already
    // used, or expired, there is nothing to verify against.
    if (!consumeNonce(wallet, nonce)) {
      return NextResponse.json({ error: 'This sign-in request expired. Try again.' }, { status: 401 });
    }

    const host = request.headers.get('host') ?? 'evergreen';
    const message = signInMessage(wallet, nonce, host, CHAIN.id);

    const valid = await verifyMessage({
      address: wallet as `0x${string}`,
      message,
      signature: signature as `0x${string}`,
    });
    if (!valid) {
      return NextResponse.json({ error: 'Signature did not match the wallet.' }, { status: 401 });
    }

    const { token } = createSession(wallet);
    // Best-effort, and deliberately AFTER the session exists. The global profile
    // is a Supabase projection of game state; a sync hiccup there must never
    // fail a sign-in whose signature already checked out. Letting it throw here
    // was doing exactly that — a valid wallet got a 400 and no cookie because an
    // unrelated profile write complained.
    try {
      await touchGlobalProfile(wallet);
    } catch (e) {
      console.error('[auth/verify] profile sync failed, continuing', e);
    }

    const res = NextResponse.json({ authenticated: true, wallet });
    // httpOnly so page scripts (and any XSS) cannot read the session token;
    // sameSite=lax so it rides same-origin API calls but not cross-site posts;
    // secure everywhere but plain-http localhost, where the cookie would
    // otherwise never be set during development.
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: !host.startsWith('localhost') && !host.startsWith('127.0.0.1'),
      path: '/',
      maxAge: Math.floor(SESSION_TTL_MS / 1000),
    });
    return res;
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
