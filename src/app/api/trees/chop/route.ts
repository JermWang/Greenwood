import { NextResponse } from 'next/server';
import { requireAuthenticatedWallet } from '@/lib/api-util';
import { GameError } from '@/lib/game';
import { chopTree, stumpsIn } from '@/lib/trees';
import { positionOf } from '@/lib/expedition';

export const dynamic = 'force-dynamic';

/**
 * Fell a tree.
 *
 * The tile comes from the body — a player has to be able to say WHICH tree — but
 * everything that decides whether the swing lands is computed here. What species
 * stands there, whether it is already a stump, and whether the axe can cut it
 * are all read from the server's own view of the world.
 *
 * WHERE THE PLAYER IS STANDING IS NOT TAKEN FROM THE BODY. That is the whole
 * point of the reach check: a client that could name its own position could name
 * one adjacent to any tree on the map and fell the entire forest without moving.
 * In the Deep Forest the position is recorded server-side by the movement route;
 * in the Grounds nothing is contested and movement is client-side, so there is
 * no recorded position to read and the arrival cell is the honest fallback.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const wallet = await requireAuthenticatedWallet(request, body.wallet);

    const region = typeof body.region === 'string' ? body.region : null;
    if (!region) throw new GameError('region is required', 400);
    if (typeof body.x !== 'number' || typeof body.z !== 'number') {
      throw new GameError('x and z are required', 400);
    }

    /*
     * The Grounds are the exception, and it is a deliberate one.
     *
     * Nothing there can be contested — no loot, no PvP, no creature — so
     * movement is client-side and no position is recorded. Rather than invent a
     * second movement system to support a reach check nobody can profit from
     * cheating, the reach check is waived there by passing the tile itself.
     *
     * The Deep Forest gets the real check, because that is where a felled
     * ironbark is worth taking from somebody.
     */
    let at: { x: number; z: number };
    if (region === 'grounds') {
      at = { x: Math.round(body.x), z: Math.round(body.z) };
    } else {
      const recorded = positionOf(wallet);
      /*
       * No recorded position means you are not in this region.
       *
       * This used to fall back to the GROUNDS arrival cell, which is a
       * coordinate that means nothing out here — so a player who had never
       * entered the Deep Forest got "you are not close enough to that tree"
       * about a tree they were nowhere near, which is true and useless. Worse,
       * a tile that happened to sit near (0, 21) in forest coordinates would
       * have been fellable from outside the region entirely.
       *
       * Refusing is the honest answer: felling in a contested region requires
       * being in it, and the server knows whether you are.
       */
      if (!recorded) throw new GameError('You are not out there.', 400);
      at = recorded;
    }

    const result = chopTree(wallet, region, body.x, body.z, at);
    return NextResponse.json({ ...result, stumps: stumpsIn(region) });
  } catch (e) {
    if (e instanceof GameError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[trees/chop]', e);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
