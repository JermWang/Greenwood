import { NextResponse } from 'next/server';
import { requireAuthenticatedWallet } from '@/lib/api-util';
import { GameError } from '@/lib/game';
import { assertMayEnter, creaturesFor,
  playersIn, stepTo, visiblePiles } from '@/lib/expedition';

export const dynamic = 'force-dynamic';

/**
 * Take one step.
 *
 * One tile per call, deliberately. The obvious design is to post a destination
 * and let the server walk you there, but that hands the client a way to cross
 * the map in a single request — and everything in this zone that matters is a
 * question about WHERE YOU ARE RIGHT NOW. Loot is readable at one tile.
 * Extraction happens at a gate. A player who can jump twenty tiles in one call
 * can read every pile on the map without ever being exposed.
 *
 * So the client walks the path it computed, one tile at a time, and each tile is
 * checked. The server's answer is authoritative: it returns the position it
 * believes, which is not always the one that was asked for, and a rejected step
 * simply returns the player where they already were.
 *
 * Piles come back with every step because visibility changes as you move — that
 * is the entire point of the proximity rule, and making the client ask
 * separately would just mean it asks on a timer and sees stale contents.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const wallet = await requireAuthenticatedWallet(request, body.wallet);

    // Re-checked on every step, not just on entry. A player whose right to be
    // here lapsed mid-run should stop being able to move, and a client that
    // never called the enter route should not get to skip the gate by posting
    // steps directly.
    assertMayEnter(wallet, 'deep-forest');

    const x = Number(body.x);
    const z = Number(body.z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) {
      throw new GameError('x and z are required', 400);
    }

    const result = stepTo(wallet, { x, z });
    return NextResponse.json({
      ...result,
      piles: visiblePiles(wallet, 'deep-forest'),
      // Creatures ride along for the same reason piles do: what is hunting you
      // changes as you move, and a separate poll would always be a step behind.
      creatures: creaturesFor(wallet),
      players: playersIn(wallet),
    });
  } catch (e) {
    if (e instanceof GameError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[expedition/step]', e);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
