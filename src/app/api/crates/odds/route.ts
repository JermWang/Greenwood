import type { NextRequest } from 'next/server';
import { handle, requireWallet } from '@/lib/api-util';
import { crateOdds, readUser } from '@/lib/game';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get('wallet');
  // requireWallet both rejects non-addresses and lower-cases. Without it the raw
  // query string went straight into a primary key: `?wallet=a` created a row
  // keyed to "a", and `?wallet=0xAB…` created one that no other code path — all
  // of which lower-case — would ever read again.
  return handle(() => crateOdds(wallet ? readUser(requireWallet(wallet)) : null));
}
