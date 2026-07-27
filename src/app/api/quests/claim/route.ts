import { NextResponse } from 'next/server';
import { requireAuthenticatedWallet } from '@/lib/api-util';
import { GameError } from '@/lib/game';
import { claimQuest } from '@/lib/quests';
import { progressionOf } from '@/lib/progression';

export const dynamic = 'force-dynamic';

/**
 * Collect a finished quest's XP.
 *
 * Authenticated even though the payout is XP rather than tokens: XP feeds Total
 * Level, which the leaderboard and profile rank on, so letting any caller claim
 * for any address would make the rankings meaningless.
 *
 * The engine does the double-claim guard with a conditional UPDATE, so racing
 * requests cannot both pay out.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const wallet = await requireAuthenticatedWallet(request, body.wallet);
    if (typeof body.key !== 'string') throw new GameError('quest key is required', 400);
    const result = claimQuest(wallet, body.key);
    return NextResponse.json({ ...result, progression: progressionOf(wallet) });
  } catch (e) {
    if (e instanceof GameError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[quests/claim]', e);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
