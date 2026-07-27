// Cosmetics — the vanity layer, and the only spend in the game that gives every
// token it takes back to the players.
//
// Two things make this different from the other sinks:
//
//   1. It can be paid in BNTY or in ETH. A player who has not yet earned much
//      BNTY can still buy in, and a player sitting on BNTY has somewhere to
//      spend it that is not another multiplier.
//   2. The house cut is 2%, split half burned and half returned to the emission
//      reserve. The treasury keeps none of it.
//
// Cosmetics deliberately have NO effect on yield. The moment a skin pays better
// than a bare desk, it stops being a cosmetic and becomes a paywall.

import { getDb } from './db';
import { GameError } from './errors';
import { addLedger, bumpProtocolCounter, getOrCreateUser, type SpendOpts } from './game';
import {
  COSMETIC_MAX_LEVEL,
  cosmeticFeeSplit,
  cosmeticUpgradeCost,
  cosmeticUpgradeLadder,
  type CosmeticCurrency,
} from './economy';
import { addXp } from './progression';
import { spendScrip, scripBalances } from './scrip';
import { recordQuestProgress } from './quests';
import { SETTLEMENT_CONFIGURED } from './settlement';

export type CosmeticSlot = 'avatar' | 'desk' | 'plinth';

export interface CosmeticDef {
  key: string;
  name: string;
  slot: CosmeticSlot;
  description: string;
  /** Price in BNTY. */
  bnty: number;
  /** Equivalent price in ETH, for players buying in before they have earned. */
  eth: number;
  /**
   * Price in Scrip. Present on most of the catalogue and absent on the few
   * pieces meant to stay scarce.
   *
   * Absent rather than zero, so "this cannot be bought with Scrip" and "this is
   * free" are different states rather than the same number — a missing price is
   * a refusal, and a zero price would be a giveaway.
   */
  scrip?: number;
  tier: 'standard' | 'rare' | 'signature';
}

/**
 * The catalogue lives in code, not in the database.
 *
 * A cosmetic is defined by how it renders, and the renderer is code — a row in
 * a table that no model knows how to draw would be an entry a player could buy
 * and never see. Adding a cosmetic therefore means adding it here AND to the
 * iso models, in the same change.
 */
