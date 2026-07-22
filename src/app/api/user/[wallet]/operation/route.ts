import { handle, requireAuthenticatedWallet } from '@/lib/api-util';
import { userOperation } from '@/lib/game';
import { touchGlobalProfile } from '@/lib/profiles';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, ctx: { params: Promise<{ wallet: string }> }) {
  return handle(async () => {
    const { wallet } = await ctx.params;
    // requireAuthenticatedWallet rather than a `privyServerConfigured()` guard:
    // the conditional form fails open, so a deploy missing its Privy credentials
    // would serve every operator's private position to anyone who asked.
    const normalizedWallet = await requireAuthenticatedWallet(request, wallet);
    const operation = userOperation(normalizedWallet);
    await touchGlobalProfile(normalizedWallet, operation);
    return operation;
  });
}
