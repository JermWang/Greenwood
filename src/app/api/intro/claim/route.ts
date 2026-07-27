import { NextResponse } from 'next/server';
import { requireAuthenticatedWallet } from '@/lib/api-util';
import { GameError } from '@/lib/game';
import { claimIntroStep } from '@/lib/intro';
import { progressionOf } from '@/lib/progression';
import { scripBalances } from '@/lib/scrip';

export const dynamic = 'force-dynamic';

/**
 * Collect a finished introduction step.
 *
 * Authenticated for the same reason the daily claim is: it pays XP, XP feeds
 * Total Level, and Total Level is what the leaderboard ranks on and what the
 * region gates read. It also pays Scrip, which buys packs and cosmetics.
 *
 * The double-claim guard is a conditional UPDATE inside claimIntroStep, so
 * racing requests cannot both pay out.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const wallet = await requireAuthenticatedWallet(request, body.wallet);
    if (typeof body.key !== 'string') throw new GameError('step key is required', 400);
    const result = claimIntroStep(wallet, body.key);
    return NextResponse.json({
      ...result,
      progression: progressionOf(wallet),
      scrip: scripBalances(wallet),
    });
  } catch (e) {
    if (e instanceof GameError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[intro/claim]', e);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
