import { NextResponse } from 'next/server';
import { requireAuthenticatedWallet } from '@/lib/api-util';
import { GameError, getOrCreateUser } from '@/lib/game';
import { getDb } from '@/lib/db';
import { decodeDetail } from '@/lib/settle-route';
import { splitSale, transferSoldItem } from '@/lib/market';
import {
  SETTLEMENT_CONFIGURED,
  encodeDetail,
  payoutOsr,
  quoteSpend,
  recordPayout,
  settleSpend,
} from '@/lib/settlement';

export const dynamic = 'force-dynamic';

interface ListingRow {
  id: number;
  seller: string;
  price_osr: number;
  status: string;
}

/** Load a listing and check it is still buyable by this wallet. */
function requireOpenListing(listingId: number, wallet: string): ListingRow {
  const listing = getDb()
    .prepare(`SELECT id, seller, price_osr, status FROM listings WHERE id = ?`)
    .get(listingId) as ListingRow | undefined;
  if (!listing) throw new GameError('listing not found', 404);
  if (listing.status !== 'open') throw new GameError('that listing is no longer available', 409);
  if (listing.seller === wallet) throw new GameError('you cannot buy your own listing', 400);
  return listing;
}

/**
 * Buy a listed item.
 *
 * The buyer pays the full price to the protocol treasury, the item moves, and
 * the protocol forwards the seller their share less the marketplace fee. Paying
 * the treasury rather than the seller directly is what makes the payment
 * verifiable with the same receipt check every other action uses — a direct
 * buyer-to-seller transfer would have to be trusted from the client.
 *
 * Ordering mirrors claims: the item transfers first, then the seller is paid.
 * The reverse would let a failed transfer leave a seller paid for an item they
 * still own. A failed payout is recorded as owed rather than dropped.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const wallet = await requireAuthenticatedWallet(request, body.wallet);

    const nonce = typeof body.nonce === 'string' ? body.nonce : null;
    const txHash = typeof body.txHash === 'string' ? body.txHash : null;

    // Phase 2 — the buyer's payment is on-chain; verify it, move the item, pay out.
    //
    // Which listing is being bought comes out of the stored settlement row, never
    // out of the request body. The body is attacker-controlled, and the payment
    // check only proves the *quoted* amount arrived: a buyer who quoted a cheap
    // listing, paid for it, then settled with an expensive listing's id would get
    // the expensive item and have the treasury pay its seller the difference.
    if (SETTLEMENT_CONFIGURED && nonce && txHash) {
      let paid: { listing: ListingRow; fee: number; toSeller: number } | null = null;
      const sold = await settleSpend(wallet, 'MarketBuy', nonce, txHash, (row) => {
        const quotedId = Number(decodeDetail(row.detail));
        if (!Number.isInteger(quotedId) || quotedId <= 0) {
          throw new GameError('that settlement is not a marketplace purchase', 400);
        }
        const listing = requireOpenListing(quotedId, wallet);
        paid = { listing, ...splitSale(listing.price_osr) };
        return transferSoldItem(quotedId, wallet);
      });

      // settleSpend replays a finished settlement without re-running apply, so
      // the item already moved and the seller was already paid on the first call.
      if (!paid) {
        return NextResponse.json({ settled: true, result: { listing: sold, replayed: true } });
      }
      const { listing, fee, toSeller } = paid as { listing: ListingRow; fee: number; toSeller: number };

      let payoutHash: string | null = null;
      try {
        const payout = await payoutOsr(listing.seller, toSeller);
        payoutHash = payout.hash;
        recordPayout(listing.seller, payout.sentOsr, payout.hash, { listingId: listing.id });
      } catch (payoutError) {
        // Null, not a placeholder string: the unique index on tx_hash is
        // partial, so a literal would insert once then collide on every later
        // failed payout — precisely when the debt most needs recording.
        recordPayout(listing.seller, toSeller, null, {
          listingId: listing.id,
          error: String(payoutError),
        });
        console.error('[market/buy] seller payout failed after item transferred', payoutError);
      }
      return NextResponse.json({
        settled: true,
        result: {
          listing: sold,
          fee,
          toSeller,
          payoutHash,
          // Surfaced so the buyer is not told the sale is clean when the
          // seller has not actually been paid yet.
          sellerPaid: payoutHash != null,
        },
      });
    }

    const listingId = Number(body.listingId);
    if (!Number.isInteger(listingId) || listingId <= 0) {
      throw new GameError('listingId is required', 400);
    }
    const listing = requireOpenListing(listingId, wallet);
    const { fee, toSeller } = splitSale(listing.price_osr);

    // Pre-token: no chain to settle against, so the mirrored balances move.
    if (!SETTLEMENT_CONFIGURED) {
      const db = getDb();
      const buyer = getOrCreateUser(wallet);
      if (buyer.osr_balance < listing.price_osr) {
        throw new GameError(
          `Not enough GPU: need ${listing.price_osr.toLocaleString()} (you have ${Math.floor(buyer.osr_balance).toLocaleString()}).`,
          400
        );
      }
      getOrCreateUser(listing.seller);
      const sold = transferSoldItem(listingId, wallet);
      db.prepare('UPDATE users SET osr_balance = osr_balance - ? WHERE wallet = ?').run(
        listing.price_osr,
        wallet
      );
      db.prepare('UPDATE users SET osr_balance = osr_balance + ? WHERE wallet = ?').run(
        toSeller,
        listing.seller
      );
      return NextResponse.json({ settled: true, result: { listing: sold, paid: listing.price_osr, fee } });
    }

    if (nonce || txHash) throw new GameError('both nonce and txHash are required to settle', 400);

    // Phase 1 — quote the purchase. The whole price goes to the treasury; none
    // of it is burned, since this is a transfer between players rather than a
    // protocol sink.
    const payment = await quoteSpend(wallet, {
      action: 'MarketBuy',
      detail: encodeDetail(String(listingId)),
      osrAmount: listing.price_osr,
    });
    return NextResponse.json({ settled: false, payment, fee, toSeller });
  } catch (e) {
    if (e instanceof GameError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[market/buy]', e);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
