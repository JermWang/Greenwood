import { handleSettlementRoute } from '@/lib/settle-route';
import { GameError } from '@/lib/game';
import { STAKE_MIN_GREEN } from '@/lib/economy';
import { findTerm, openStake } from '@/lib/stake';

export const dynamic = 'force-dynamic';

interface Params {
  amount: number;
  termDays: number;
}

/**
 * Open a capacity contract.
 *
 * This is a spend — GREEN leaves the operator and sits with the protocol for the
 * term — so it runs through the same quote / pay / settle machinery as minting
 * and crates. That means the on-chain path verifies a real Transfer receipt
 * before a contract exists, and the pre-token path debits the mirrored balance
 * instead. Neither branch is written here; both come from the shared helper.
 */
export async function POST(request: Request) {
  return handleSettlementRoute<Params>(request, {
    action: 'StakeOpen',
    parse: (body) => {
      const amount = Math.floor(Number(body.amount));
      const termDays = Number(body.termDays);
      // Throws for an unknown term, so a crafted body cannot invent its own rate.
      findTerm(termDays);
      if (!Number.isFinite(amount) || amount < STAKE_MIN_GREEN) {
        throw new GameError(`minimum Note is ${STAKE_MIN_GREEN.toLocaleString()} GREEN`, 400);
      }
      return { amount, termDays };
    },
    // Both numbers, colon separated — comfortably inside the 32-byte detail
    // payload even at a billion GREEN, and it is what the settle phase reads the
    // contract back out of rather than trusting the request body.
    encode: (params) => `${params.termDays}:${params.amount}`,
    decode: (detail) => {
      const [days, amount] = detail.split(':');
      return { termDays: Number(days), amount: Number(amount) };
    },
    price: (_wallet, params) => ({ greenAmount: params.amount }),
    apply: (wallet, params, opts) => openStake(wallet, params.amount, params.termDays, opts),
  });
}
