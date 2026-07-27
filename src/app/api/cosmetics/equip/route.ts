import { handle, requireAuthenticatedWallet } from '@/lib/api-util';
import { GameError } from '@/lib/game';
import { cosmeticsCatalog, equipCosmetic, unequipCosmetic, type CosmeticSlot } from '@/lib/cosmetics';

export const dynamic = 'force-dynamic';

const SLOTS: CosmeticSlot[] = ['avatar', 'desk', 'plinth'];

/**
 * Wear or remove a cosmetic the wallet already owns.
 *
 * Free, so there is nothing to settle — but still authenticated, because what a
 * wallet is wearing is broadcast to everyone on the Trading Floor and dressing
 * someone else's avatar is not a change they asked for.
 *
 * Both directions live on one route: sending `key` wears it, sending `slot`
 * alone clears that slot. The catalogue comes back either way so the shop can
 * repaint from server state instead of guessing what changed.
 */
export async function POST(request: Request) {
  return handle(async () => {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const wallet = await requireAuthenticatedWallet(request, body.wallet);

    if (typeof body.key === 'string') {
      const result = equipCosmetic(wallet, body.key);
      return { ...result, catalog: cosmeticsCatalog(wallet) };
    }
    if (typeof body.slot === 'string' && SLOTS.includes(body.slot as CosmeticSlot)) {
      const result = unequipCosmetic(wallet, body.slot as CosmeticSlot);
      return { ...result, catalog: cosmeticsCatalog(wallet) };
    }
    throw new GameError('either a cosmetic key to wear, or a slot to clear, is required', 400);
  });
}
