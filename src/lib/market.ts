// Player-to-player marketplace.
//
// Custodial by necessity: items are rows in this database, not tokens, so the
// server is the ledger and moves ownership. What is NOT ours is the pricing —
// sellers name any price, buyers take it or leave it, and the protocol only
// takes a fee. No floor, no ceiling, no curation, no protocol-owned inventory.
//
// Be clear-eyed about the trust model: because we hold the ledger, players are
// trusting us not to mint or alter items. That is inherent to trading off-chain
// game state and cannot be fixed with market rules — only by tokenising items.

import { getDb } from './db';
import { GameError } from './game';
import { MARKET_FEE_BPS } from './economy';
import { recordQuestProgress } from './quests';
import { cosmeticDef, rankName } from './cosmetics';
import { ALL_WEAPONS, weaponById } from './weapons';

/**
 * What can change hands.
 *
 * `weapon` is CROSSBOWS ONLY, and the asymmetry is deliberate rather than an
 * oversight. A crossbow is a crafted object that lives in a pack, can be
 * dropped on death, and is fungible by type — one Hunting Crossbow is any
 * other. An AXE is a tier on the users row, bought up a Scrip ladder: there is
 * no object to hand over, and "selling" one would mean deciding what happens
 * when the buyer already owns a better one. That is a design question about the
 * woodcutting ladder, not a market feature, so axes are not listed here.
 */
export type ItemKind = 'crate' | 'component' | 'node' | 'cosmetic' | 'weapon';

/**
 * A weapon's stable numeric id, because `listings.item_id` is an INTEGER.
 *
 * Crossbows have no row of their own — pack_contents is keyed by
 * (wallet, kind, ref) with a quantity — so the listing points at the WEAPON
 * TYPE and ownership is "does this wallet hold at least one, less whatever they
 * have already listed". Fungible by type, which is what a stack of identical
 * crossbows actually is.
 */
const TRADEABLE_WEAPONS = ALL_WEAPONS.filter((w) => w.weaponClass === 'crossbow');
const weaponRefOf = (itemId: number): string | null => TRADEABLE_WEAPONS[itemId]?.id ?? null;
export const weaponItemId = (ref: string): number =>
  TRADEABLE_WEAPONS.findIndex((w) => w.id === ref);

/**
 * Is this item promised to a buyer right now?
 *
 * An open listing has to be a LOCK, not a label. Everything that can move an
 * item by some other route — equipping it, or selling the thing it is bolted to
 * — has to consult this first, or the same item can change hands twice: list a
 * component, fit it to a desk, sell the desk, and the component reaches the
 * desk's buyer while still sitting on the board for someone else to buy.
 */
export function isListed(kind: ItemKind, itemId: number): boolean {
  const row = getDb()
    .prepare(`SELECT 1 AS hit FROM listings WHERE item_kind = ? AND item_id = ? AND status = 'open'`)
    .get(kind, itemId) as { hit: number } | undefined;
  return Boolean(row);
}

/** Ids of a node's fitted components that are separately listed. */
function listedComponentsOn(nodeId: number): number[] {
  return (
    getDb()
      .prepare(
        `SELECT c.id AS id FROM components c
           JOIN listings l ON l.item_kind = 'component' AND l.item_id = c.id AND l.status = 'open'
          WHERE c.equipped_node_id = ?`
      )
      .all(nodeId) as unknown as Array<{ id: number }>
  ).map((r) => r.id);
}

export interface Listing {
  id: number;
  seller: string;
  itemKind: ItemKind;
  itemId: number;
  priceGreen: number;
  createdAt: number;
  /** Human-readable description of what is being sold. */
  item: Record<string, unknown> | null;
}

/** Fee taken from a sale, and what the seller actually receives. */
export function splitSale(priceGreen: number): { fee: number; toSeller: number } {
  const fee = Math.floor((priceGreen * MARKET_FEE_BPS) / 10_000);
  return { fee, toSeller: priceGreen - fee };
}