export const COSMETICS: CosmeticDef[] = [
  {
    key: 'avatar_house_jacket',
    name: 'House Jacket',
    slot: 'avatar',
    description: 'Standard-issue floor jacket in Robin Neon trim.',
    bnty: 2_500,
    eth: 0.002,
    tier: 'standard',
  },
  {
    key: 'avatar_market_maker',
    name: 'Market Maker',
    slot: 'avatar',
    description: 'Worn by funds that quote both sides. Neon piping, dark shell.',
    bnty: 12_000,
    eth: 0.008,
    tier: 'rare',
  },
  {
    key: 'desk_brushed_steel',
    name: 'Brushed Steel Livery',
    slot: 'desk',
    description: 'Replaces painted panels with brushed steel across every desk.',
    bnty: 6_000,
    eth: 0.004,
    tier: 'standard',
  },
  {
    key: 'desk_neon_trim',
    name: 'Neon Trim',
    slot: 'desk',
    description: 'Runs a lit Robin Neon strip along every desk on your floor.',
    bnty: 18_000,
    eth: 0.012,
    tier: 'rare',
  },
  {
    key: 'plinth_marble',
    name: 'Marble Plinths',
    slot: 'plinth',
    description: 'Swaps steel plinths for polished marble.',
    bnty: 9_000,
    eth: 0.006,
    tier: 'standard',
  },
  {
    key: 'plinth_founders',
    name: "Founder's Plate",
    slot: 'plinth',
    description: 'An engraved plate under every desk. Signature tier.',
    bnty: 40_000,
    eth: 0.025,
    tier: 'signature',
  },

  // -------------------------------------------------------------------------
  // The Scrip wardrobe
  // -------------------------------------------------------------------------
  //
  // Priced in earned currency, and written to be recognised rather than
  // explained. These lean on trading-floor and crypto culture the way a real
  // wardrobe leans on a workplace: the joke is that the fund thinks it is
  // dressing for a bank. After the turn (docs/greenwood-turn.md) the same items
  // read completely differently — a hi-vis vest and a hard hat stop being an
  // ironic costume and start being what the job actually is — so nothing here
  // needs replacing when the world changes underneath it.

  {
    key: 'avatar_quarter_zip',
    name: 'Quarter Zip',
    slot: 'avatar',
    description: 'The uniform. Nobody has ever been fired wearing one.',
    scrip: 1_800,
    bnty: 3_000,
    eth: 0.002,
    tier: 'standard',
  },
  {
    key: 'avatar_hi_vis',
    name: 'Hi-Vis Vest',
    slot: 'avatar',
    description: 'Site issue. The one piece of Robin Neon you are allowed to wear head to toe.',
    scrip: 2_400,
    bnty: 4_000,
    eth: 0.003,
    tier: 'standard',
  },
  {
    key: 'avatar_hard_hat',
    name: 'Hard Hat',
    slot: 'avatar',
    description: 'Required past the fence. Nobody remembers writing that rule.',
    scrip: 3_200,
    bnty: 5_000,
    eth: 0.003,
    tier: 'standard',
  },
  {
    key: 'avatar_diamond_hands',
    name: 'Diamond Hands',
    slot: 'avatar',
    description: 'Gloves that catch the light. Worn by people who did not sell.',
    scrip: 9_000,
    bnty: 14_000,
    eth: 0.009,
    tier: 'rare',
  },
  {
    key: 'avatar_paper_hands',
    name: 'Paper Hands',
    slot: 'avatar',
    description: 'Somebody has to be on the other side of the trade. Worn ironically. Mostly.',
    scrip: 2_000,
    bnty: 3_500,
    eth: 0.002,
    tier: 'standard',
  },
  {
    key: 'avatar_laser_eyes',
    name: 'Laser Eyes',
    slot: 'avatar',
    description: 'A commitment device. Cannot be worn quietly.',
    scrip: 26_000,
    bnty: 30_000,
    eth: 0.018,
    tier: 'rare',
  },
  {
    key: 'avatar_bag_holder',
    name: 'Bag Holder',
    slot: 'avatar',
    description: 'A pack you did not need, worn with the strap across the chest. Deeply unserious.',
    scrip: 5_500,
    bnty: 8_000,
    eth: 0.005,
    tier: 'standard',
  },
  {
    key: 'avatar_night_shift',
    name: 'Night Shift',
    slot: 'avatar',
    description: 'Charcoal shell, reflective seams. For funds that run when the floor is empty.',
    scrip: 14_000,
    bnty: 20_000,
    eth: 0.012,
    tier: 'rare',
  },
  {
    key: 'avatar_first_thousand',
    name: 'The First Thousand',
    slot: 'avatar',
    description: 'Plain coat, no markings, one small pin. If you know, you know.',
    scrip: 60_000,
    bnty: 75_000,
    eth: 0.045,
    tier: 'signature',
  },

  {
    key: 'desk_ticker_tape',
    name: 'Ticker Tape',
    slot: 'desk',
    description: 'A live crawl around the base of every desk. Says nothing useful, constantly.',
    scrip: 7_000,
    bnty: 11_000,
    eth: 0.007,
    tier: 'standard',
  },
  {
    key: 'desk_green_candles',
    name: 'Green Candles',
    slot: 'desk',
    description: 'Lit bars stepping up the desk housing. They only ever go up. That is the joke.',
    scrip: 12_000,
    bnty: 17_000,
    eth: 0.011,
    tier: 'rare',
  },
  {
    key: 'desk_field_repair',
    name: 'Field Repair',
    slot: 'desk',
    description: 'Mismatched panels, taped conduit, a part number in marker. Honest work.',
    scrip: 4_500,
    bnty: 7_000,
    eth: 0.004,
    tier: 'standard',
  },
  {
    key: 'desk_gm',
    name: 'GM',
    slot: 'desk',
    description: 'Two letters, lit, on the side of every desk. Nobody has explained it to the auditors.',
    scrip: 8_500,
    bnty: 13_000,
    eth: 0.008,
    tier: 'standard',
  },

  {
    key: 'plinth_astroturf',
    name: 'Astroturf',
    slot: 'plinth',
    description: 'Plastic grass under industrial machinery. Somebody in facilities was very proud.',
    scrip: 3_000,
    bnty: 5_000,
    eth: 0.003,
    tier: 'standard',
  },
  {
    key: 'plinth_pallet',
    name: 'Shipping Pallet',
    slot: 'plinth',
    description: 'It was going to be temporary.',
    scrip: 2_200,
    bnty: 4_000,
    eth: 0.002,
    tier: 'standard',
  },
  {
    key: 'plinth_hazard_deck',
    name: 'Hazard Deck',
    slot: 'plinth',
    description: 'Yellow-and-black chevrons around every base. Reads as caution. Is decoration.',
    scrip: 6_500,
    bnty: 10_000,
    eth: 0.006,
    tier: 'standard',
  },
  {
    key: 'plinth_substation',
    name: 'Substation Pad',
    slot: 'plinth',
    description: 'Poured concrete, cable trench, a warning plate nobody reads. Signature tier.',
    scrip: 45_000,
    bnty: 55_000,
    eth: 0.032,
    tier: 'signature',
  },
];

