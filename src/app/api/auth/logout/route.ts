import { NextResponse } from 'next/server';
import { endSession, sessionCookie, SESSION_COOKIE } from '@/lib/siwe';

export const dynamic = 'force-dynamic';

/** Delete the session server-side and clear the cookie. */
export async function POST(request: Request) {
  endSession(sessionCookie(request));
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  return res;
}
