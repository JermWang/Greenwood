import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { payoutBnty, recordPayout, SETTLEMENT_CONFIGURED } from '@/lib/settlement';
import { requirePayoutsEnabled } from '@/lib/solvency';

export const dynamic = 'force-dynamic';

/**
 * Debts, and a way to actually pay them.
 *
 * The claim route consumes an operator's accrual before it attempts the
 * transfer, which is the safe ordering — the alternative lets the same rewards
 * be claimed twice. The cost is that a failed transfer leaves the operator
 * already debited, and the route records a settlements row with status 'owed'
 * to say so.
 *
 * Nothing could pay those rows. The debt was recorded faithfully and then sat
 * there, which is a liability with no interface: the only way to discharge it
 * was to hand-write SQL and a transfer, under exactly the time pressure that
 * makes people hand-write the wrong one. This is that interface.
 *
 * Confirmed reachable in testing, not theoretical: a spend that could not apply
 * after payment produced one of these rows.
 */
function authorised(request: Request): NextResponse | null {
  const secret = (process.env.OSR_ADMIN_TOKEN ?? '').trim();
  if (!secret) return NextResponse.json({ error: 'OSR_ADMIN_TOKEN is not configured' }, { status: 503 });
  if ((request.headers.get('authorization') ?? '') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return null;
}

interface OwedRow {
  nonce: string;
  wallet: string;
  osr_amount: string;
  created_at: number;
  applied_result: string | null;
}

function owedRows(): OwedRow[] {
  return getDb()
    .prepare(
      `SELECT nonce, wallet, osr_amount, created_at, applied_result
         FROM settlements
        WHERE action = 'Claim' AND status = 'owed'
        ORDER BY created_at`
    )
    .all() as unknown as OwedRow[];
}

/** Everything the protocol failed to send, oldest first. */
export async function GET(request: Request) {
  const denied = authorised(request);
  if (denied) return denied;

  const rows = owedRows();
  return NextResponse.json({
    count: rows.length,
    totalBnty: rows.reduce((sum, r) => sum + Number(r.osr_amount), 0),
    owed: rows.map((r) => ({
      nonce: r.nonce,
      wallet: r.wallet,
      bnty: Number(r.osr_amount),
      recordedAt: r.created_at,
      /** Why it failed, as captured at the time. */
      note: r.applied_result,
    })),
  });
}

/**
 * Retry one debt, by nonce.
 *
 * ONE, named explicitly, rather than a "pay everything" button. A bulk retry
 * against a treasury that is short pays whoever sorts first and leaves the rest
 * failed a second time, and the operator running it cannot see that happening.
 * Naming the row makes the decision deliberate and the blast radius one person.
 *
 * The row is marked settled only after the transfer returns a hash. If the
 * transfer throws, the debt is left exactly as it was and remains payable —
 * marking first would erase the only record that the money is owed, which is
 * the precise failure this endpoint exists to clean up.
 */
export async function POST(request: Request) {
  const denied = authorised(request);
  if (denied) return denied;

  if (!SETTLEMENT_CONFIGURED) {
    return NextResponse.json({ error: 'settlement is not configured; there is nothing to pay with' }, { status: 503 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const nonce = typeof body.nonce === 'string' ? body.nonce : null;
  if (!nonce) return NextResponse.json({ error: 'nonce is required' }, { status: 400 });

  try {
    // A paused protocol must not be worked around by the admin route. If
    // payouts are stopped because the treasury is short, this is exactly the
    // spend that should not happen.
    requirePayoutsEnabled();
  } catch (error) {
    return NextResponse.json({ error: String((error as Error).message) }, { status: 503 });
  }

  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM settlements WHERE nonce = ? AND action = 'Claim' AND status = 'owed'`)
    .get(nonce) as unknown as OwedRow | undefined;
  if (!row) return NextResponse.json({ error: 'no unpaid debt with that nonce' }, { status: 404 });

  const amount = Number(row.osr_amount);
  if (!(amount > 0)) return NextResponse.json({ error: 'debt has no payable amount' }, { status: 409 });

  // Claim the row first with a conditional write, so two concurrent retries of
  // the same nonce cannot both send. The guard is `status = 'owed'`: whichever
  // request flips it to 'paying' wins, and the loser sees zero changes.
  const claimed = db
    .prepare(`UPDATE settlements SET status = 'paying' WHERE nonce = ? AND status = 'owed'`)
    .run(nonce);
  if (Number(claimed.changes ?? 0) === 0) {
    return NextResponse.json({ error: 'that debt is already being paid' }, { status: 409 });
  }

  try {
    const payout = await payoutBnty(row.wallet, amount);
    db.prepare(`UPDATE settlements SET status = 'settled', tx_hash = ?, settled_at = ? WHERE nonce = ?`).run(
      payout.hash,
      Date.now(),
      nonce
    );
    return NextResponse.json({ ok: true, wallet: row.wallet, sent: payout.sentBnty, txHash: payout.hash });
  } catch (error) {
    // Put it back, and annotate it in place.
    //
    // Deliberately NOT recordPayout: that INSERTS, so a failed retry would add
    // a second row for the same debt and solvency() would count the liability
    // twice. Every retry would inflate what the protocol appears to owe, which
    // is the opposite of what an endpoint for reconciling debts should do.
    db.prepare(`UPDATE settlements SET status = 'owed', applied_result = ? WHERE nonce = ?`).run(
      JSON.stringify({ previous: row.applied_result, retryError: String(error), retriedAt: Date.now() }),
      nonce
    );
    console.error('[admin/owed] retry failed', error);
    return NextResponse.json({ error: String(error) }, { status: 502 });
  }
}
