import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';
import os from 'os';

// Local game database on Node's built-in SQLite (node:sqlite, Node >= 22.5).
// The original devnet deployment used a hosted API (devnet-api.osr.finance);
// this clone runs the whole economy locally so the game is fully playable
// offline / self-hosted.

let db: DatabaseSync | null = null;

/**
 * Resolve the SQLite directory. Explicit override wins so tests can isolate.
 *
 * Every balance, node, crate, stake and settlement in the game lives in the one
 * file under this directory. On Railway that has to be the mounted volume: the
 * container filesystem is replaced on every deploy, so resolving anywhere else
 * means the app quietly starts from an empty database and every operator's
 * holdings are gone, with nothing in the logs to say so. The old fallback chain
 * would do exactly that if OSR_DATA_DIR were ever dropped from the service
 * config — a one-variable mistake with no way back.
 *
 * So on Railway this refuses to guess. Failing to boot is recoverable in a way
 * that silently writing to disposable storage is not, and a failed boot cannot
 * pass the healthcheck, so a deploy that got this wrong never takes traffic.
 */
export function resolveDataDir(): string {
  const explicit = process.env.OSR_DATA_DIR;
  const volume = process.env.RAILWAY_VOLUME_MOUNT_PATH;

  if (process.env.RAILWAY_ENVIRONMENT) {
    if (!explicit) {
      throw new Error(
        'OSR_DATA_DIR is not set. On Railway the game database must live on the ' +
          'mounted volume — without it the app would start from an empty database ' +
          'on container storage and lose every operator on the next deploy.'
      );
    }
    if (volume && !path.resolve(explicit).startsWith(path.resolve(volume))) {
      throw new Error(
        `OSR_DATA_DIR (${explicit}) is outside the mounted volume (${volume}). ` +
          'The game database would be written to container storage and lost on the next deploy.'
      );
    }
    return explicit;
  }

  if (explicit) return explicit;
  // Vercel functions run from a read-only /var/task bundle. NOTE: os.tmpdir()
  // there is per-invocation and ephemeral — fine while writes are locked and
  // this is only an empty compatibility read, but it is NOT durable storage.
  // Durable multi-instance persistence must land before writes are unlocked.
  if (process.env.VERCEL) return path.join(os.tmpdir(), 'osr');
  return path.join(process.cwd(), 'data');
}

export function getDb(): DatabaseSync {
  if (db) return db;
  const dir = resolveDataDir();
  fs.mkdirSync(dir, { recursive: true });
  db = new DatabaseSync(path.join(dir, 'osr.db'));
  db.exec('PRAGMA journal_mode = WAL;');
  // SQLite defaults foreign keys OFF, per connection. Without this the six
  // references declared below — nodes, components, crates, listings, stakes and
  // floor_layouts all pointing at users — are documentation rather than
  // constraints, and nothing stops a row outliving the wallet that owns it.
  // Enforcement applies to new writes, so existing rows are unaffected.
  db.exec('PRAGMA foreign_keys = ON;');
  migrate(db);
  return db;
}

