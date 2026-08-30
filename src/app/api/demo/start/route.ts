import { NextResponse } from 'next/server';
import { GameError } from '@/lib/game';
import { getOrCreateUser } from '@/lib/game';
import { grantScrip } from '@/lib/scrip';
import {
  DEMO_COOKIE,
  DEMO_COOKIE_MAX_AGE,
  DEMO_SCRIP,
  isDemoWallet,
  newDemoWallet,
} from '@/lib/demo';
import { readCookie } from '@/lib/legacy-keys';

export const dynamic = 'force-dynamic';

/**
 * Start a demo session.
 *
 * Mints a throwaway account, seeds it with Scrip and hands back a cookie that
 * authenticates it. From this point the demo is playing the real game against
 * the real database — see lib/demo for why it is built that way rather than as
 * a mock.
 *
 * Deliberately does NOT set anything else up. No desks, no levels, no
 * instruments. The introduction is the part a new player is being walked
 * through, and handing somebody a finished fund teaches them nothing about how
 * to build one — it also skips every quest, which is most of the guided content
 * a demo exists to show.
 *
 * Reuses the existing session when the browser already has one, so a refresh
 * does not silently abandon the fund somebody has been building for ten minutes
 * and start them over on an empty one.
 */
export async function POST(request: Request) {
  try {
    const existing = readCookie(request.headers.get('cookie'), DEMO_COOKIE);

    if (existing && isDemoWallet(existing)) {
      // Touch it so the row exists even if the database was reset under a live
      // cookie, then return it unchanged — no second Scrip grant.
      getOrCreateUser(existing.toLowerCase());
      return NextResponse.json({ wallet: existing.toLowerCase(), resumed: true });
    }

    const wallet = newDemoWallet();
    getOrCreateUser(wallet);
    grantScrip(wallet, DEMO_SCRIP, 'demo:starter');

    const response = NextResponse.json({ wallet, resumed: false, scrip: DEMO_SCRIP });
    response.cookies.set(DEMO_COOKIE, wallet, {
      // Readable by the client so the app knows which account it is without a
      // round trip; the cookie is not a credential for anything that holds
      // value, only for a throwaway game session.
      httpOnly: false,
      sameSite: 'lax',
      path: '/',
      maxAge: DEMO_COOKIE_MAX_AGE,
      secure: process.env.NODE_ENV === 'production',
    });
    return response;
  } catch (e) {
    if (e instanceof GameError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[demo/start]', e);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
