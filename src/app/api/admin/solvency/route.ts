import { NextResponse } from 'next/server';
import { solvency, setPayoutsPaused } from '@/lib/solvency';
import { onchainReserves } from '@/lib/onchain';
import { BNTY_TOKEN_ADDRESS, isConfiguredAddress } from '@/lib/config';
import { SETTLEMENT_CONFIGURED } from '@/lib/settlement';

export const dynamic = 'force-dynamic';

function authorised(request: Request): NextResponse | null {
  const secret = (process.env.OSR_ADMIN_TOKEN ?? '').trim();
  if (!secret) return NextResponse.json({ error: 'OSR_ADMIN_TOKEN is not configured' }, { status: 503 });
  if ((request.headers.get('authorization') ?? '') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return null;
}

/**
 * The treasury's BNTY balance, read live off the chain.
 *
 * Null when the token is not configured, which is honest rather than
 * convenient: pre-launch there is no treasury to read, and reporting 0 would
 * make a perfectly healthy pre-token install look catastrophically insolvent.
 */
async function readTreasury(): Promise<number | null> {
  if (!isConfiguredAddress(BNTY_TOKEN_ADDRESS)) return null;
  const holders = await onchainReserves();
  // onchainReserves reports ETH alongside the token; only the BNTY figure
  // is a liability cover. Gas is a separate concern -- see the note there.
  const treasury = holders.find((h) => h.walletLabel === 'Treasury');
  return treasury ? treasury.balanceUi : null;
}

/**
 * What is promised versus what is held.
 *
 * The number to watch is `surplus`. Negative means the ledger has promised more
 * BNTY than the treasury holds, and every claim from that point is drawing down
 * a reserve that cannot cover the rest — the earlier that is noticed, the more
 * of it is recoverable.
 */
export async function GET(request: Request) {
  const denied = authorised(request);
  if (denied) return denied;
  return NextResponse.json(await solvency(readTreasury, SETTLEMENT_CONFIGURED));
}

/**
 * Stop or resume payouts.
 *
 * Deliberately separate from the reset endpoint's confirmation phrase ritual.
 * A wipe is unrecoverable and should be awkward; pausing is reversible and
 * wanted in a hurry, and making an emergency brake hard to pull is how it does
 * not get pulled.
 */
export async function POST(request: Request) {
  const denied = authorised(request);
  if (denied) return denied;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if (typeof body.paused !== 'boolean') {
    return NextResponse.json({ error: 'set "paused" to true or false' }, { status: 400 });
  }

  const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : undefined;
  setPayoutsPaused(body.paused, reason);

  // Loud, because this is one of the few actions with no in-app trace.
  console.warn(`[solvency] payouts ${body.paused ? 'PAUSED' : 'resumed'}${reason ? `: ${reason}` : ''}`);

  return NextResponse.json({ ok: true, paused: body.paused, reason: reason ?? null });
}