function migrate(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      wallet TEXT PRIMARY KEY,
      osr_balance REAL NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      last_seen INTEGER NOT NULL,
      dripped INTEGER NOT NULL DEFAULT 0,
      compound_level INTEGER NOT NULL DEFAULT 1,
      compound_started_at INTEGER,
      compound_target_level INTEGER,
      compound_ready_at INTEGER,
      last_crate_at INTEGER,
      crates_opened_today INTEGER NOT NULL DEFAULT 0,
      crates_day INTEGER NOT NULL DEFAULT 0,
      pity_legendary INTEGER NOT NULL DEFAULT 0,
      pity_mythic INTEGER NOT NULL DEFAULT 0,
      pity_divine INTEGER NOT NULL DEFAULT 0,
      welcome_started_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS nodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet TEXT NOT NULL REFERENCES users(wallet),
      family TEXT NOT NULL CHECK (family IN ('oil','mine')),
      name TEXT,
      level INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      last_claim_at INTEGER NOT NULL,
      accrued REAL NOT NULL DEFAULT 0,
      accrued_updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS components (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet TEXT NOT NULL REFERENCES users(wallet),
      slot TEXT NOT NULL,
      family TEXT NOT NULL,
      rarity TEXT NOT NULL,
      equipped_node_id INTEGER,
      acquired_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet TEXT NOT NULL,
      kind TEXT NOT NULL,
      amount REAL NOT NULL,
      meta TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS protocol (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS idempotency (
      wallet TEXT NOT NULL,
      action TEXT NOT NULL,
      request_key TEXT NOT NULL,
      response TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (wallet, action, request_key)
    );

    -- On-chain settlement records. One row per issued action voucher. The
    -- nonce is the primary key and is also emitted in the OSRGame
    -- ActionExecuted event, which is what binds a mined transaction back to
    -- the exact quote the server signed. status walks issued -> settled; a
    -- settled row can never be applied twice.
    CREATE TABLE IF NOT EXISTS settlements (
      nonce TEXT PRIMARY KEY,
      wallet TEXT NOT NULL,
      action TEXT NOT NULL,
      detail TEXT NOT NULL,
      osr_amount TEXT NOT NULL,
      fee_wei TEXT NOT NULL,
      burn_bps INTEGER NOT NULL,
      treasury_bps INTEGER NOT NULL,
      deadline INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'issued',
      tx_hash TEXT,
      applied_result TEXT,
      created_at INTEGER NOT NULL,
      settled_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_nodes_wallet ON nodes(wallet);
    CREATE INDEX IF NOT EXISTS idx_components_wallet ON components(wallet);
    CREATE INDEX IF NOT EXISTS idx_ledger_wallet ON ledger(wallet, created_at);
    CREATE INDEX IF NOT EXISTS idx_settlements_wallet ON settlements(wallet, created_at);
    -- A mined transaction may only ever back one settlement.
    CREATE UNIQUE INDEX IF NOT EXISTS idx_settlements_tx ON settlements(tx_hash)
      WHERE tx_hash IS NOT NULL;

    -- Crates are found by mining, not bought. A row here is an unopened crate
    -- sitting in a wallet's inventory: it exists from the moment it drops, and
    -- opening it (which costs GREEN) resolves it into a component.
    CREATE TABLE IF NOT EXISTS crates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet TEXT NOT NULL REFERENCES users(wallet),
      crate_type TEXT NOT NULL CHECK (crate_type IN ('equity_allocation','treasury_allocation')),
      found_at INTEGER NOT NULL,
      found_node_id INTEGER,
      -- Set when opened; an opened crate is kept for history, never deleted.
      opened_at INTEGER,
      result_rarity TEXT,
      result_slot TEXT,
      -- Cleared once the operator has seen the "you mined a crate" notice.
      seen_at INTEGER,
      -- Non-null while listed for sale, so a listed crate cannot also be opened.
      listing_id INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_crates_wallet ON crates(wallet, opened_at);

    -- Player-to-player marketplace. Custodial: the server is the ledger and
    -- moves the item, while GREEN settles wallet-to-wallet on-chain. A listing is
    -- the seller's offer; ownership only moves when a sale is recorded.
    CREATE TABLE IF NOT EXISTS listings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      seller TEXT NOT NULL REFERENCES users(wallet),
      item_kind TEXT NOT NULL CHECK (item_kind IN ('crate','component','node','cosmetic')),
      item_id INTEGER NOT NULL,
      price_osr REAL NOT NULL CHECK (price_osr > 0),
      created_at INTEGER NOT NULL,
      -- 'open' | 'sold' | 'cancelled'. Rows are kept for price history.
      status TEXT NOT NULL DEFAULT 'open',
      buyer TEXT,
      sold_at INTEGER,
      sold_price_osr REAL,
      fee_osr REAL
    );
    -- Fixed income notes: GREEN locked for a fixed term against a rate fixed
    -- at open. apr_bps and term_interest are stored per row rather than looked
    -- up from the current schedule, so changing the published terms can never
    -- retroactively alter what an already-open contract is owed.
    CREATE TABLE IF NOT EXISTS stakes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet TEXT NOT NULL REFERENCES users(wallet),
      principal REAL NOT NULL CHECK (principal > 0),
      term_days INTEGER NOT NULL,
      apr_bps INTEGER NOT NULL,
      term_interest REAL NOT NULL,
      opened_at INTEGER NOT NULL,
      matures_at INTEGER NOT NULL,
      -- 'active' | 'closed'. Closed rows are kept as position history.
      status TEXT NOT NULL DEFAULT 'active',
      closed_at INTEGER,
      paid_principal REAL,
      paid_interest REAL,
      penalty REAL
    );
    CREATE INDEX IF NOT EXISTS idx_stakes_wallet ON stakes(wallet, status, opened_at);

    -- Where a wallet has physically placed its equipment on the floor.
    -- Stored as one JSON document per wallet rather than a row per machine: it
    -- is always read and written whole, and the arrangement only means anything
    -- as a set. The server normalises it on write, so what is in here is
    -- already known to be owned, in bounds, and free of overlaps.
    CREATE TABLE IF NOT EXISTS floor_layouts (
      wallet TEXT PRIMARY KEY REFERENCES users(wallet),
      layout TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    -- Cosmetics a wallet owns. The catalogue itself is code, not data, so this
    -- only records ownership and what is currently worn: a cosmetic is defined
    -- by how it renders, which lives with the models.
    --
    -- paid_currency and paid_amount are kept for the receipt, not for the game
    -- state: a purchase is settled once and must stay auditable after the
    -- catalogue price moves.
    CREATE TABLE IF NOT EXISTS cosmetics_owned (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet TEXT NOT NULL REFERENCES users(wallet),
      cosmetic_key TEXT NOT NULL,
      paid_currency TEXT NOT NULL,
      paid_amount REAL NOT NULL,
      acquired_at INTEGER NOT NULL,
      upgrade_level INTEGER NOT NULL DEFAULT 0
    );
    -- A wallet may only own one of each cosmetic; re-buying is a no-op, not a
    -- second charge.
    CREATE UNIQUE INDEX IF NOT EXISTS idx_cosmetics_owned_unique
      ON cosmetics_owned(wallet, cosmetic_key);

    -- What each wallet is currently wearing, one row per slot.
    CREATE TABLE IF NOT EXISTS cosmetics_equipped (
      wallet TEXT NOT NULL REFERENCES users(wallet),
      slot TEXT NOT NULL,
      cosmetic_key TEXT NOT NULL,
      equipped_at INTEGER NOT NULL,
      PRIMARY KEY (wallet, slot)
    );

    -- Experience per activity track. Stored per (wallet, track) rather than as
    -- columns on users so a new track is a new row, not a migration.
    -- No foreign key to users on purpose. Progression is keyed by address, and
    -- quests are derived for any address whether or not it has ever played, so
    -- requiring a users row would make a side-channel write able to fail — and
    -- roll back — the real game action that triggered it.
    CREATE TABLE IF NOT EXISTS xp_tracks (
      wallet TEXT NOT NULL,
      track TEXT NOT NULL,
      xp REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (wallet, track)
    );

    -- Daily quests. Which three a wallet gets is DERIVED from (wallet, day), not
    -- stored, so a row only appears once there is progress to record — and a
    -- player cannot reroll by clearing state.
    CREATE TABLE IF NOT EXISTS daily_quests (
      wallet TEXT NOT NULL,
      day INTEGER NOT NULL,
      quest_key TEXT NOT NULL,
      progress REAL NOT NULL DEFAULT 0,
      claimed_at INTEGER,
      PRIMARY KEY (wallet, day, quest_key)
    );
    CREATE INDEX IF NOT EXISTS idx_daily_quests_day ON daily_quests(wallet, day);

    -- What a player is carrying into a hostile region, and what spilled when
    -- they did not come back.
    --
    -- Deliberately separate from the components table and the balance columns:
    -- this is the only inventory in the game another player can take, so keeping
    -- it in its own table means nothing at home can be reached by a bug in the
    -- looting path. A row here is at risk; a row anywhere else is not.
    CREATE TABLE IF NOT EXISTS pack_contents (
      wallet TEXT NOT NULL,
      kind TEXT NOT NULL,
      ref TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (wallet, kind, ref),
      FOREIGN KEY (wallet) REFERENCES users(wallet)
    );

    CREATE TABLE IF NOT EXISTS loot_piles (
      id TEXT PRIMARY KEY,
      region_id TEXT NOT NULL,
      x INTEGER NOT NULL,
      z INTEGER NOT NULL,
      -- Who died here. For the kill feed only: a pile has no owner and reserves
      -- nothing, so this column must never gate access to the contents.
      dropped_by TEXT NOT NULL,
      dropped_at INTEGER NOT NULL,
      -- CarriedStack[] as JSON. Read through lib/loot's visibleTo, which
      -- withholds contents from anyone not standing next to the pile.
      contents TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_loot_piles_region ON loot_piles(region_id, dropped_at);

    -- Where a player is standing, their health, and how hurt each creature is.
    --
    -- This lived in module-level Maps, on the reasoning that it changes
    -- constantly and is worthless after a session. That reasoning was right
    -- about the data and wrong about the runtime: Next bundles every route
    -- handler separately, so a Map in lib/expedition is a DIFFERENT Map for
    -- /step than it is for /state. The symptom was a player who moved
    -- successfully and then could not attack anything, because the attack route
    -- could not see that they had ever taken a step.
    --
    -- Rows are session state, not history: they are overwritten in place and
    -- mean nothing once a run ends.
    CREATE TABLE IF NOT EXISTS expedition_state (
      wallet TEXT PRIMARY KEY,
      x INTEGER,
      z INTEGER,
      health INTEGER NOT NULL DEFAULT 100,
      FOREIGN KEY (wallet) REFERENCES users(wallet)
    );

    CREATE TABLE IF NOT EXISTS creature_state (
      spawn_id TEXT PRIMARY KEY,
      health INTEGER NOT NULL,
      swung_at INTEGER NOT NULL DEFAULT 0
    );

    -- Felled trees, as stumps waiting to regrow.
    --
    -- Only the FELLED ones are stored. A tree that has never been cut has no
    -- row, because its species and position are already a pure function of its
    -- coordinate (lib/woodcutting, lib/deep-forest-map) -- writing a row per
    -- standing tree would mean persisting a map both halves can already compute.
    -- This table is the exception list, not the world.
    CREATE TABLE IF NOT EXISTS tree_state (
      tree_id TEXT PRIMARY KEY,
      felled_at INTEGER NOT NULL,
      felled_by TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_listings_open ON listings(status, item_kind, created_at);
    CREATE INDEX IF NOT EXISTS idx_listings_seller ON listings(seller, status);
    -- One live listing per item. Partial index so sold/cancelled rows can pile
    -- up in history without blocking the item being listed again later.
    CREATE UNIQUE INDEX IF NOT EXISTS idx_listings_item_live
      ON listings(item_kind, item_id) WHERE status = 'open';
  `);

  // These counters were split after the initial local schema shipped. Keep the
  // migration additive so existing development databases continue to work.
  ensureColumn(db, 'users', 'rig_crates_opened_today', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'users', 'shaft_crates_opened_today', 'INTEGER NOT NULL DEFAULT 0');

  // Tracks how much of each node's mining has already been rolled for crate
  // drops, so restarts cannot re-roll the same elapsed time for another chance.
  ensureColumn(db, 'nodes', 'crate_rolled_at', 'INTEGER NOT NULL DEFAULT 0');

  // How far a cosmetic has been taken up its upgrade track. Added after
  // cosmetics shipped, so it defaults to 0 — every already-owned item starts at
  // the bottom of the track rather than being retroactively granted levels.
  ensureColumn(db, 'cosmetics_owned', 'upgrade_level', 'INTEGER NOT NULL DEFAULT 0');

  widenListingKinds(db);
  renameAllocationKinds(db);
  renameTokenReceipts(db);
  dropColumn(db, 'users', 'xstock_xomx');
  dropColumn(db, 'users', 'xstock_cvxx');

  // Scrip, in two kinds. Split at the schema rather than tracked as one number
  // with a flag, because the difference between them is what stops the quest
  // faucet draining into the token — and a boundary that matters that much
  // should be impossible to lose track of in application code.
  ensureColumn(db, 'users', 'scrip_bound', 'REAL NOT NULL DEFAULT 0');
  ensureColumn(db, 'users', 'scrip_bearer', 'REAL NOT NULL DEFAULT 0');

  // How far up the pack ladder this wallet has bought. 0 means no pack at all,
  // which is the correct default for every existing player: the pack is the
  // entry ticket to the hostile regions, and nobody should be retroactively
  // holding one for a zone that did not exist when they last played.
  ensureColumn(db, 'users', 'pack_step', 'INTEGER NOT NULL DEFAULT 0');
  // The best axe owned. Same shape as pack_step: a ladder you climb with Scrip,
  // stored as one column because you only ever hold the best one.
  ensureColumn(db, 'users', 'axe_id', 'TEXT');
}

/**
 * Remove a column that is no longer part of the game.
 *
 * Used for the xStock accrual counters: nothing ever paid out of them — the
 * claim endpoint threw a 503 in every case — so the stored figures were phantom
 * bookkeeping, and leaving them behind would mean the schema kept advertising a
 * feature that no longer exists. Dropping is guarded on the column being
 * present, so it runs once and is a no-op on a database created after this.
 */
function dropColumn(db: DatabaseSync, table: string, column: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((item) => item.name === column)) return;
  db.exec(`ALTER TABLE ${table} DROP COLUMN ${column}`);
}

/**
 * Let cosmetics be listed on an already-created listings table.
 *
 * `CREATE TABLE IF NOT EXISTS` does nothing to a table that exists, and SQLite
 * cannot ALTER a CHECK constraint — so a database created before cosmetics were
 * tradeable still refuses to insert them, and the only fix is to rebuild the
 * table. Done under a transaction with foreign keys off, which is SQLite's
 * documented procedure: the child rows that reference listings would otherwise
 * see the table vanish mid-swap.
 *
 * Guarded on the constraint text so it runs exactly once. A rebuild that ran on
 * every boot would be a slow, and eventually dangerous, no-op.
 */
function widenListingKinds(db: DatabaseSync) {
  const row = db
    .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'listings'`)
    .get() as { sql: string } | undefined;
  if (!row?.sql || row.sql.includes("'cosmetic'")) return;

  db.exec('PRAGMA foreign_keys = OFF;');
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec(`
      CREATE TABLE listings_migrated (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        seller TEXT NOT NULL REFERENCES users(wallet),
        item_kind TEXT NOT NULL CHECK (item_kind IN ('crate','component','node','cosmetic')),
        item_id INTEGER NOT NULL,
        price_osr REAL NOT NULL CHECK (price_osr > 0),
        created_at INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'open',
        buyer TEXT,
        sold_at INTEGER,
        sold_price_osr REAL,
        fee_osr REAL
      );
      INSERT INTO listings_migrated
        SELECT id, seller, item_kind, item_id, price_osr, created_at, status,
               buyer, sold_at, sold_price_osr, fee_osr
          FROM listings;
      DROP TABLE listings;
      ALTER TABLE listings_migrated RENAME TO listings;
      CREATE INDEX IF NOT EXISTS idx_listings_open ON listings(status, item_kind, created_at);
      CREATE INDEX IF NOT EXISTS idx_listings_seller ON listings(seller, status);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_listings_item_live
        ON listings(item_kind, item_id) WHERE status = 'open';
    `);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  } finally {
    db.exec('PRAGMA foreign_keys = ON;');
  }
}

/**
 * Rename the allocation kinds off the old industrial theme.
 *
 * `rig_crate`/`shaft_crate` became `equity_allocation`/`treasury_allocation`.
 * The schema above already declares the new names, which does exactly nothing
 * to a database that already exists — so without this, an established install
 * keeps the OLD CHECK constraint while the code inserts the NEW value, and
 * every allocation a player earns fails on a constraint that is invisible from
 * the source. The test suite could never catch it: tests build fresh databases,
 * where the new schema is simply correct.
 *
 * Values are rewritten in the same transaction as the rebuild. A rebuild that
 * copied the old strings into a table forbidding them would fail the insert and
 * roll back, which is at least loud; a rewrite without the rebuild would fail
 * the same way. They have to happen together.
 *
 * Guarded on the constraint text so it runs exactly once, matching
 * widenListingKinds above.
 */
function renameTokenReceipts(db: DatabaseSync) {
  // The ticker the game prices in went from BNTY to GREEN, and the currency a
  // cosmetic was bought with is written into the receipt as that literal.
  //
  // Nothing READS this column — it is kept for the receipt, not for the game
  // (see the schema) — so this cannot break anything, and that is exactly why
  // it is worth doing now rather than never. A receipts table that answers the
  // same question two different ways depending on when you asked is a thing
  // somebody eventually has to reconcile by hand.
  //
  // Cheap and idempotent: after the first pass no row matches.
  db.prepare("UPDATE cosmetics_owned SET paid_currency = 'GREEN' WHERE paid_currency = 'BNTY'").run();
}

function renameAllocationKinds(db: DatabaseSync) {
  const row = db
    .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'crates'`)
    .get() as { sql: string } | undefined;
  if (!row?.sql || row.sql.includes("'equity_allocation'")) return;

  db.exec('PRAGMA foreign_keys = OFF;');
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec(`
      CREATE TABLE crates_migrated (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        wallet TEXT NOT NULL REFERENCES users(wallet),
        crate_type TEXT NOT NULL CHECK (crate_type IN ('equity_allocation','treasury_allocation')),
        found_at INTEGER NOT NULL,
        found_node_id INTEGER,
        opened_at INTEGER,
        result_rarity TEXT,
        result_slot TEXT,
        seen_at INTEGER,
        listing_id INTEGER
      );
      INSERT INTO crates_migrated
        SELECT id, wallet,
               CASE crate_type
                 WHEN 'rig_crate' THEN 'equity_allocation'
                 WHEN 'shaft_crate' THEN 'treasury_allocation'
                 ELSE crate_type
               END,
               found_at, found_node_id, opened_at, result_rarity, result_slot,
               seen_at, listing_id
          FROM crates;
      DROP TABLE crates;
      ALTER TABLE crates_migrated RENAME TO crates;
      CREATE INDEX IF NOT EXISTS idx_crates_wallet ON crates(wallet, opened_at);
    `);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  } finally {
    db.exec('PRAGMA foreign_keys = ON;');
  }
}

function ensureColumn(db: DatabaseSync, table: string, column: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export function getProtocolValue(key: string): string | null {
  const row = getDb().prepare('SELECT value FROM protocol WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setProtocolValue(key: string, value: string) {
  getDb()
    .prepare(
      'INSERT INTO protocol (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
    )
    .run(key, value);
}

/** Execute a synchronous game mutation once and replay its saved response on retry. */
export function runIdempotent<T>(
  wallet: string,
  action: string,
  requestKey: unknown,
  mutation: () => T
): T {
  // Preserve compatibility with older clients while current clients always
  // send a key. Invalid keys deliberately do not get persisted.
  if (typeof requestKey !== 'string' || requestKey.length < 8 || requestKey.length > 128) {
    return mutation();
  }

  const database = getDb();
  const read = () =>
    database
      .prepare(
        'SELECT response FROM idempotency WHERE wallet = ? AND action = ? AND request_key = ?'
      )
      .get(wallet, action, requestKey) as { response: string } | undefined;
  const cached = read();
  if (cached) return JSON.parse(cached.response) as T;

  database.exec('BEGIN IMMEDIATE');
  try {
    const raced = read();
    if (raced) {
      database.exec('COMMIT');
      return JSON.parse(raced.response) as T;
    }
    const result = mutation();
    database
      .prepare(
        'INSERT INTO idempotency (wallet, action, request_key, response, created_at) VALUES (?,?,?,?,?)'
      )
      .run(wallet, action, requestKey, JSON.stringify(result), Date.now());
    database.exec('COMMIT');
    return result;
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}
