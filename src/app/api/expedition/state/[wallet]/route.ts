import { NextResponse } from 'next/server';
import { requireAuthenticatedWallet } from '@/lib/api-util';
import { GameError } from '@/lib/game';
import {
  creaturesFor,
  playersIn,
  entryCheckFor,
  healthOf,
  MAX_HEALTH,
  packStateOf,
  positionOf,
  visiblePiles,
} from '@/lib/expedition';
import { arrivalCellFor, regionById } from '@/lib/regions';

export const dynamic = 'force-dynamic';

/**
 * Everything the Deep Forest needs to draw itself for one player.
 *
 * The terrain is NOT in here. It comes from lib/deep-forest-map, which the
 * client already has — sending tens of thousands of tiles that both sides can
 * compute from a coordinate would be pure waste. What this carries is the part
 * the client cannot know: where the server thinks you are, what is in your pack,
 * and which loot piles you are close enough to read.
 */
export async function GET(request: Request, context: { params: Promise<{ wallet: string }> }) {
  try {
    const { wallet: raw } = await context.params;
    const wallet = await requireAuthenticatedWallet(request, raw);

    const check = entryCheckFor(wallet, 'deep-forest');
    const spawn = arrivalCellFor(regionById('deep-forest')!);

    return NextResponse.json({
      allowed: check.allowed,
      reason: check.reason,
      code: check.code,
      // The server's position, or the spawn if this session has not moved yet.
      // Never a position the client supplied.
      position: positionOf(wallet) ?? spawn,
      anchored: positionOf(wallet) !== null,
      health: healthOf(wallet),
      maxHealth: MAX_HEALTH,
      pack: packStateOf(wallet),
      piles: visiblePiles(wallet, 'deep-forest'),
      creatures: creaturesFor(wallet),
      players: playersIn(wallet),
    });
  } catch (e) {
    if (e instanceof GameError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[expedition/state]', e);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
