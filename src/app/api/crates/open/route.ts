import { handleSettlementRoute } from '@/lib/settle-route';
import { GameError, openCrate } from '@/lib/game';
import { CRATE_FEE_ETH, SPLIT_BURN_BPS, SPLIT_RESERVE_BPS, crateCostBnty } from '@/lib/economy';
import { getOsrUsdPrice } from '@/lib/price';

export const dynamic = 'force-dynamic';

const TREASURY_BPS = 10_000 - SPLIT_BURN_BPS - SPLIT_RESERVE_BPS;

interface Params {
  crateId: number;
  targetNodeId: number | null;
}

export async function POST(request: Request) {
  return handleSettlementRoute<Params>(request, {
    action: 'OpenCrate',
    parse: (body) => {
      // A crate must be one the operator already mined — there is no crateType
      // to pick any more, because crates cannot be conjured by paying.
      const crateId = Number(body.crateId);
      if (!Number.isInteger(crateId) || crateId <= 0) {
        throw new GameError('crateId is required — open a crate you have mined');
      }
      const raw = body.targetNodeId;
      const targetNodeId = raw == null ? null : Number(raw);
      if (targetNodeId != null && !Number.isInteger(targetNodeId)) {
        throw new GameError('targetNodeId must be an integer');
      }
      return { crateId, targetNodeId };
    },
    // Fits inside the 32-byte detail payload: "1234:567890".
    encode: (p) => `${p.crateId}:${p.targetNodeId ?? 0}`,
    decode: (detail) => {
      const [crateId, id] = detail.split(':');
      const targetNodeId = Number(id);
      return {
        crateId: Number(crateId),
        targetNodeId: targetNodeId > 0 ? targetNodeId : null,
      };
    },
    price: () => ({
      bntyAmount: crateCostBnty(getOsrUsdPrice().usdPerBnty),
      burnBps: SPLIT_BURN_BPS,
      treasuryBps: TREASURY_BPS,
      feeEth: CRATE_FEE_ETH,
    }),
    apply: (wallet, p, opts) => openCrate(wallet, p.crateId, p.targetNodeId, opts),
  });
}
