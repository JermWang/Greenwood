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
    // Best-effort, and deliberately not awaited into the response.
    //
    // touch_profile keeps the global leaderboard row warm. It is a Supabase RPC,
    // which means an external dependency was able to fail the dashboard's core
    // read — a rejected wallet or a Supabase outage returned a 500 for data that
    // had already been computed from local SQLite and was sitting right here.
    // The player lost their whole dashboard so that a leaderboard row could be
    // a few seconds stale.
    //
    // Logged rather than swallowed, so a persistently failing sync is still
    // visible in the server output instead of silently rotting.
    try {
      await touchGlobalProfile(normalizedWallet, operation);
    } catch (error) {
      console.error('[user/operation] profile sync failed, serving operation anyway', error);
    }
    return operation;
  });
}