const BY_KEY = new Map(COSMETICS.map((c) => [c.key, c]));

export function cosmeticDef(key: string): CosmeticDef {
  const def = BY_KEY.get(key);
  if (!def) throw new GameError(`Unknown cosmetic: ${key}`, 404);
  return def;
}

export function priceOf(def: CosmeticDef, currency: CosmeticCurrency): number {
  if (currency === 'ETH') return def.eth;
  if (currency === 'SCRIP') {
    if (def.scrip == null) {
      throw new GameError(`${def.name} is not sold for Scrip.`, 400);
    }
    return def.scrip;
  }
  return def.bnty;
}

/** Currencies this piece is actually sold for, for the shop's buttons. */
export function currenciesFor(def: CosmeticDef): CosmeticCurrency[] {
  return def.scrip == null ? ['BNTY', 'ETH'] : ['SCRIP', 'BNTY', 'ETH'];
}

/**
 * Names for the rungs of the upgrade track.
 *
 * A number going from 3 to 4 is bookkeeping; "Bespoke" becoming "Signature" is
 * something a player mentions to someone else. Index 0 is what you get on
 * purchase, so the array is one longer than the level cap.
 */
export const UPGRADE_RANKS = ['Stock', 'Refined', 'Tailored', 'Bespoke', 'Signature', 'Archive'];

export function rankName(level: number): string {
  return UPGRADE_RANKS[Math.max(0, Math.min(UPGRADE_RANKS.length - 1, level))];
}

interface OwnedRow {
  cosmetic_key: string;
  paid_currency: string;
  paid_amount: number;
  acquired_at: number;
  upgrade_level: number;
}

export function ownedCosmetics(wallet: string): string[] {
  return (
    getDb()
      .prepare('SELECT cosmetic_key FROM cosmetics_owned WHERE wallet = ?')
      .all(wallet) as unknown as OwnedRow[]
  ).map((row) => row.cosmetic_key);
}

/**
 * Is this wallet's copy of `key` promised to a buyer?
 *
 * A listed item is frozen: it cannot be worn and it cannot be refined. Wearing
 * it would leave the seller dressed in something that is about to belong to
 * somebody else, and refining it would spend BNTY improving an item at a price
 * that was already agreed.
 */
function listingIdFor(wallet: string, key: string): number | null {
  const row = getDb()
    .prepare(
      `SELECT o.id AS id FROM cosmetics_owned o
         JOIN listings l ON l.item_kind = 'cosmetic' AND l.item_id = o.id AND l.status = 'open'
        WHERE o.wallet = ? AND o.cosmetic_key = ?`
    )
    .get(wallet, key) as { id: number } | undefined;
  return row ? row.id : null;
}

/** Owned keys mapped to how far up the track each one has been taken. */
export function cosmeticLevels(wallet: string): Record<string, number> {
  const rows = getDb()
    .prepare('SELECT cosmetic_key, upgrade_level FROM cosmetics_owned WHERE wallet = ?')
    .all(wallet) as unknown as Array<{ cosmetic_key: string; upgrade_level: number }>;
  return Object.fromEntries(rows.map((r) => [r.cosmetic_key, r.upgrade_level ?? 0]));
}

/** What a wallet is wearing, as slot -> cosmetic key. Drives rendering. */
export function equippedCosmetics(wallet: string): Record<string, string> {
  const rows = getDb()
    .prepare('SELECT slot, cosmetic_key FROM cosmetics_equipped WHERE wallet = ?')
    .all(wallet) as unknown as Array<{ slot: string; cosmetic_key: string }>;
  return Object.fromEntries(rows.map((r) => [r.slot, r.cosmetic_key]));
}