/**
 * Confirm the wallet owns the item and that it is free to be listed.
 *
 * Equipped components and crates already listed are rejected: selling gear out
 * from under a running node, or double-listing one crate, would let a seller
 * take payment twice for the same thing.
 */
function assertSellable(wallet: string, kind: ItemKind, itemId: number) {
  const db = getDb();
  if (kind === 'crate') {
    const row = db
      .prepare('SELECT wallet, opened_at, listing_id FROM crates WHERE id = ?')
      .get(itemId) as { wallet: string; opened_at: number | null; listing_id: number | null } | undefined;
    if (!row || row.wallet !== wallet) throw new GameError('crate not found in your inventory', 404);
    if (row.opened_at != null) throw new GameError('that crate has already been opened', 400);
    if (row.listing_id != null) throw new GameError('that crate is already listed', 400);
    return;
  }
  if (kind === 'component') {
    const row = db
      .prepare('SELECT wallet, equipped_node_id FROM components WHERE id = ?')
      .get(itemId) as { wallet: string; equipped_node_id: number | null } | undefined;
    if (!row || row.wallet !== wallet) throw new GameError('component not found in your inventory', 404);
    if (row.equipped_node_id != null) {
      throw new GameError('unequip that component before listing it', 400);
    }
    return;
  }
  if (kind === 'weapon') {
    const ref = weaponRefOf(itemId);
    if (!ref) throw new GameError('that is not a tradeable weapon', 400);
    const held = (
      db
        .prepare(
          `SELECT COALESCE(SUM(quantity), 0) AS n FROM pack_contents
            WHERE wallet = ? AND kind = 'weapon' AND ref = ?`
        )
        .get(wallet, ref) as { n: number }
    ).n;
    /*
     * COUNTED AGAINST WHAT IS ALREADY LISTED, because weapons are fungible.
     *
     * Every other kind here is a unique row, so "already listed" is a flag on
     * it. A stack of two crossbows is one row with a quantity, and the unique
     * live-listing index deliberately does not cover weapons (see lib/db) —
     * without this a seller with one crossbow could list it five times and take
     * payment five times for one object.
     */
    const listed = (
      db
        .prepare(
          `SELECT COUNT(*) AS n FROM listings
            WHERE seller = ? AND item_kind = 'weapon' AND item_id = ? AND status = 'open'`
        )
        .get(wallet, itemId) as { n: number }
    ).n;
    if (held <= listed) {
      throw new GameError(
        listed > 0
          ? 'you have already listed every one of those you are carrying'
          : 'that weapon is not in your pack',
        400
      );
    }
    return;
  }
  if (kind === 'cosmetic') {
    const row = db
      .prepare('SELECT wallet FROM cosmetics_owned WHERE id = ?')
      .get(itemId) as { wallet: string } | undefined;
    if (!row || row.wallet !== wallet) throw new GameError('cosmetic not found in your wardrobe', 404);
    const worn = db
      .prepare('SELECT 1 AS hit FROM cosmetics_equipped e JOIN cosmetics_owned o ON o.wallet = e.wallet AND o.cosmetic_key = e.cosmetic_key WHERE o.id = ?')
      .get(itemId) as { hit: number } | undefined;
    // Same rule as an equipped instrument: take it off before you sell it, so
    // nobody is left wearing something they no longer own.
    if (worn) throw new GameError('take that off before listing it', 400);
    return;
  }

  const row = db.prepare('SELECT wallet FROM nodes WHERE id = ?').get(itemId) as
    | { wallet: string }
    | undefined;
  if (!row || row.wallet !== wallet) throw new GameError('node not found in your compound', 404);
  // A desk carries its fitted instruments to the buyer, so it may not be sold
  // while one of them is promised to somebody else.
  const conflicts = listedComponentsOn(itemId);
  if (conflicts.length > 0) {
    throw new GameError(
      'an instrument fitted to that desk is listed separately — cancel that listing first',
      409
    );
  }
}

