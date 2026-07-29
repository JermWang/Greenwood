import { handleSettlementRoute, requireString } from '@/lib/settle-route';
import { GameError, mintNode } from '@/lib/game';
import { NODE_FAMILIES } from '@/lib/economy';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return handleSettlementRoute<{ familyKey: string }>(request, {
    action: 'MintNode',
    parse: (body) => {
      const familyKey = requireString(body.familyKey, 'familyKey');
      if (!NODE_FAMILIES.some((f) => f.key === familyKey)) {
        throw new GameError(`Unknown node family: ${familyKey}`);
      }
      return { familyKey };
    },
    encode: (p) => p.familyKey,
    decode: (detail) => ({ familyKey: detail }),
    price: (_wallet, p) => {
      const fam = NODE_FAMILIES.find((f) => f.key === p.familyKey)!;
      return {
        bntyAmount: fam.burnCostBnty,
        burnBps: fam.burnShareBps,
        treasuryBps: fam.treasuryShareBps,
        feeEth: fam.mintFeeEth,
      };
    },
    apply: (wallet, p, opts) => mintNode(wallet, p.familyKey, opts),
  });
}
