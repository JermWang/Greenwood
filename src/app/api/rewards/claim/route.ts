import { NextResponse } from 'next/server';
import { requireAuthenticatedWallet } from '@/lib/api-util';
import { GameError, claimRewards, settleUser } from '@/lib/game';
import {
  settlesOnChain,
  estimatePayoutGasBnty,
  payoutBnty,
  recordPayout,
} from '@/lib/settlement';
import { CLAIM_FEE_BPS, COMPOUND_REINVEST_FEE_BPS } from '@/lib/economy';
import { requireNoActiveDeploy } from '@/lib/deploy-guard';
import { maybeSnapshot } from '@/lib/backup';
import { requirePayoutsEnabled } from '@/lib/solvency';

export const dynamic = 'force-dynamic';

/**
 * Claiming runs the opposite way to the priced actions: the protocol pays the
 * operator, so there is nothing for them to send and no two-phase quote. The
 * server settles the accrual and transfers BNTY from the protocol wallet.
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
    const wallet = await requireAuthenticatedWallet(request, body.wallet, 'claim');
    // A claim consumes accrual and pays out in one call, so a cutover mid-claim
    // is exactly the loss the deploy window exists to prevent.
    requireNoActiveDeploy();
    // The emergency brake. Checked BEFORE the accrual is touched, so a paused
    // protocol costs a player nothing — their rewards keep accruing and the
    // claim can be made later, rather than being consumed into a payout that
    // was never going to send.
    requirePayoutsEnabled();

    const mode = body.mode === 'compound' ? 'compound' : 'claim';
    const nodeId = body.nodeId == null ? undefined : Number(body.nodeId);
    if (nodeId != null && !Number.isInteger(nodeId)) {
      throw new GameError('nodeId must be an integer');
    }

    // Pre-token: rewards credit the mirrored balance, nothing moves on-chain.
    if (!settlesOnChain(wallet)) {
      return NextResponse.json({ settled: true, result: claimRewards(wallet, nodeId, mode) });
    }

    // Work out what is owed before consuming it, so we know how much to send.
    const { nodes } = settleUser(wallet);
    const eligible = nodes
      .filter((n) => (nodeId == null ? true : n.row.id === nodeId))
      .filter((n) => (mode === 'compound' ? n.row.family === 'mine' : true));
    const gross = eligible.reduce((sum, n) => sum + n.pendingBnty, 0);
    if (gross <= 0) {
      throw new GameError(
        mode === 'compound' ? 'nothing to compound in this vault yet' : 'nothing to claim yet'
      );
    }
    const feeBps = mode === 'compound' ? COMPOUND_REINVEST_FEE_BPS : CLAIM_FEE_BPS;
    const estimatedNet = gross - (gross * feeBps) / 10_000;

    // Check the claim can cover its own gas BEFORE consuming the accrual —
    // rejecting afterwards would burn the operator's rewards for a payout that
    // never went out, and there is no way to hand them back.
    const gasBnty = await estimatePayoutGasBnty(wallet, estimatedNet);
    if (estimatedNet - gasBnty <= 0) {
      throw new GameError(
        'this claim is too small to cover its own network fee — let more rewards accrue first',
        400
      );
    }

    // Consume the accrual first (see note above), then pay.
    const result = claimRewards(wallet, nodeId, mode, { settledOnChain: true });

    // Pay what was actually consumed, never the figure read before the await
    // above. The two diverge whenever a second claim lands in between: that one
    // zeroes the accrual, this one consumes nothing and comes back with no
    // claims, and paying the stale figure would send the same rewards out of the
    // treasury a second time. Firing N concurrent claims paid N times over.
    //
    // 'claim' mode was accidentally shielded by its one-hour cooldown, which is
    // checked inside claimRewards. 'compound' has no such cooldown, so this was
    // the only thing standing between it and a repeatable drain.
    const payable = result.claims.reduce((sum, claim) => sum + claim.net, 0);
    if (payable <= 0) {
      throw new GameError('those rewards have already been claimed', 409);
    }

    let payout: Awaited<ReturnType<typeof payoutBnty>>;
    try {
      payout = await payoutBnty(wallet, payable);
    } catch (payoutError) {
      // Every failure from here owes the operator, because the accrual is
      // already gone. That includes the 400 payoutBnty raises when gas has risen
      // enough to swallow the payout between the estimate above and the send:
      // this used to rethrow it untouched, consuming the rewards and leaving no
      // record that anything was owed.
      recordPayout(wallet, payable, null, { error: String(payoutError), result });
      console.error('[claim] payout failed after accrual was consumed', payoutError);
      throw new GameError(
        `Rewards were settled but the transfer did not go through. ${Math.round(payable).toLocaleString()} BNTY is recorded as owed to you.`,
        502
      );
    }

    // Record what actually left the treasury, not what was owed before gas.
    recordPayout(wallet, payout.sentBnty, payout.hash, result);
    // Real tokens just left the treasury and the accrual that backed them is
    // gone from the ledger. Snapshots hang off activity like this because there
    // is no cron here and a timer in a lib is a different timer per route
    // bundle. Never throws — a failed backup must not fail a paid-out claim.
    maybeSnapshot();
    return NextResponse.json({
      settled: true,
      result,
      txHash: payout.hash,
      // Report the claim that actually happened, not the pre-consume read.
      gross: result.claims.reduce((sum, claim) => sum + claim.gross, 0),
      net: payout.sentBnty,
      gasBnty: payout.gasBnty,
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
