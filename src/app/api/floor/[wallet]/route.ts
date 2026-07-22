import { handle, requireWallet } from '@/lib/api-util';
import { getLayout, layoutBonus, ownedMachines } from '@/lib/floor';

export const dynamic = 'force-dynamic';

/**
 * Read a wallet's fab floor.
 *
 * Public, like the leaderboard and inventory: a floor is a thing other
 * operators are meant to be able to look at. Nothing here is private — it is
 * the arrangement of equipment whose ownership is already public.
 *
 * `kinds` ships alongside so the client renders each machine as whatever the
 * server believes it is, rather than re-deriving it and risking a mismatch with
 * the bonus the server scored.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ wallet: string }> }) {
  return handle(async () => {
    const { wallet } = await ctx.params;
    const owner = requireWallet(wallet);
    return {
      layout: getLayout(owner),
      bonus: layoutBonus(owner),
      kinds: Object.fromEntries(ownedMachines(owner)),
    };
  });
}
