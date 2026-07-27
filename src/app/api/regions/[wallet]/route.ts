import { NextResponse } from 'next/server';
import { requireAuthenticatedWallet } from '@/lib/api-util';
import { GameError } from '@/lib/game';
import { REGIONS } from '@/lib/regions';
import { entryCheckFor, packStateOf } from '@/lib/expedition';
import { progressionOf } from '@/lib/progression';

export const dynamic = 'force-dynamic';

/**
 * Where this fund may go, and what is stopping them going anywhere else.
 *
 * Returns EVERY region with its verdict rather than only the open ones. A locked
 * region has to be visible — a gate the player cannot see is a gate they cannot
 * work toward, and the Deep Forest existing at all is most of what makes level
 * 10 worth reaching. The reason and code travel with it so the client can put
 * "opens at total level 10" on the gate itself instead of guessing.
 *
 * Authenticated: the verdict depends on the caller's level and pack, so serving
 * it for an arbitrary address would let anyone enumerate another fund's
 * progression.
 */
export async function GET(request: Request, context: { params: Promise<{ wallet: string }> }) {
  try {
    const { wallet: raw } = await context.params;
    const wallet = await requireAuthenticatedWallet(request, raw);
    const pack = packStateOf(wallet);

    return NextResponse.json({
      totalLevel: progressionOf(wallet).totalLevel,
      pack,
      regions: REGIONS.map((region) => {
        const check = entryCheckFor(wallet, region.id);
        return {
          id: region.id,
          name: region.name,
          href: region.href,
          blurb: region.blurb,
          minTotalLevel: region.minTotalLevel,
          minDeskLevel: region.minDeskLevel,
          pvp: region.pvp,
          hostiles: region.hostiles,
          requiresPack: region.requiresPack,
          lighting: region.lighting,
          allowed: check.allowed,
          reason: check.reason,
          code: check.code,
        };
      }),
    });
  } catch (e) {
    if (e instanceof GameError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[regions]', e);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