/**
 * What a wallet is wearing, with the upgrade level of each piece.
 *
 * The renderer needs both: the key picks the model, the level picks how far the
 * trim is taken. Returned as one query rather than a lookup per slot so the
 * presence broadcast can send a complete outfit in a single payload.
 */
export function wornCosmetics(wallet: string): Record<string, { key: string; level: number }> {
  const rows = getDb()
    .prepare(
      `SELECT e.slot, e.cosmetic_key, COALESCE(o.upgrade_level, 0) AS upgrade_level
         FROM cosmetics_equipped e
         LEFT JOIN cosmetics_owned o
           ON o.wallet = e.wallet AND o.cosmetic_key = e.cosmetic_key
        WHERE e.wallet = ?`
    )
    .all(wallet) as unknown as Array<{ slot: string; cosmetic_key: string; upgrade_level: number }>;
  return Object.fromEntries(rows.map((r) => [r.slot, { key: r.cosmetic_key, level: r.upgrade_level }]));
}

/**
 * The owned row behind each key: its id, its rank, and whether it is on sale.
 *
 * The id matters because the Exchange trades ROWS, not keys — two wallets can
 * own the same cosmetic at different ranks, and a listing has to name exactly
 * one of them.
 */
function ownedRows(wallet: string): Record<string, { id: number; level: number; listed: boolean }> {
  const rows = getDb()
    .prepare(
      `SELECT o.id AS id, o.cosmetic_key AS key, o.upgrade_level AS level,
              CASE WHEN l.id IS NULL THEN 0 ELSE 1 END AS listed
         FROM cosmetics_owned o
         LEFT JOIN listings l
           ON l.item_kind = 'cosmetic' AND l.item_id = o.id AND l.status = 'open'
        WHERE o.wallet = ?`
    )
    .all(wallet) as unknown as Array<{ id: number; key: string; level: number; listed: number }>;
  return Object.fromEntries(
    rows.map((r) => [r.key, { id: r.id, level: r.level ?? 0, listed: Boolean(r.listed) }])
  );
}

/** The catalogue as the shop should render it for one wallet. */
export function cosmeticsCatalog(wallet: string | null) {
  const owned = wallet ? ownedRows(wallet) : {};
  const equipped = wallet ? equippedCosmetics(wallet) : {};
  return {
    feeBps: 200,
    maxLevel: COSMETIC_MAX_LEVEL,
    ranks: UPGRADE_RANKS,
    /**
     * Whether an ETH checkout can actually complete right now. The BNTY price
     * settles through the same rail as every other spend; native ETH does not
     * have one yet, so the shop hides that button rather than offering a
     * purchase that fails after the player has committed to it.
     */
    ethCheckout: !SETTLEMENT_CONFIGURED,
    /**
     * What the wallet can actually spend on Scrip-priced pieces.
     *
     * Sent as one number rather than the bound/bearer split, because spendScrip
     * takes bound first and the shop's only question is "can I afford this".
     * Showing two figures would invite the player to reason about which one is
     * about to be spent, which is a decision they do not get to make.
     */
    scrip: wallet ? scripBalances(wallet).total : 0,
    items: COSMETICS.map((def) => {
      const row = owned[def.key];
      const level = row?.level ?? 0;
      return {
        ...def,
        owned: Boolean(row),
        equipped: equipped[def.slot] === def.key,
        level,
        rank: rankName(level),
        /** Currencies this piece is genuinely sold for, in shop-button order. */
        currencies: currenciesFor(def),
        /** The cosmetics_owned row id, which is what the Exchange lists. */
        ownedId: row?.id ?? null,
        /** On sale right now, so it can be neither worn nor refined. */
        listed: row?.listed ?? false,
        ladder: cosmeticUpgradeLadder(def.bnty),
        /** Null once the item is at the cap, or while it is not owned. */
        nextUpgrade:
          row && level < COSMETIC_MAX_LEVEL
            ? { level: level + 1, bnty: cosmeticUpgradeCost(def.bnty, level), rank: rankName(level + 1) }
            : null,
      };
    }),
  };
}

/**
 * Buy a cosmetic.
 *
 * The fee is taken from the sale and immediately split — burned and returned to
 * the reserve — and the remainder is protocol revenue, because on a primary
 * sale there is no seller to pay. A future player-to-player resale would keep
 * this same fee and send the remainder to the seller instead.
 *
 * ETH purchases cannot burn BNTY directly, so the two halves are recorded as
 * earmarked ETH rather than pretending supply moved. Calling it burned when no
 * token was destroyed would put a number on the protocol page that the token
 * contract disagrees with.
 */
