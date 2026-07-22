import { handle, requireAuthenticatedWallet } from '@/lib/api-util';
import { stakePositions, stakeTerms } from '@/lib/stake';

export const dynamic = 'force-dynamic';

/**
 * An operator's capacity contracts, with the current rate card alongside.
 *
 * Authenticated: unlike a leaderboard rank or an equipment list, an open
 * position is a financial holding, and there is no reason for it to be readable
 * by anyone but its owner.
 */
export async function GET(request: Request, ctx: { params: Promise<{ wallet: string }> }) {
  return handle(async () => {
    const { wallet } = await ctx.params;
    const owner = await requireAuthenticatedWallet(request, wallet);
    return { ...stakePositions(owner), rates: stakeTerms() };
  });
}
