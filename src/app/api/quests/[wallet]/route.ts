import { handle, requireWallet } from '@/lib/api-util';
import { dailyQuests } from '@/lib/quests';
import { progressionOf } from '@/lib/progression';

export const dynamic = 'force-dynamic';

/**
 * Today's quests and the wallet's XP tracks.
 *
 * A pure read, so it is public like the other read routes — and unlike them it
 * cannot bring a wallet into existence: both helpers only select. Quests are
 * derived from (wallet, day) rather than stored, so an address that has never
 * played still gets a valid, empty-progress set rather than an error.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ wallet: string }> }) {
  return handle(async () => {
    const { wallet } = await params;
    const owner = requireWallet(wallet);
    return { ...dailyQuests(owner), progression: progressionOf(owner) };
  });
}