export function buyCosmetic(
  wallet: string,
  key: string,
  currency: CosmeticCurrency,
  opts?: SpendOpts
) {
  const db = getDb();
  const def = cosmeticDef(key);
  const user = getOrCreateUser(wallet);

  const already = db
    .prepare('SELECT 1 AS hit FROM cosmetics_owned WHERE wallet = ? AND cosmetic_key = ?')
    .get(wallet, key) as { hit: number } | undefined;
  if (already) throw new GameError('You already own that cosmetic', 400);

  const price = priceOf(def, currency);
  const split = cosmeticFeeSplit(price);
  const now = Date.now();

  if (currency === 'SCRIP') {
    // spendScrip takes bound balance before bearer, which is what makes the
    // wardrobe reachable by playing: quest and streak income buys clothes, and
    // the tradeable kind is left alone for the market. No burn or reserve split
    // here — Scrip never entered token supply, so there is nothing to take out
    // of it, and the sink is the spend itself.
    spendScrip(wallet, price, `cosmetic:${key}`);
  } else if (currency === 'BNTY') {
    // Skipped when the operator already paid on-chain, exactly as every other
    // spend does — otherwise a settled purchase is charged twice.
    if (!opts?.settledOnChain) {
      if (user.osr_balance < price) {
        throw new GameError(
          `Not enough BNTY: need ${price.toLocaleString()} BNTY (you have ${Math.floor(user.osr_balance).toLocaleString()}).`
        );
      }
      const charged = db
        .prepare('UPDATE users SET osr_balance = osr_balance - ? WHERE wallet = ? AND osr_balance >= ?')
        .run(price, wallet, price);
      if (Number(charged.changes) === 0) {
        throw new GameError('Not enough BNTY for that cosmetic.');
      }
    }
    bumpProtocolCounter('burned', split.burn);
    bumpProtocolCounter('reserve', split.reserve);
    bumpProtocolCounter('treasury', split.net);
  } else {
    // ETH revenue, with the two halves earmarked rather than applied to BNTY
    // supply. Converting them is an operational step, not a state transition.
    bumpProtocolCounter('solRevenue', price);
    bumpProtocolCounter('ethBurnFund', split.burn);
    bumpProtocolCounter('ethRewardFund', split.reserve);
  }

  db.prepare(
    `INSERT INTO cosmetics_owned (wallet, cosmetic_key, paid_currency, paid_amount, acquired_at)
     VALUES (?,?,?,?,?)`
  ).run(wallet, key, currency, price, now);

  addLedger(wallet, 'cosmetic_buy', currency === 'BNTY' ? -price : 0, {
    key,
    currency,
    price,
    fee: split.fee,
    burn: split.burn,
    reserve: split.reserve,
  });

  return { key, currency, price, fee: split.fee, burn: split.burn, reserve: split.reserve };
}

/**
 * Take a cosmetic you already own one step further up its track.
 *
 * This is the recurring sink. Buying is a one-off — six items and a wallet is
 * done spending forever — whereas refining something already owned is a reason
 * to keep coming back to the same item, and the price climbs each time.
 *
 * Two rules keep it from becoming pay-to-win:
 *
 *   1. BNTY only. The upgrade path exists to remove BNTY from circulation, and
 *      an ETH route would leave the sink unused by the players with the most of
 *      it. Buying in with ETH stays available; refining does not.
 *   2. No yield effect, at any level. What a level buys is the visible finish
 *      and XP on the Trading track — which moves Total Level, and therefore
 *      rank, without touching a single emission number.
 */
