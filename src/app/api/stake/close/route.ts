import { NextResponse } from 'next/server';
import { requireAuthenticatedWallet } from '@/lib/api-util';
import { GameError } from '@/lib/game';
import { SETTLEMENT_CONFIGURED, payoutOsr, recordPayout } from '@/lib/settlement';
import { closeStake, stakePositions } from '@/lib/stake';
import { requireNoActiveDeploy } from '@/lib/deploy-guard';

export const dynamic = 'force-dynamic';

/**
 * Close a capacity contract, at maturity or early.
 *
 * Closing runs the opposite way to opening: the protocol pays the operator, so
 * there is nothing for them to send and no two-phase quote. It mirrors the
 * reward claim exactly, including the ordering — the position is consumed
 * before the transfer is attempted. The reverse would let a failed write leave
 * a matured contract open and claimable a second time, which is the direction
 * that drains the reserve. A failed transfer after a successful close is
 * recoverable: the amount is recorded as owed.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const wallet = await requireAuthenticatedWallet(request, body.wallet);
    // Closing pays principal + interest out of the treasury — a start, not a
    // completion, so hold it until the deploy window clears.
    requireNoActiveDeploy();

    const stakeId = Number(body.stakeId);
    if (!Number.isInteger(stakeId) || stakeId <= 0) {
      throw new GameError('stakeId is required', 400);
    }

    // Pre-token: the payout lands in the mirrored balance and nothing moves
    // on-chain, so closing is a single atomic step.
    if (!SETTLEMENT_CONFIGURED) {
      const result = closeStake(wallet, stakeId);
      return NextResponse.json({ settled: true, result, ...stakePositions(wallet) });
    }

    const result = closeStake(wallet, stakeId, { settledOnChain: true });

    let payout: Awaited<ReturnType<typeof payoutOsr>>;
    try {
      payout = await payoutOsr(wallet, result.payout);
    } catch (payoutError) {
      // Every failure past closeStake owes the operator: the contract is already
      // closed and the principal already left their position. That includes the
      // 400 payoutOsr raises when gas has grown to swallow the payout, which
      // used to rethrow untouched and leave no record of the debt at all.
      recordPayout(wallet, result.payout, null, { stakeId, error: String(payoutError), result });
      console.error('[stake/close] payout failed after the contract was closed', payoutError);
      throw new GameError(
        `The contract closed but the transfer did not go through. ${Math.round(result.payout).toLocaleString()} GPU is recorded as owed to you.`,
        502
      );
    }

    recordPayout(wallet, payout.sentOsr, payout.hash, { stakeId, ...result });
    return NextResponse.json({
      settled: true,
      result,
      txHash: payout.hash,
      net: payout.sentOsr,
      gasOsr: payout.gasOsr,
      ...stakePositions(wallet),
    });
  } catch (e) {
    if (e instanceof GameError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error('[stake/close]', e);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
