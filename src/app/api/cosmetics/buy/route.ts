import { NextResponse } from 'next/server';
import { requireAuthenticatedWallet } from '@/lib/api-util';
import { handleSettlementRoute } from '@/lib/settle-route';
import { GameError } from '@/lib/game';
import { buyCosmetic, cosmeticDef, cosmeticsCatalog } from '@/lib/cosmetics';
import { SETTLEMENT_CONFIGURED } from '@/lib/settlement';

export const dynamic = 'force-dynamic';

/**
 * Buy a cosmetic, in Scrip, BNTY or ETH.
 *
 * The three currencies take different paths on purpose.
 *
 * A BNTY purchase is an ordinary spend and rides the same quote/pay/settle rail
 * as every other one, so once the token is live the player transfers real BNTY
 * and the server only grants the item against a mined receipt.
 *
 * SCRIP never touches that rail, and must not. Scrip is an off-chain balance the
 * protocol issues and destroys itself — there is no transfer to prove and no
 * receipt to wait for, so routing it through settlement would open a quote
 * against a token movement that is never going to happen. It settles inline, and
 * unlike ETH it is live now, because nothing about it depends on a deployed
 * contract.
 *
 * ETH has no rail yet — the settlement verifier proves an ERC-20 Transfer event,
 * and a native-value payment does not emit one. Rather than quietly granting
 * ETH-priced items for free once settlement is switched on, this refuses them
 * and says why. The catalogue advertises the same fact via `ethCheckout`, so the
 * shop hides the button instead of offering a purchase that fails after the
 * player has already decided to make it.
 */
export async function POST(request: Request) {
  const body = (await request.clone().json().catch(() => ({}))) as Record<string, unknown>;
  const currency =
    body.currency === 'ETH' ? 'ETH' : body.currency === 'SCRIP' ? 'SCRIP' : 'BNTY';

  if (currency === 'ETH' || currency === 'SCRIP') {
    try {
      const wallet = await requireAuthenticatedWallet(request, body.wallet);
      if (typeof body.key !== 'string') throw new GameError('cosmetic key is required', 400);
      if (currency === 'ETH' && SETTLEMENT_CONFIGURED) {
        throw new GameError('ETH checkout is not live yet — this item can be bought with BNTY', 501);
      }
      // buyCosmetic resolves the price, and priceOf throws for a piece with no
      // Scrip price — so a client posting SCRIP against a paid-only item is
      // refused there rather than needing a second copy of that rule here.
      const result = buyCosmetic(wallet, body.key, currency);
      return NextResponse.json({
        settled: true,
        result: { ...result, catalog: cosmeticsCatalog(wallet) },
      });
    } catch (e) {
      if (e instanceof GameError) return NextResponse.json({ error: e.message }, { status: e.status });
      console.error('[cosmetics/buy]', e);
      return NextResponse.json({ error: 'internal error' }, { status: 500 });
    }
  }

  return handleSettlementRoute<{ key: string }>(request, {
    action: 'BuyCosmetic',
    parse: (parsed) => {
      if (typeof parsed.key !== 'string') throw new GameError('cosmetic key is required', 400);
      // Resolving the definition here means an unknown key is rejected before a
      // quote is opened, not after the player has paid against it.
      return { key: cosmeticDef(parsed.key).key };
    },
    encode: (p) => p.key,
    decode: (detail) => ({ key: detail }),
    // The fee split is applied by the engine when the purchase lands, not here:
    // buyCosmetic is the single place that decides where a cosmetic's 2% goes,
    // and duplicating that policy at the quote would let the two drift.
    price: (_wallet, p) => ({ bntyAmount: cosmeticDef(p.key).bnty }),
    apply: (wallet, p, opts) => ({
      ...buyCosmetic(wallet, p.key, 'BNTY', opts),
      catalog: cosmeticsCatalog(wallet),
    }),
  });
}
