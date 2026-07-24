import { handle, requireWallet } from '@/lib/api-util';
import { compoundInfo } from '@/lib/game';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ wallet: string }> }) {
  return handle(async () => {
    const { wallet } = await ctx.params;
    // create: false — this is an unauthenticated read of an arbitrary address.
    return compoundInfo(requireWallet(wallet), false);
  });
}
