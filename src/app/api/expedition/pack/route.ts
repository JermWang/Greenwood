import { NextResponse } from 'next/server';
import { requireAuthenticatedWallet } from '@/lib/api-util';
import { GameError } from '@/lib/game';
import { packStateOf, upgradePack } from '@/lib/expedition';

export const dynamic = 'force-dynamic';

/**
 * Buy the first pack, or the next step up.
 *
 * One route for both, because they are the same transaction — the ladder starts
 * at step 1 and the initial purchase is simply the move from 0 to 1. The tier
 * and the price are NOT taken from the request: `upgradePack` reads the player's
 * current step and derives the next one, so a body claiming to be buying a Phat
 * Pack for a Satchel's price has nothing to claim it with.
 *
 * This route is the reason the pack ladder existed but could not be climbed.
 * PACK_TIERS, upgradePack, the Scrip cost and the region gate that requires a
 * pack were all written and tested; there was no way to actually buy one, so
 * every gate with `requiresPack` was permanently shut. The introduction even
 * pays out enough Scrip for a Satchel on the reasoning that it "hands you the
 * key to the outdoors" — and then there was no lock to put it in.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const wallet = await requireAuthenticatedWallet(request, body.wallet, 'expedition');

    const { tier } = upgradePack(wallet);
    return NextResponse.json({ tier, pack: packStateOf(wallet) });
  } catch (e) {
    if (e instanceof GameError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[expedition/pack]', e);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