export function upgradeCosmetic(
  wallet: string,
  key: string,
  opts?: SpendOpts,
  /**
   * The level the caller priced this step from. Supplied by the settlement
   * route, where quote and settle are separated by a real on-chain payment: if
   * the item moved up in that window, the payment covers a cheaper step than
   * the one about to be applied, and the upgrade must be refused rather than
   * granted at the stale price.
   */
  expectLevel?: number
) {
  const db = getDb();
  const def = cosmeticDef(key);
  const user = getOrCreateUser(wallet);

  const row = db
    .prepare('SELECT upgrade_level FROM cosmetics_owned WHERE wallet = ? AND cosmetic_key = ?')
    .get(wallet, key) as { upgrade_level: number } | undefined;
  if (!row) throw new GameError('You do not own that cosmetic', 403);

  if (listingIdFor(wallet, key)) {
    throw new GameError('That cosmetic is listed on the Exchange — cancel the listing to refine it', 409);
  }

  const level = row.upgrade_level ?? 0;
  if (level >= COSMETIC_MAX_LEVEL) {
    throw new GameError(`${def.name} is already at ${rankName(COSMETIC_MAX_LEVEL)}, the top of its track`, 400);
  }
  if (expectLevel != null && expectLevel !== level) {
    throw new GameError('That cosmetic changed level — request a fresh quote', 409);
  }

  const price = cosmeticUpgradeCost(def.bnty, level);
  const split = cosmeticFeeSplit(price);

  if (!opts?.settledOnChain) {
    if (user.osr_balance < price) {
      throw new GameError(
        `Not enough BNTY: ${rankName(level + 1)} costs ${price.toLocaleString()} BNTY (you have ${Math.floor(user.osr_balance).toLocaleString()}).`
      );
    }
    const charged = db
      .prepare('UPDATE users SET osr_balance = osr_balance - ? WHERE wallet = ? AND osr_balance >= ?')
      .run(price, wallet, price);
    if (Number(charged.changes) === 0) throw new GameError('Not enough BNTY for that upgrade.');
  }

  // Conditional on the level we priced, so two requests arriving together cannot
  // both charge for the same step — the second one changes no rows and refunds.
  const applied = db
    .prepare(
      'UPDATE cosmetics_owned SET upgrade_level = ? WHERE wallet = ? AND cosmetic_key = ? AND upgrade_level = ?'
    )
    .run(level + 1, wallet, key, level);
  if (Number(applied.changes) === 0) {
    if (!opts?.settledOnChain) {
      db.prepare('UPDATE users SET osr_balance = osr_balance + ? WHERE wallet = ?').run(price, wallet);
    }
    throw new GameError('That upgrade already went through — reload to see it', 409);
  }

  bumpProtocolCounter('burned', split.burn);
  bumpProtocolCounter('reserve', split.reserve);
  bumpProtocolCounter('treasury', split.net);

  // XP scales with the step, so the last rung is worth more than the first.
  const xp = 120 * (level + 1);
  addXp(wallet, 'trading', xp);
  recordQuestProgress(wallet, 'cosmetic_upgrade');

  addLedger(wallet, 'cosmetic_upgrade', -price, {
    key,
    level: level + 1,
    price,
    fee: split.fee,
    burn: split.burn,
    reserve: split.reserve,
  });

  return {
    key,
    level: level + 1,
    rank: rankName(level + 1),
    price,
    xp,
    fee: split.fee,
    burn: split.burn,
    reserve: split.reserve,
    nextUpgrade:
      level + 1 < COSMETIC_MAX_LEVEL
        ? {
            level: level + 2,
            bnty: cosmeticUpgradeCost(def.bnty, level + 1),
            rank: rankName(level + 2),
          }
        : null,
  };
}

export function equipCosmetic(wallet: string, key: string) {
  const db = getDb();
  const def = cosmeticDef(key);
  const owns = db
    .prepare('SELECT 1 AS hit FROM cosmetics_owned WHERE wallet = ? AND cosmetic_key = ?')
    .get(wallet, key) as { hit: number } | undefined;
  if (!owns) throw new GameError('You do not own that cosmetic', 403);
  if (listingIdFor(wallet, key)) {
    throw new GameError('That cosmetic is listed on the Exchange — cancel the listing to wear it', 409);
  }

  // One cosmetic per slot: writing the slot replaces whatever was worn there.
  db.prepare(
    `INSERT INTO cosmetics_equipped (wallet, slot, cosmetic_key, equipped_at) VALUES (?,?,?,?)
       ON CONFLICT(wallet, slot) DO UPDATE SET cosmetic_key = excluded.cosmetic_key,
                                               equipped_at = excluded.equipped_at`
  ).run(wallet, def.slot, key, Date.now());
  return { slot: def.slot, key };
}

export function unequipCosmetic(wallet: string, slot: CosmeticSlot) {
  getDb().prepare('DELETE FROM cosmetics_equipped WHERE wallet = ? AND slot = ?').run(wallet, slot);
  return { slot };
}
