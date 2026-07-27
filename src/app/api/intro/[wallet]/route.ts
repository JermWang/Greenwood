import { NextResponse } from 'next/server';
import { requireAuthenticatedWallet } from '@/lib/api-util';
import { GameError } from '@/lib/game';
import { introState } from '@/lib/intro';
import { progressionOf } from '@/lib/progression';

export const dynamic = 'force-dynamic';

/** The introduction chain, and the level it feeds. */
export async function GET(request: Request, context: { params: Promise<{ wallet: string }> }) {
  try {
    const { wallet: raw } = await context.params;
    const wallet = await requireAuthenticatedWallet(request, raw);
    return NextResponse.json({
      intro: introState(wallet),
      progression: progressionOf(wallet),
    });
  } catch (e) {
    if (e instanceof GameError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[intro]', e);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
