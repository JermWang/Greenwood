import { NextResponse } from 'next/server';
import { requireAuthenticatedWallet } from '@/lib/api-util';
import { GameError, getOrCreateUser, inventory, userOperation } from '@/lib/game';
import { introState, type IntroContext } from '@/lib/intro';
import { progressionOf } from '@/lib/progression';
import { unopenedCrates } from '@/lib/crates';
import { crateCostGreen, STAKE_MIN_GREEN } from '@/lib/economy';
import { nodeUpgradeCost } from '@/lib/capital';
import { getOsrUsdPrice } from '@/lib/price';
import { openListings } from '@/lib/market';

export const dynamic = 'force-dynamic';

/**
 * What the player can act on right now.
 *
 * The introduction defers any step whose gate is shut rather than stopping at
 * it, and this is where those gates get their answers. Assembled here rather
 * than inside lib/intro because lib/game already imports lib/intro to record
 * progress — building it there would close the cycle.
 *
 * Everything except the listing scan is a read the dashboard already performs,
 * so it costs the player nothing they were not paying for anyway. The listing
 * scan is the one addition: a single bounded query against local SQLite, which
 * is cheap, and the alternative is the Exchange step blocking the two outdoor
 * steps behind it on a quiet market.
 */
function introContextFor(wallet: string): IntroContext {
  const user = getOrCreateUser(wallet);
  const locker = inventory(wallet);
  const op = userOperation(wallet);
  const upgrades = op.nodes.map((node) => nodeUpgradeCost(node.level));
  const balance = user.osr_balance;

  return {
    heldAllocations: unopenedCrates(wallet).length,
    unfittedInstruments: locker.items.filter((item) => item.equippedNodeId == null).length,
    // osr_balance, not a renamed field: the column kept its name through the
    // rebrand on purpose (CLAUDE.md), because it is what real payouts compute
    // from and it gets renamed after backups exist, not before.
    greenBalance: balance,
    allocationCost: crateCostGreen(getOsrUsdPrice().usdPerGreen),
    // The CHEAPEST level-up on the floor. The step only asks for one desk to
    // reach level 2, so quoting the dearest would park it while an affordable
    // upgrade was sitting right there. No desks yet means nothing to pay for,
    // and the step is unreachable for other reasons anyway.
    deskUpgradeCost: upgrades.length ? Math.min(...upgrades) : 0,
    noteMinimum: STAKE_MIN_GREEN,
    // Excludes the player's own listings. Buying from yourself is not a trade,
    // and a market containing nothing but your own shelf should read as empty.
    affordableListings: openListings().filter(
      (listing) => listing.seller !== wallet && listing.priceGreen <= balance
    ).length,
  };
}

/** The introduction chain, and the level it feeds. */
export async function GET(request: Request, context: { params: Promise<{ wallet: string }> }) {
  try {
    const { wallet: raw } = await context.params;
    const wallet = await requireAuthenticatedWallet(request, raw);
    return NextResponse.json({
      intro: introState(wallet, introContextFor(wallet)),
      progression: progressionOf(wallet),
    });
  } catch (e) {
    if (e instanceof GameError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[intro]', e);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
