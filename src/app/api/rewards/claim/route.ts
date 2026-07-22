import { NextResponse } from 'next/server';
import { requireAuthenticatedWallet } from '@/lib/api-util';
import { GameError, claimRewards, settleUser } from '@/lib/game';
import {
  SETTLEMENT_CONFIGURED,
  estimatePayoutGasOsr,
  payoutOsr,
  recordPayout,
} from '@/lib/settlement';
import { CLAIM_FEE_BPS, COMPOUND_REINVEST_FEE_BPS } from '@/lib/economy';

export const dynamic = 'force-dynamic';

/**
 * Claiming runs the opposite way to the priced actions: the protocol pays the
 * operator, so there is nothing for them to send and no two-phase quote. The
 * server settles the accrual and transfers GPU from the protocol wallet.
 *
 * Order matters. The accrual is consumed BEFORE the transfer is sent: if it
 * were sent first and the state write then failed, the same rewards could be
 * claimed again and drain the reserve. A failed transfer after a successful
 * write is the safer direction — the amount owed is recorded so it can be
 * retried, rather than silently lost.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const wallet = await requireAuthenticatedWallet(request, body.wallet);

    const mode = body.mode === 'compound' ? 'compound' : 'claim';
    const nodeId = body.nodeId == null ? undefined : Number(body.nodeId);
    if (nodeId != null && !Number.isInteger(nodeId)) {
      throw new GameError('nodeId must be an integer');
    }

    // Pre-token: rewards credit the mirrored balance, nothing moves on-chain.
    if (!SETTLEMENT_CONFIGURED) {
      return NextResponse.json({ settled: true, result: claimRewards(wallet, nodeId, mode) });
    }

    // Work out what is owed before consuming it, so we know how much to send.
    const { nodes } = settleUser(wallet);
    const eligible = nodes
      .filter((n) => (nodeId == null ? true : n.row.id === nodeId))
      .filter((n) => (mode === 'compound' ? n.row.family === 'mine' : true));
    const gross = eligible.reduce((sum, n) => sum + n.pendingOsr, 0);
    if (gross <= 0) {
      throw new GameError(
        mode === 'compound' ? 'nothing to compound in this cleanroom yet' : 'nothing to claim yet'
      );
    }
    const feeBps = mode === 'compound' ? COMPOUND_REINVEST_FEE_BPS : CLAIM_FEE_BPS;
    const net = gross - (gross * feeBps) / 10_000;

    // Check the claim can cover its own gas BEFORE consuming the accrual —
    // rejecting afterwards would burn the operator's rewards for a payout that
    // never went out, and there is no way to hand them back.
    const gasOsr = await estimatePayoutGasOsr(wallet, net);
    if (net - gasOsr <= 0) {
      throw new GameError(
        'this claim is too small to cover its own network fee — let more rewards accrue first',
        400
      );
    }

    // Consume the accrual first (see note above), then pay.
    const result = claimRewards(wallet, nodeId, mode, { settledOnChain: true });

    let payout: Awaited<ReturnType<typeof payoutOsr>>;
    try {
      payout = await payoutOsr(wallet, net);
    } catch (payoutError) {
      if (payoutError instanceof GameError && payoutError.status === 400) throw payoutError;
      // The rewards are already spent server-side; record the debt rather than
      // dropping it, and tell the operator plainly instead of failing silently.
      recordPayout(wallet, net, null, { error: String(payoutError), result });
      console.error('[claim] payout failed after accrual was consumed', payoutError);
      throw new GameError(
        `Rewards were settled but the transfer did not go through. ${Math.round(net).toLocaleString()} GPU is recorded as owed to you.`,
        502
      );
    }

    // Record what actually left the treasury, not what was owed before gas.
    recordPayout(wallet, payout.sentOsr, payout.hash, result);
    return NextResponse.json({
      settled: true,
      result,
      txHash: payout.hash,
      gross,
      net: payout.sentOsr,
      gasOsr: payout.gasOsr,
      mode,
    });
  } catch (e) {
    if (e instanceof GameError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error('[claim]', e);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
