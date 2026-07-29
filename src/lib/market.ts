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

export type ItemKind = 'crate' | 'component' | 'node' | 'cosmetic';

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
  priceBnty: number;
  createdAt: number;
  /** Human-readable description of what is being sold. */
  item: Record<string, unknown> | null;
}

/** Fee taken from a sale, and what the seller actually receives. */
export function splitSale(priceBnty: number): { fee: number; toSeller: number } {
  const fee = Math.floor((priceBnty * MARKET_FEE_BPS) / 10_000);
  return { fee, toSeller: priceBnty - fee };
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
  priceBnty: number
): Listing {
  if (!Number.isFinite(priceBnty) || priceBnty <= 0) {
    throw new GameError('price must be a positive number of BNTY', 400);
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
      .run(wallet, kind, itemId, priceBnty, now);
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
    priceBnty,
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
 * Payment is handled by the caller — the buyer sends BNTY to the seller on-chain
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
    priceBnty: row.price_osr,
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
    priceBnty: row.price_osr,
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
