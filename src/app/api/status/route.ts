import { NextResponse } from 'next/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getProtocolValue, setProtocolValue } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Build identity + deploy state, polled by every connected client.
 *
 * Two jobs. It reports which build is serving, so a client that loaded an older
 * one can notice it is stale and reload itself. And it reports whether a deploy
 * is in flight, so the UI can stop players starting an action that would be cut
 * in half by the cutover — a spend sends GREEN on-chain before the server applies
 * anything, so losing the server in between costs the player real tokens and
 * leaves us owing a refund.
 */

const NOTICE_KEY = 'deploy_notice_until';
const NOTICE_STARTED_KEY = 'deploy_notice_started';

/**
 * The running build's id. Read from disk once — Next writes it at build time,
 * so it changes exactly when a new build starts serving, which is the signal
 * clients use to detect they are stale.
 */
let buildIdRef: string | null = null;
function buildId(): string {
  if (buildIdRef) return buildIdRef;
  for (const path of [join(process.cwd(), '.next', 'BUILD_ID'), '.next/BUILD_ID']) {
    try {
      const id = readFileSync(path, 'utf8').trim();
      if (id) return (buildIdRef = id);
    } catch {
      /* try the next candidate */
    }
  }
  // Dev has no BUILD_ID file. A stable fallback keeps the client from
  // reload-looping on a value that changes every request.
  return (buildIdRef = 'dev');
}

export async function GET() {
  const until = Number(getProtocolValue(NOTICE_KEY) ?? '0');
  const started = Number(getProtocolValue(NOTICE_STARTED_KEY) ?? '0');
  const now = Date.now();
  const active = until > now;
  return NextResponse.json(
    {
      buildId: buildId(),
      // Server clock is sent so the countdown cannot be skewed by a wrong
      // clock on the player's machine.
      serverTime: now,
      deploy: active ? { until, startedAt: started || null } : null,
    },
    { headers: { 'cache-control': 'no-store' } }
  );
}

/**
 * Open or clear a deploy window. Called by scripts/announce-deploy.mjs right
 * before a deploy, and again to clear it if a deploy is abandoned.
 *
 * Guarded by a shared secret: without one, anyone could freeze every player's
 * controls by posting a fake maintenance window.
 */
export async function POST(request: Request) {
  const secret = (process.env.OSR_ADMIN_TOKEN ?? '').trim();
  if (!secret) {
    return NextResponse.json({ error: 'OSR_ADMIN_TOKEN is not configured' }, { status: 503 });
  }
  const auth = request.headers.get('authorization') ?? '';
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const minutes = Number(body.minutes ?? 5);
  if (!Number.isFinite(minutes) || minutes < 0 || minutes > 60) {
    return NextResponse.json({ error: 'minutes must be between 0 and 60' }, { status: 400 });
  }

  if (minutes === 0) {
    setProtocolValue(NOTICE_KEY, '0');
    setProtocolValue(NOTICE_STARTED_KEY, '0');
    return NextResponse.json({ cleared: true });
  }

  const now = Date.now();
  const until = now + minutes * 60_000;
  setProtocolValue(NOTICE_KEY, String(until));
  setProtocolValue(NOTICE_STARTED_KEY, String(now));
  return NextResponse.json({ until, startedAt: now, minutes });
}
