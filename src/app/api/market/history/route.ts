import { NextResponse } from 'next/server';
import { requireAuthenticatedWallet } from '@/lib/api-util';
import { GameError } from '@/lib/game';
import { tradeHistory } from '@/lib/market';
import { displayNamesFor } from '@/lib/profiles';

export const dynamic = 'force-dynamic';

/**
 * What this wallet has bought and sold.
 *
 * AUTHENTICATED, unlike the listings board next door, and the difference is the
 * point: what is for sale is public, who traded with whom is not. Anyone can
 * read the book; only you can read your own receipts.
 */
export async function GET(request: Request) {
  try {
    const wallet = await requireAuthenticatedWallet(
      request,
      new URL(request.url).searchParams.get('wallet'),
      'market'
    );
    const trades = tradeHistory(wallet);
    // The other party as a person where they have a name — same join, same
    // fallback to a shortened address, as the board.
    const names = await displayNamesFor(trades.map((t) => t.counterparty).filter(Boolean));
    return NextResponse.json({
      trades: trades.map((trade) => ({
        ...trade,
        counterpartyName: names[trade.counterparty.toLowerCase()] ?? null,
      })),
    });
  } catch (e) {
    if (e instanceof GameError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[market/history]', e);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
