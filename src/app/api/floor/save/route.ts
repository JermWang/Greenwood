import { NextResponse } from 'next/server';
import { requireAuthenticatedWallet } from '@/lib/api-util';
import { GameError, invalidateNetworkGp } from '@/lib/game';
import { layoutBonus, saveLayout } from '@/lib/floor';

export const dynamic = 'force-dynamic';

/**
 * Persist a wallet's fab floor arrangement.
 *
 * Authenticated, because the layout now scales grow power: an unauthenticated
 * write would let anyone rearrange a stranger's fab, or their own without
 * owning the equipment. saveLayout re-derives every machine's kind from the
 * database and drops anything the wallet does not hold, so the worst a crafted
 * payload achieves is saving a smaller floor than it asked for.
 *
 * The response returns the normalised layout rather than echoing the request:
 * the client should render what was actually stored, including any placements
 * the server rejected, so the floor on screen never disagrees with the floor
 * being scored.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const wallet = await requireAuthenticatedWallet(request, body.wallet);

    const layout = saveLayout(wallet, body.layout);
    // Layout feeds the network denominator, so the cached total is now stale.
    invalidateNetworkGp();

    return NextResponse.json({ layout, bonus: layoutBonus(wallet) });
  } catch (e) {
    if (e instanceof GameError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error('[floor/save]', e);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
