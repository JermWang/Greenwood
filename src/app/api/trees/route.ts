import { NextResponse } from 'next/server';
import { requireAuthenticatedWallet } from '@/lib/api-util';
import { GameError } from '@/lib/game';
import { stumpsIn } from '@/lib/trees';

export const dynamic = 'force-dynamic';

/**
 * The stumps in a region.
 *
 * Only the FELLED trees travel — a standing one is already computable from its
 * coordinate on both sides, so sending the forest would be sending a map the
 * client already has. This is the exception list.
 *
 * Authenticated like everything else, though nothing here is private: two
 * players in the same clearing are meant to see the same ground. The auth is for
 * consistency of shape rather than secrecy, so there is one way to call this API
 * rather than two.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const wallet = await requireAuthenticatedWallet(request, searchParams.get('wallet'));
    void wallet;

    const region = searchParams.get('region');
    if (!region) throw new GameError('region is required', 400);

    return NextResponse.json({ stumps: stumpsIn(region) });
  } catch (e) {
    if (e instanceof GameError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[trees]', e);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
