import { NextResponse } from 'next/server';
import { openListings, recentSales, type ItemKind } from '@/lib/market';
import { MARKET_FEE_BPS } from '@/lib/economy';
import { displayNamesFor } from '@/lib/profiles';

export const dynamic = 'force-dynamic';

/** Public board — anyone can read what is for sale and what things sold for. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const kindParam = url.searchParams.get('kind');
  const kind =
    kindParam === 'crate' || kindParam === 'component' || kindParam === 'node'
      ? (kindParam as ItemKind)
      : undefined;

  const listings = openListings(kind);

  /*
   * WHO is selling, resolved here rather than in the browser.
   *
   * A listing's seller is an address; a player's name lives on a profile in the
   * registry. Those are two different stores, and the join has to happen
   * somewhere — doing it client-side means one profile fetch per row, which is
   * an N+1 that gets slower precisely as the market gets busier. One batched
   * query covers the whole board.
   *
   * A name is a nicety and the board is not: displayNamesFor swallows a
   * registry outage and returns {}, so every row falls back to the shortened
   * address and the market still opens.
   */
  const names = await displayNamesFor(listings.map((l) => l.seller));

  return NextResponse.json({
    listings: listings.map((listing) => ({
      ...listing,
      sellerName: names[listing.seller.toLowerCase()] ?? null,
    })),
    sales: recentSales(),
    feeBps: MARKET_FEE_BPS,
  });
}
