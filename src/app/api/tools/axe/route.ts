import { NextResponse } from 'next/server';
import { requireAuthenticatedWallet } from '@/lib/api-util';
import { GameError } from '@/lib/game';
import { axeOf, buyAxe } from '@/lib/trees';
import { AXES, ALL_AXES, type AxeId } from '@/lib/woodcutting';

export const dynamic = 'force-dynamic';

/** What this fund carries, and what the next rung costs. */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const wallet = await requireAuthenticatedWallet(request, searchParams.get('wallet'));
    const owned = axeOf(wallet);
    const tier = owned ? AXES[owned].tier : 0;
    return NextResponse.json({
      axe: owned ? AXES[owned] : null,
      // Only ever the NEXT rung. The ladder is climbed one at a time, so
      // offering the whole catalogue would advertise purchases the buy route
      // refuses — a shop that lists things it will not sell you.
      next: ALL_AXES.find((a) => a.tier === tier + 1) ?? null,
    });
  } catch (e) {
    if (e instanceof GameError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[tools/axe]', e);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}

/**
 * Buy the next axe up.
 *
 * The id is taken from the body so the client can be explicit about what it
 * thinks it is buying, and `buyAxe` then refuses anything that is not exactly
 * one rung above what is owned. That way a stale UI offering the wrong axe gets
 * a refusal rather than quietly charging for a different one.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const wallet = await requireAuthenticatedWallet(request, body.wallet);
    if (typeof body.axe !== 'string') throw new GameError('axe is required', 400);

    const result = buyAxe(wallet, body.axe as AxeId);
    return NextResponse.json({ ...result, tool: AXES[result.axe] });
  } catch (e) {
    if (e instanceof GameError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[tools/axe]', e);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
