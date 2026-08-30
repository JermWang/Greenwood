import { handleSettlementRoute } from '@/lib/settle-route';
import { GameError, compoundInfo, upgradeCompound } from '@/lib/game';
import { EXPEDITE_FEE_ETH, SPLIT_BURN_BPS, SPLIT_RESERVE_BPS } from '@/lib/economy';

export const dynamic = 'force-dynamic';

const TREASURY_BPS = 10_000 - SPLIT_BURN_BPS - SPLIT_RESERVE_BPS;

/**
 * Expedite performs the compound upgrade and skips the cooldown, so it is priced
 * exactly like the upgrade action it carries out, with the expedite fee added to
 * the ETH leg.
 *
 * It used to quote zero GREEN, on the stated reasoning that the upgrade had
 * "already been settled by the upgrade action". Nothing had: upgradeCompound is
 * the level increment, and this route is the only thing that calls it with the
 * cooldown skipped. Quoting zero meant settleSpend compared the paid amount
 * against an owed of zero, which any transfer satisfies — nine zero-value
 * transfers took an operator L1 to L10 for gas, skipping 231,000 GREEN of the
 * economy's largest sink and booking burns that never happened.
 */
export async function POST(request: Request) {
  return handleSettlementRoute<{ targetLevel: number }>(request, {
    action: 'ExpediteCompound',
    parse: (_body, wallet) => {
      const next = compoundInfo(wallet).nextUpgradeCost;
      if (!next) throw new GameError('already at max compound level');
      return { targetLevel: next.targetLevel };
    },
    encode: (p) => `L${p.targetLevel}`,
    decode: (detail) => ({ targetLevel: Number(detail.replace('L', '')) }),
    price: (wallet, p) => {
      const next = compoundInfo(wallet).nextUpgradeCost;
      if (!next) throw new GameError('already at max compound level');
      if (next.targetLevel !== p.targetLevel) {
        throw new GameError('compound level changed — request a fresh quote', 409);
      }
      return {
        greenAmount: next.totalGreen,
        burnBps: SPLIT_BURN_BPS,
        treasuryBps: TREASURY_BPS,
        feeEth: next.feeEth + EXPEDITE_FEE_ETH,
      };
    },
    apply: (wallet, p, opts) => upgradeCompound(wallet, true, opts, p.targetLevel),
  });
}
