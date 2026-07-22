import { handleSettlementRoute } from '@/lib/settle-route';
import { upgradeCompound } from '@/lib/game';
import { EXPEDITE_FEE_ETH } from '@/lib/economy';

export const dynamic = 'force-dynamic';

/**
 * Expedite skips the compound cooldown. It costs ETH only — the GPU for the
 * upgrade itself was already settled by the upgrade action.
 */
export async function POST(request: Request) {
  return handleSettlementRoute<Record<string, never>>(request, {
    action: 'ExpediteCompound',
    parse: () => ({}) as Record<string, never>,
    encode: () => 'expedite',
    decode: () => ({}) as Record<string, never>,
    price: () => ({
      osrAmount: 0,
      burnBps: 0,
      treasuryBps: 0,
      feeEth: EXPEDITE_FEE_ETH,
    }),
    apply: (wallet, _p, opts) => upgradeCompound(wallet, true, opts),
  });
}
