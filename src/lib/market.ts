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

export type ItemKind = 'crate' | 'component' | 'node';

export interface Listing {
  id: number;
  seller: string;
  itemKind: ItemKind;
  itemId: number;
  priceOsr: number;
  createdAt: number;
  /** Human-readable description of what is being sold. */
  item: Record<string, unknown> | null;
}

/** Fee taken from a sale, and what the seller actually receives. */
export function splitSale(priceOsr: number): { fee: number; toSeller: number } {
  const fee = Math.floor((priceOsr * MARKET_FEE_BPS) / 10_000);
  return { fee, toSeller: priceOsr - fee };
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
  const row = db.prepare('SELECT wallet FROM nodes WHERE id = ?').get(itemId) as
    | { wallet: string }
    | undefined;
  if (!row || row.wallet !== wallet) throw new GameError('node not found in your compound', 404);
}

export function createListing(
  wallet: string,
  kind: ItemKind,
  itemId: number,
  priceOsr: number
): Listing {
  if (!Number.isFinite(priceOsr) || priceOsr <= 0) {
    throw new GameError('price must be a positive number of GPU', 400);
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
      .run(wallet, kind, itemId, priceOsr, now);
    listingId = Number(result.lastInsertRowid);
  } catch {
    // The partial unique index makes double-listing a race-safe failure rather
    // than something the ownership check above has to win a race against.
    throw new GameError('that item is already listed', 409);
  }

  if (kind === 'crate') {
    db.prepare('UPDATE crates SET listing_id = ? WHERE id = ?').run(listingId, itemId);
  }
  return {
    id: listingId,
    seller: wallet,
    itemKind: kind,
    itemId,
    priceOsr,
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
 * Payment is handled by the caller — the buyer sends GPU to the seller on-chain
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
    } else {
      // A sold node takes its fitted components with it, otherwise the seller
      // would keep gear that is physically bolted to something they no longer own.
      db.prepare('UPDATE nodes SET wallet = ? WHERE id = ?').run(buyer, row.item_id);
      db.prepare('UPDATE components SET wallet = ? WHERE equipped_node_id = ?')
        .run(buyer, row.item_id);
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

  return {
    id: row.id,
    seller: row.seller,
    itemKind: row.item_kind,
    itemId: row.item_id,
    priceOsr: row.price_osr,
    createdAt: row.created_at,
    item: describeItem(row.item_kind, row.item_id),
  };
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
  return (
    (db.prepare('SELECT family, level FROM nodes WHERE id = ?').get(itemId) as
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
    priceOsr: row.price_osr,
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