export function createListing(
  wallet: string,
  kind: ItemKind,
  itemId: number,
  priceGreen: number
): Listing {
  if (!Number.isFinite(priceGreen) || priceGreen <= 0) {
    throw new GameError('price must be a positive number of GREEN', 400);
  }
  assertSellable(wallet, kind, itemId);

  const db = getDb();
  const now = Date.now();
  let listingId: number;
  try {
    const result = db
      .prepare(
        `INSERT INTO listings (seller, item_kind, item_id, price_osr, created_at, status)
         VALUES (?,?,?,?,?, 'open')`
      )
      .run(wallet, kind, itemId, priceGreen, now);
    listingId = Number(result.lastInsertRowid);
  } catch (error) {
    // The partial unique index makes double-listing a race-safe failure rather
    // than something the ownership check above has to win a race against — but
    // only a UNIQUE violation means that. Reporting every insert failure as
    // "already listed" hides schema and constraint problems behind a message
    // that sends whoever is debugging it to look in entirely the wrong place.
    const message = error instanceof Error ? error.message : String(error);
    if (/UNIQUE|constraint failed: listings\.item/i.test(message)) {
      throw new GameError('that item is already listed', 409);
    }
    console.error('[market] listing insert failed', error);
    throw new GameError('could not list that item', 500);
  }

  if (kind === 'crate') {
    db.prepare('UPDATE crates SET listing_id = ? WHERE id = ?').run(listingId, itemId);
  }
  recordQuestProgress(wallet, 'market_list');
  return {
    id: listingId,
    seller: wallet,
    itemKind: kind,
    itemId,
    priceGreen,
    createdAt: now,
    item: describeItem(kind, itemId),
  };
}

export function cancelListing(wallet: string, listingId: number) {
  const db = getDb();
  const row = db
    .prepare(`SELECT seller, item_kind, item_id, status FROM listings WHERE id = ?`)
    .get(listingId) as
    | { seller: string; item_kind: ItemKind; item_id: number; status: string }
    | undefined;
  if (!row) throw new GameError('listing not found', 404);
  if (row.seller !== wallet) throw new GameError('that is not your listing', 403);
  if (row.status !== 'open') throw new GameError('that listing is no longer open', 400);

  db.prepare(`UPDATE listings SET status = 'cancelled' WHERE id = ?`).run(listingId);
  if (row.item_kind === 'crate') {
    db.prepare('UPDATE crates SET listing_id = NULL WHERE id = ?').run(row.item_id);
  }
}

/**
 * Move a sold item to its buyer and close the listing.
 *
 * Payment is handled by the caller — the buyer sends GREEN to the seller on-chain
 * and this runs only once that transfer is verified. Ownership transfer and
 * listing closure happen in one transaction so a crash cannot leave an item
 * paid for but undelivered.
 */
