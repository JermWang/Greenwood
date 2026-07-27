import { NextResponse } from 'next/server';
import { requireAuthenticatedWallet } from '@/lib/api-util';
import { GameError } from '@/lib/game';
import { assertMayEnter } from '@/lib/expedition';
import { arrivalCellFor } from '@/lib/regions';
import { recordQuestProgress } from '@/lib/quests';

export const dynamic = 'force-dynamic';

/**
 * Which regions count as "outside" for progress.
 *
 * The Machine Room and the Trading Floor are where a player already is. Counting
 * them would let the introduction's "step outside" step complete without the
 * player leaving the building it exists to get them out of.
 */
const OUTDOOR = new Set(['grounds', 'treeline', 'deep-forest']);

/**
 * Ask the server for permission to enter a region.
 *
 * The client already knows the answer — the regions payload told it — so this
 * looks redundant, and it is not. The client's copy is a courtesy that lets a
 * gate grey itself out before a round trip; this is the one that counts. Every
 * check that only runs in the browser is a check that runs for everybody except
 * the person you are worried about.
 *
 * It returns a spawn cell as well as a verdict, so entering is a single call.
 * Splitting "may I" from "where do I appear" would let a client take the yes and
 * then place itself, which for a PvP region means choosing to arrive behind
 * somebody.
 *
 * It is also where going outside becomes an EVENT rather than a side effect of a
 * URL changing, which is what the introduction's last two steps need. This route
 * existed and nothing called it; the doors in the Grounds call it now.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const wallet = await requireAuthenticatedWallet(request, body.wallet);
    if (typeof body.region !== 'string') throw new GameError('region is required', 400);

    // Throws 403 with the player-facing reason, or 404 for a region that does
    // not exist. Either way nothing below runs.
    const region = assertMayEnter(wallet, body.region);

    // After the gate, never before it: a refusal must not count as a visit.
    // recordQuestProgress swallows its own failures by design, so a broken
    // tutorial can never stop somebody walking through a door.
    if (OUTDOOR.has(region.id)) recordQuestProgress(wallet, 'enter_region');

    return NextResponse.json({
      region: {
        id: region.id,
        name: region.name,
        href: region.href,
        lighting: region.lighting,
        bounds: region.bounds,
        pvp: region.pvp,
        hostiles: region.hostiles,
      },
      spawn: arrivalCellFor(region),
      /**
       * Repeated on entry even though the region list already said it. This is
       * the moment the player is committing, and "other players can kill you
       * here" is worth stating at the door rather than only in a menu they may
       * have skimmed twenty levels ago.
       */
      warning: region.pvp
        ? 'Other funds can kill you past this gate. Anything in your pack drops where you fall.'
        : region.hostiles
          ? 'Something moves out here. Your pack is at risk, nothing else is.'
          : null,
    });
  } catch (e) {
    if (e instanceof GameError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[regions/enter]', e);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
