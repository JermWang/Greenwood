import { NextResponse } from 'next/server';
import { requireAuthenticatedWallet } from '@/lib/api-util';
import { GameError } from '@/lib/game';
import { createListing, type ItemKind } from '@/lib/market';

export const dynamic = 'force-dynamic';

/**
 * List an item for sale.
 *
 * Listing is free and unpriced by the protocol — sellers name any figure they
 * like. No transfer happens here; the item only moves when a buyer's payment is
 * verified.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const wallet = await requireAuthenticatedWallet(request, body.wallet, 'market');

    const kind = body.itemKind;
    if (kind !== 'crate' && kind !== 'component' && kind !== 'node') {
      throw new GameError('itemKind must be crate, component or node', 400);
    }
    const itemId = Number(body.itemId);
    if (!Number.isInteger(itemId) || itemId <= 0) throw new GameError('itemId is required', 400);
    const priceGreen = Number(body.priceGreen);
    if (!Number.isFinite(priceGreen) || priceGreen <= 0) {
      throw new GameError('priceGreen must be a positive number', 400);
    }

    return NextResponse.json({ listing: createListing(wallet, kind as ItemKind, itemId, priceGreen) });
  } catch (e) {
    if (e instanceof GameError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[market/list]', e);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
