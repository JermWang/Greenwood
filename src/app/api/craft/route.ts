import { NextResponse } from 'next/server';
import { requireAuthenticatedWallet } from '@/lib/api-util';
import { GameError } from '@/lib/game';
import { benchFor, craftItem } from '@/lib/craft';

export const dynamic = 'force-dynamic';

/**
 * The bench, as this wallet sees it.
 *
 * Every recipe with its verdict and what it would cost right now, rather than
 * only the ones that are currently possible. A bench that hid what you cannot
 * afford would hide the entire ladder from a new player, and the ladder is the
 * thing worth showing — you cannot work toward a recipe you have never seen.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const wallet = await requireAuthenticatedWallet(request, searchParams.get('wallet'));
    return NextResponse.json({ bench: benchFor(wallet) });
  } catch (e) {
    if (e instanceof GameError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[craft]', e);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}

/**
 * Make something.
 *
 * The recipe id is the only thing taken from the body. What it costs, what wood
 * is spent and whether the tools are there are all computed server-side from the
 * player's actual pack — a client that could name its own ingredients could
 * craft an ironbark crossbow out of pine and the only evidence would be an
 * inventory that quietly stopped adding up.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const wallet = await requireAuthenticatedWallet(request, body.wallet);
    if (typeof body.recipe !== 'string') throw new GameError('recipe is required', 400);

    const result = craftItem(wallet, body.recipe);
    return NextResponse.json({ ...result, bench: benchFor(wallet) });
  } catch (e) {
    if (e instanceof GameError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[craft]', e);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
