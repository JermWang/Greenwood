import { handleSettlementRoute } from '@/lib/settle-route';
import { GameError } from '@/lib/game';
import { cosmeticDef, cosmeticLevels, cosmeticsCatalog, upgradeCosmetic } from '@/lib/cosmetics';
import { COSMETIC_MAX_LEVEL, cosmeticUpgradeCost } from '@/lib/economy';

export const dynamic = 'force-dynamic';

/** The level this wallet's copy of `key` is sitting at, refusing what it cannot upgrade. */
function currentLevel(wallet: string, key: string): number {
  const levels = cosmeticLevels(wallet);
  if (!Object.prototype.hasOwnProperty.call(levels, key)) {
    throw new GameError('You do not own that cosmetic', 403);
  }
  const level = levels[key] ?? 0;
  if (level >= COSMETIC_MAX_LEVEL) throw new GameError('That cosmetic is already at the top of its track', 400);
  return level;
}

/**
 * Pay BNTY to take an owned cosmetic one step up its track.
 *
 * The level is carried in the settlement detail alongside the key, so a quote
 * opened at level 2 can only ever settle the step from 2 to 3. Without it, a
 * player could open a cheap quote at level 0, upgrade twice by other means, and
 * redeem the stale quote against a step that costs several times more.
 */
export async function POST(request: Request) {
  return handleSettlementRoute<{ key: string; fromLevel: number }>(request, {
    action: 'UpgradeCosmetic',
    parse: (body, wallet) => {
      if (typeof body.key !== 'string') throw new GameError('cosmetic key is required', 400);
      const key = cosmeticDef(body.key).key;
      return { key, fromLevel: currentLevel(wallet, key) };
    },
    encode: (p) => `${p.key}@${p.fromLevel}`,
    decode: (detail) => {
      const at = detail.lastIndexOf('@');
      return { key: detail.slice(0, at), fromLevel: Number(detail.slice(at + 1)) };
    },
    price: (wallet, p) => {
      // Re-read rather than trusting the parsed level: between quote and settle
      // the item may have moved, and the player must be charged for the step
      // they are actually taking.
      const level = currentLevel(wallet, p.key);
      if (level !== p.fromLevel) {
        throw new GameError('That cosmetic changed level — request a fresh quote', 409);
      }
      return { bntyAmount: cosmeticUpgradeCost(cosmeticDef(p.key).bnty, level) };
    },
    apply: (wallet, p, opts) => ({
      ...upgradeCosmetic(wallet, p.key, opts, p.fromLevel),
      catalog: cosmeticsCatalog(wallet),
    }),
  });
}
