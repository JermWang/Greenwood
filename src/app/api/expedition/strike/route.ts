import { NextResponse } from 'next/server';
import { requireAuthenticatedWallet } from '@/lib/api-util';
import { GameError } from '@/lib/game';
import { attackPlayer, creaturesFor, healthOf, playersIn, visiblePiles } from '@/lib/expedition';

export const dynamic = 'force-dynamic';

/**
 * Attack another player.
 *
 * Separate from /attack because the targets are different KINDS of thing, not
 * because the verb differs: a creature is addressed by a deterministic spawn id
 * the client already knows, a player by a wallet. Folding them into one route
 * would mean an id field that means two things and a branch to tell them apart.
 *
 * The whole world comes back, because a kill can change all of it at once —
 * their body is gone, a pile appeared where they stood, and your own health may
 * have moved if something bit you in the meantime.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const wallet = await requireAuthenticatedWallet(request, body.wallet, 'expedition');
    if (typeof body.target !== 'string') throw new GameError('target is required', 400);

    const result = attackPlayer(wallet, body.target);
    return NextResponse.json({
      ...result,
      health: healthOf(wallet),
      players: playersIn(wallet),
      creatures: creaturesFor(wallet),
      piles: visiblePiles(wallet, 'deep-forest'),
    });
  } catch (e) {
    if (e instanceof GameError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[expedition/strike]', e);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