export function transferSoldItem(listingId: number, buyer: string): Listing {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT id, seller, item_kind, item_id, price_osr, created_at, status
         FROM listings WHERE id = ?`
    )
    .get(listingId) as
    | {
        id: number;
        seller: string;
        item_kind: ItemKind;
        item_id: number;
        price_osr: number;
        created_at: number;
        status: string;
      }
    | undefined;
  if (!row) throw new GameError('listing not found', 404);
  if (row.status !== 'open') throw new GameError('that listing is no longer available', 409);
  if (row.seller === buyer) throw new GameError('you cannot buy your own listing', 400);

  const { fee, toSeller } = splitSale(row.price_osr);
  const now = Date.now();

  db.exec('BEGIN IMMEDIATE');
  try {
    // Re-check under the transaction: two buyers can pay for the same listing
    // concurrently, and only one may take the item.
    const live = db.prepare(`SELECT status FROM listings WHERE id = ?`).get(listingId) as
      | { status: string }
      | undefined;
    if (!live || live.status !== 'open') throw new GameError('that listing was just taken', 409);

    if (row.item_kind === 'crate') {
      db.prepare('UPDATE crates SET wallet = ?, listing_id = NULL, seen_at = NULL WHERE id = ?')
        .run(buyer, row.item_id);
    } else if (row.item_kind === 'component') {
      db.prepare('UPDATE components SET wallet = ?, equipped_node_id = NULL WHERE id = ?')
        .run(buyer, row.item_id);
    } else if (row.item_kind === 'weapon') {
      const weaponRef = weaponRefOf(row.item_id);
      {
        if (!weaponRef) throw new GameError('that weapon no longer exists', 409);
        /*
         * Take it off the seller CONDITIONALLY, and refuse if it is gone.
         *
         * A crossbow can leave a pack between listing and sale in ways a desk
         * cannot: dropped on death, or spent in a craft. The quantity in the
         * UPDATE is the only thing that can arbitrate, exactly as it is for
         * ammunition and for the mirrored balance.
         */
        const taken = db
          .prepare(
            `UPDATE pack_contents SET quantity = quantity - 1
              WHERE wallet = ? AND kind = 'weapon' AND ref = ? AND quantity >= 1`
          )
          .run(row.seller, weaponRef);
        if (Number(taken.changes) === 0) {
          throw new GameError('the seller no longer has that weapon', 409);
        }
        db.prepare(
          `INSERT INTO pack_contents (wallet, kind, ref, quantity) VALUES (?,?,?,1)
             ON CONFLICT(wallet, kind, ref) DO UPDATE SET quantity = quantity + 1`
        ).run(buyer, 'weapon', weaponRef);
      }
    } else if (row.item_kind === 'cosmetic') {
      const item = db
        .prepare('SELECT wallet, cosmetic_key FROM cosmetics_owned WHERE id = ?')
        .get(row.item_id) as { wallet: string; cosmetic_key: string } | undefined;
      if (!item) throw new GameError('that cosmetic no longer exists', 409);
      // One copy per wallet is a unique index, so a buyer who already owns this
      // key would fail the UPDATE with a constraint error and roll the whole
      // purchase back. Refusing up front says why instead.
      const dupe = db
        .prepare('SELECT 1 AS hit FROM cosmetics_owned WHERE wallet = ? AND cosmetic_key = ?')
        .get(buyer, item.cosmetic_key) as { hit: number } | undefined;
      if (dupe) throw new GameError('you already own that cosmetic', 409);
      // Clear the seller's slot before the row moves: cosmetics_equipped is keyed
      // by (wallet, slot) and would otherwise leave them wearing it.
      db.prepare('DELETE FROM cosmetics_equipped WHERE wallet = ? AND cosmetic_key = ?')
        .run(item.wallet, item.cosmetic_key);
      // upgrade_level rides on the row, so a refined piece stays refined for its
      // new owner — that is what makes the upgrade track worth spending on.
      db.prepare('UPDATE cosmetics_owned SET wallet = ? WHERE id = ?').run(buyer, row.item_id);
    } else {
      // A sold node takes its fitted components with it, otherwise the seller
      // would keep gear that is physically bolted to something they no longer own.
      // assertSellable refuses to list a desk carrying a separately-listed
      // instrument; this re-checks under the transaction, because the listing
      // could have been created in the window since.
      const conflicts = listedComponentsOn(row.item_id);
      if (conflicts.length > 0) {
        throw new GameError('an instrument on that desk is listed separately', 409);
      }
      db.prepare('UPDATE nodes SET wallet = ? WHERE id = ?').run(buyer, row.item_id);
      db.prepare('UPDATE components SET wallet = ? WHERE equipped_node_id = ?')
        .run(buyer, row.item_id);
    }

    // Whatever moved, it is no longer on the seller's floor. Dropping the id
    // from their saved layout keeps the stored arrangement honest rather than
    // relying on every reader to filter out equipment the wallet lost.
    if (row.item_kind === 'node' || row.item_kind === 'component') {
      dropFromLayout(row.seller, row.item_kind, row.item_id);
    }

    db.prepare(
      `UPDATE listings
          SET status = 'sold', buyer = ?, sold_at = ?, sold_price_osr = ?, fee_osr = ?
        WHERE id = ?`
    ).run(buyer, now, row.price_osr, fee, listingId);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  recordQuestProgress(buyer, 'market_buy');
  return {
    id: row.id,
    seller: row.seller,
    itemKind: row.item_kind,
    itemId: row.item_id,
    priceGreen: row.price_osr,
    createdAt: row.created_at,
    item: describeItem(row.item_kind, row.item_id),
  };
}

/**
 * Remove a sold machine from the seller's saved floor.
 *
 * scoreLayout already ignores ids the wallet no longer owns, so the multiplier
 * was never wrong — but the stored JSON kept naming equipment that had moved on,
 * and a reader that forgot to filter would quietly pay a bonus for somebody
 * else's desk. Cheaper to keep the record true than to trust every reader.
 */
function dropFromLayout(seller: string, kind: 'node' | 'component', itemId: number) {
  const db = getDb();
  const row = db.prepare('SELECT layout FROM floor_layouts WHERE wallet = ?').get(seller) as
    | { layout: string }
    | undefined;
  if (!row) return;
  const target = `${kind === 'node' ? 'line' : 'component'}:${itemId}`;
  try {
    const parsed = JSON.parse(row.layout) as Array<{ id?: string }>;
    if (!Array.isArray(parsed)) return;
    const kept = parsed.filter((entry) => entry?.id !== target);
    if (kept.length === parsed.length) return;
    db.prepare('UPDATE floor_layouts SET layout = ?, updated_at = ? WHERE wallet = ?')
      .run(JSON.stringify(kept), Date.now(), seller);
  } catch {
    // A layout that will not parse is already being treated as empty everywhere
    // else; failing the sale over it would be the wrong trade.
  }
}

/** What the buyer is actually looking at, so the UI need not re-query per row. */
function describeItem(kind: ItemKind, itemId: number): Record<string, unknown> | null {
  const db = getDb();
  if (kind === 'crate') {
    return (
      (db.prepare('SELECT crate_type, found_at FROM crates WHERE id = ?').get(itemId) as
        | Record<string, unknown>
        | undefined) ?? null
    );
  }
  if (kind === 'component') {
    return (
      (db.prepare('SELECT slot, family, rarity FROM components WHERE id = ?').get(itemId) as
        | Record<string, unknown>
        | undefined) ?? null
    );
  }
  if (kind === 'weapon') {
    const weapon = weaponById(weaponRefOf(itemId));
    if (!weapon) return null;
    // Everything a buyer prices a weapon on, straight off lib/weapons so the
    // board and the fight can never disagree about what it does.
    return {
      weapon_id: weapon.id,
      name: weapon.name,
      tier: weapon.tier,
      damage: weapon.damage,
      reach: weapon.reach,
      ammo: weapon.ammo,
    };
  }
  if (kind === 'cosmetic') {
    const row = db
      .prepare('SELECT cosmetic_key, upgrade_level FROM cosmetics_owned WHERE id = ?')
      .get(itemId) as { cosmetic_key: string; upgrade_level: number } | undefined;
    if (!row) return null;
    // Resolved here rather than in the browser: the cosmetics catalogue is code
    // on this side, and shipping a second copy of the names to the client is
    // how a renamed item ends up with two names.
    const level = row.upgrade_level ?? 0;
    let name = row.cosmetic_key;
    let slot = 'avatar';
    let tier = 'standard';
    try {
      const def = cosmeticDef(row.cosmetic_key);
      name = def.name;
      slot = def.slot;
      tier = def.tier;
    } catch {
      // A row naming a cosmetic the catalogue has dropped still has to render,
      // so fall back to the raw key rather than failing the whole board.
    }
    return { cosmetic_key: row.cosmetic_key, name, slot, tier, upgrade_level: level, rank: rankName(level) };
  }
  // Accrued yield is shown because it transfers with the desk. A buyer paying
  // for a desk is also buying whatever it has produced and not yet routed, and
  // pricing that is impossible if the listing does not say how much it is.
  return (
    (db.prepare('SELECT family, level, accrued FROM nodes WHERE id = ?').get(itemId) as
      | Record<string, unknown>
      | undefined) ?? null
  );
}

export function openListings(kind?: ItemKind, limit = 100): Listing[] {
  const db = getDb();
  const rows = (
    kind
      ? db
          .prepare(
            `SELECT id, seller, item_kind, item_id, price_osr, created_at
               FROM listings WHERE status = 'open' AND item_kind = ?
              ORDER BY created_at DESC LIMIT ?`
          )
          .all(kind, limit)
      : db
          .prepare(
            `SELECT id, seller, item_kind, item_id, price_osr, created_at
               FROM listings WHERE status = 'open'
              ORDER BY created_at DESC LIMIT ?`
          )
          .all(limit)
  ) as Array<{
    id: number;
    seller: string;
    item_kind: ItemKind;
    item_id: number;
    price_osr: number;
    created_at: number;
  }>;

  return rows.map((row) => ({
    id: row.id,
    seller: row.seller,
    itemKind: row.item_kind,
    itemId: row.item_id,
    priceGreen: row.price_osr,
    createdAt: row.created_at,
    item: describeItem(row.item_kind, row.item_id),
  }));
}

/** Recent sales, so buyers can see what things actually go for. */
export function recentSales(limit = 50) {
  return getDb()
    .prepare(
      `SELECT item_kind, item_id, sold_price_osr, sold_at, fee_osr
         FROM listings WHERE status = 'sold'
        ORDER BY sold_at DESC LIMIT ?`
    )
    .all(limit);
}

/** One side of one completed trade, from this wallet's point of view. */
export interface TradeRecord {
  id: number;
  side: 'bought' | 'sold';
  itemKind: ItemKind;
  itemId: number;
  priceGreen: number;
  /** What the seller actually received. Zero on a buy — the buyer paid gross. */
  netGreen: number;
  feeGreen: number;
  at: number;
  /** The other party. */
  counterparty: string;
  item: Record<string, unknown> | null;
}

/**
 * What this wallet has bought and sold.
 *
 * Straight off the listings table, because a sold listing IS the receipt — it
 * keeps the buyer, the price, the fee and the timestamp, which is exactly why
 * rows are kept rather than deleted on sale ("Rows are kept for price history",
 * lib/db). No second ledger to drift from it.
 *
 * NET IS ONLY MEANINGFUL ON A SALE. A buyer pays the gross price; the fee comes
 * out of the seller's side. Reporting a "net" on a purchase would invent a
 * number, so a buy reports zero and the panel shows the gross it actually paid.
 *
 * `item` is resolved per row through the same describeItem the board uses, so a
 * history entry and a live listing describe the thing identically — and an item
 * that has since been consumed (an allocation opened, a desk sold on) still
 * renders, because describeItem returns null rather than throwing.
 */
export function tradeHistory(wallet: string, limit = 40): TradeRecord[] {
  const w = wallet.toLowerCase();
  const rows = getDb()
    .prepare(
      `SELECT id, seller, buyer, item_kind, item_id, sold_price_osr, sold_at, fee_osr
         FROM listings
        WHERE status = 'sold'
          AND (lower(seller) = ? OR lower(buyer) = ?)
        ORDER BY sold_at DESC LIMIT ?`
    )
    .all(w, w, limit) as Array<{
    id: number;
    seller: string;
    buyer: string | null;
    item_kind: ItemKind;
    item_id: number;
    sold_price_osr: number;
    sold_at: number;
    fee_osr: number | null;
  }>;

  return rows.map((row) => {
    const sold = row.seller.toLowerCase() === w;
    const fee = Number(row.fee_osr ?? 0);
    return {
      id: row.id,
      side: sold ? ('sold' as const) : ('bought' as const),
      itemKind: row.item_kind,
      itemId: row.item_id,
      priceGreen: Number(row.sold_price_osr),
      netGreen: sold ? Number(row.sold_price_osr) - fee : 0,
      feeGreen: fee,
      at: Number(row.sold_at),
      counterparty: sold ? (row.buyer ?? '') : row.seller,
      item: describeItem(row.item_kind, row.item_id),
    };
  });
}
