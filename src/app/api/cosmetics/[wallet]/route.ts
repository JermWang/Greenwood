import { handle, requireWallet } from '@/lib/api-util';
import { cosmeticsCatalog } from '@/lib/cosmetics';

export const dynamic = 'force-dynamic';

/**
 * The cosmetics catalogue as one wallet sees it, with owned/equipped resolved.
 *
 * A pure read, so it is public like the other read routes — and like the quests
 * route it cannot bring a wallet into existence: cosmeticsCatalog only selects.
 * An address that has never bought anything gets the whole catalogue back with
 * every entry unowned, rather than an error.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ wallet: string }> }) {
  return handle(async () => {
    const { wallet } = await params;
    return cosmeticsCatalog(requireWallet(wallet));
  });
}
