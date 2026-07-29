import { handleSettlementRoute, requireNodeId } from '@/lib/settle-route';
import { GameError, nodeUpgradeCost, upgradeNode, userOperation } from '@/lib/game';
import { SPLIT_BURN_BPS, SPLIT_RESERVE_BPS } from '@/lib/economy';

export const dynamic = 'force-dynamic';

/** Treasury takes whatever the burn and reserve shares leave behind. */
const TREASURY_BPS = 10_000 - SPLIT_BURN_BPS - SPLIT_RESERVE_BPS;

export async function POST(request: Request) {
  // The level the quote was priced at rides along in the detail, so the settle
  // phase can refuse a quote that no longer matches the node it was priced for.
  return handleSettlementRoute<{ nodeId: number; fromLevel: number }>(request, {
    action: 'UpgradeNode',
    parse: (body, wallet) => {
      const nodeId = requireNodeId(body.nodeId);
      const node = userOperation(wallet).nodes.find((n) => Number(n.id) === nodeId);
      if (!node) throw new GameError('node not found', 404);
      return { nodeId, fromLevel: node.level };
    },
    encode: (p) => `${p.nodeId}@${p.fromLevel}`,
    decode: (detail) => {
      const [nodeId, fromLevel] = detail.split('@');
      return { nodeId: Number(nodeId), fromLevel: Number(fromLevel) };
    },
    price: (wallet, p) => {
      const node = userOperation(wallet).nodes.find((n) => Number(n.id) === p.nodeId);
      if (!node) throw new GameError('node not found', 404);
      if (node.level !== p.fromLevel) {
        throw new GameError('node level changed — request a fresh quote', 409);
      }
      return {
        bntyAmount: nodeUpgradeCost(node.level),
        burnBps: SPLIT_BURN_BPS,
        treasuryBps: TREASURY_BPS,
        feeEth: 0,
      };
    },
    apply: (wallet, p, opts) => upgradeNode(wallet, p.nodeId, opts, p.fromLevel),
  });
}
