import { NextResponse } from 'next/server';
import { requireAuthenticatedWallet } from '@/lib/api-util';
import { GameError } from '@/lib/game';
import { attackCreature, creaturesFor } from '@/lib/expedition';

export const dynamic = 'force-dynamic';

/**
 * Swing at a creature.
 *
 * Takes a spawn id, never a position or a damage figure. The server knows where
 * the player is, where the creature is, what the swing is worth and what comes
 * back — a client that could supply any of those could supply all of them.
 *
 * The full creature list rides back on the response because a kill changes what
 * is on screen, and making the client re-poll for that would show a corpse still
 * standing for however long the poll interval is.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const wallet = await requireAuthenticatedWallet(request, body.wallet, 'expedition');
    if (typeof body.id !== 'string') throw new GameError('creature id is required', 400);
    const result = attackCreature(wallet, body.id);
    return NextResponse.json({ ...result, creatures: creaturesFor(wallet) });
  } catch (e) {
    if (e instanceof GameError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[expedition/attack]', e);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
