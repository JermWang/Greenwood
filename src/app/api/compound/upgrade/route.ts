import { handleSettlementRoute } from '@/lib/settle-route';
import { GameError, compoundInfo, upgradeCompound } from '@/lib/game';
import { SPLIT_BURN_BPS, SPLIT_RESERVE_BPS } from '@/lib/economy';

export const dynamic = 'force-dynamic';

const TREASURY_BPS = 10_000 - SPLIT_BURN_BPS - SPLIT_RESERVE_BPS;

export async function POST(request: Request) {
  return handleSettlementRoute<{ targetLevel: number }>(request, {
    action: 'UpgradeCompound',
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
      // Guard against the level moving between quote and settle.
      if (next.targetLevel !== p.targetLevel) {
        throw new GameError('compound level changed — request a fresh quote', 409);
      }
      return {
        greenAmount: next.totalGreen,
        burnBps: SPLIT_BURN_BPS,
        treasuryBps: TREASURY_BPS,
        feeEth: next.feeEth,
      };
    },
    apply: (wallet, p, opts) => upgradeCompound(wallet, false, opts, p.targetLevel),
  });
}
