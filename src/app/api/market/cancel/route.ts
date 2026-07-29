import { NextResponse } from 'next/server';
import { requireAuthenticatedWallet } from '@/lib/api-util';
import { GameError } from '@/lib/game';
import { cancelListing } from '@/lib/market';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const wallet = await requireAuthenticatedWallet(request, body.wallet, 'market');
    const listingId = Number(body.listingId);
    if (!Number.isInteger(listingId) || listingId <= 0) {
      throw new GameError('listingId is required', 400);
    }
    cancelListing(wallet, listingId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof GameError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[market/cancel]', e);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
