import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { handle } from '@/lib/api-util';
import { requireAuthenticatedWallet } from '@/lib/api-util';
import { GameError } from '@/lib/game';
import { heartbeat, shardViews } from '@/lib/world-presence';
import { shardFromCookie } from '@/lib/shards';
import { regionById, type RegionId } from '@/lib/regions';

export const dynamic = 'force-dynamic';

/** The worlds, how busy each one is, and which one to suggest. */
export async function GET() {
  return handle(async () => shardViews());
}

/**
 * "I am still here, in this world."
 *
 * Authenticated, because an unauthenticated heartbeat is a way to inflate a
 * shard's population until the picker calls it full and steers everybody
 * somewhere else. The shard comes from the COOKIE rather than the body for the
 * same reason the region does not come from the client's imagination: both are
 * validated against their own tables before anything is written.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { wallet?: string; region?: string };
    const wallet = await requireAuthenticatedWallet(request, body.wallet ?? '');
    const region = regionById(body.region as RegionId);
    if (!region) throw new GameError('Unknown region', 400);
    // Only shared regions are counted. A fund alone on its own floor is not
    // population -- counting it would make the busiest-looking world the one
    // where nobody is actually outside to meet.
    if (region.presence !== 'shared') return NextResponse.json({ ok: true, counted: false });

    heartbeat(wallet, shardFromCookie(request.headers.get('cookie')), region.id);
    return NextResponse.json({ ok: true, counted: true });
  } catch (e) {
    if (e instanceof GameError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[shards/heartbeat]', e);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
