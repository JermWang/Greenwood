// Crate mining.
//
// Crates are found, not bought. Every node accrues a chance to turn one up as
// it mines; the whole network shares a fixed daily budget, and a single wallet
// can only take so much of it. Opening a crate is what costs GPU.
//
// The budget is the point. Letting operators buy crates on demand made supply
// infinite and the drop meaningless — the scarcity here is what makes a find
// worth a notification.

import { getDb, getProtocolValue, setProtocolValue } from './db';
import {
  CRATES_FOUND_PER_DAY,
  CRATE_WALLET_DAILY_CAP,
} from './economy';

export interface FoundCrate {
  id: number;
  crateType: 'rig_crate' | 'shaft_crate';
  foundAt: number;
  foundNodeId: number | null;
}

/** UTC day index — the budget resets on a fixed boundary, not a rolling one. */
export function crateDay(nowMs: number): number {
  return Math.floor(nowMs / 86_400_000);
}

function budgetKey(day: number) {
  return `crates_found_day_${day}`;
}

/** How many crates the network has already found today. */
export function cratesFoundToday(nowMs = Date.now()): number {
  const raw = getProtocolValue(budgetKey(crateDay(nowMs)));
  return raw == null ? 0 : Number(raw) || 0;
}

export function networkCratesRemaining(nowMs = Date.now()): number {
  return Math.max(0, CRATES_FOUND_PER_DAY - cratesFoundToday(nowMs));
}

/** How many crates this wallet has found today, against its personal cap. */
export function walletCratesFoundToday(wallet: string, nowMs = Date.now()): number {
  const startOfDay = crateDay(nowMs) * 86_400_000;
  const row = getDb()
    .prepare('SELECT COUNT(*) AS n FROM crates WHERE wallet = ? AND found_at >= ?')
    .get(wallet, startOfDay) as { n: number } | undefined;
  return row?.n ?? 0;
}

/**
 * Roll for crate drops across a wallet's nodes.
 *
 * Called whenever a wallet's state is settled, so drops accrue with mining
 * rather than needing a background job. Each node is rolled for the time it has
 * mined since it was last rolled, which is why crate_rolled_at is persisted:
 * without it a restart would re-roll the same elapsed seconds and hand out free
 * extra chances.
 *
 * Drop chance is weighted by the wallet's share of network grow power, matching
 * how emission is split — a bigger operation finds proportionally more, but the
 * per-wallet daily cap stops it sweeping the whole budget.
 */
export function rollCrateDrops(
  wallet: string,
  nodes: Array<{ id: number; family: 'oil' | 'mine'; crateRolledAt: number }>,
  walletGpShare: number,
  nowMs = Date.now()
): FoundCrate[] {
  if (nodes.length === 0) return [];

  const networkRemaining = networkCratesRemaining(nowMs);
  if (networkRemaining <= 0) {
    touchRolled(nodes, nowMs);
    return [];
  }
  const walletRemaining = CRATE_WALLET_DAILY_CAP - walletCratesFoundToday(wallet, nowMs);
  if (walletRemaining <= 0) {
    touchRolled(nodes, nowMs);
    return [];
  }

  // Expected finds for this wallet per day = its GP share of the daily budget.
  // Spread across its nodes and across the day, that gives each node a small
  // per-second probability.
  const share = Math.min(1, Math.max(0, walletGpShare));
  const expectedPerDay = CRATES_FOUND_PER_DAY * share;
  const perNodePerSecond = expectedPerDay / nodes.length / 86_400;

  const found: FoundCrate[] = [];
  let allowance = Math.min(networkRemaining, walletRemaining);

  const db = getDb();
  const insert = db.prepare(
    `INSERT INTO crates (wallet, crate_type, found_at, found_node_id) VALUES (?,?,?,?)`
  );

  for (const node of nodes) {
    const since = node.crateRolledAt > 0 ? node.crateRolledAt : nowMs;
    const elapsedS = Math.max(0, (nowMs - since) / 1000);
    if (elapsedS <= 0) continue;

    if (allowance > 0) {
      // Probability of at least one find over the elapsed window. Capped so a
      // node that has not been settled for a very long time cannot bank an
      // enormous certainty of dropping — the budget already bounds the total,
      // but this keeps a single stale node from consuming it in one roll.
      const p = 1 - Math.exp(-perNodePerSecond * Math.min(elapsedS, 86_400));
      if (Math.random() < p) {
        const crateType = node.family === 'oil' ? 'rig_crate' : 'shaft_crate';
        const result = insert.run(wallet, crateType, nowMs, node.id);
        found.push({
          id: Number(result.lastInsertRowid),
          crateType,
          foundAt: nowMs,
          foundNodeId: node.id,
        });
        allowance -= 1;
      }
    }
  }

  touchRolled(nodes, nowMs);
  if (found.length > 0) bumpFoundCounter(found.length, nowMs);
  return found;
}

function touchRolled(nodes: Array<{ id: number }>, nowMs: number) {
  const update = getDb().prepare('UPDATE nodes SET crate_rolled_at = ? WHERE id = ?');
  for (const node of nodes) update.run(nowMs, node.id);
}

function bumpFoundCounter(count: number, nowMs: number) {
  const key = budgetKey(crateDay(nowMs));
  setProtocolValue(key, String(cratesFoundToday(nowMs) + count));
}

/** Unopened crates held by a wallet, newest first. Listed crates are excluded. */
export function unopenedCrates(wallet: string): FoundCrate[] {
  const rows = getDb()
    .prepare(
      `SELECT id, crate_type, found_at, found_node_id
         FROM crates
        WHERE wallet = ? AND opened_at IS NULL AND listing_id IS NULL
        ORDER BY found_at DESC`
    )
    .all(wallet) as Array<{
    id: number;
    crate_type: 'rig_crate' | 'shaft_crate';
    found_at: number;
    found_node_id: number | null;
  }>;
  return rows.map((row) => ({
    id: row.id,
    crateType: row.crate_type,
    foundAt: row.found_at,
    foundNodeId: row.found_node_id,
  }));
}

/** Crates found but not yet acknowledged — drives the dashboard notification. */
export function unseenCrates(wallet: string): FoundCrate[] {
  const rows = getDb()
    .prepare(
      `SELECT id, crate_type, found_at, found_node_id
         FROM crates
        WHERE wallet = ? AND seen_at IS NULL AND opened_at IS NULL
        ORDER BY found_at DESC`
    )
    .all(wallet) as Array<{
    id: number;
    crate_type: 'rig_crate' | 'shaft_crate';
    found_at: number;
    found_node_id: number | null;
  }>;
  return rows.map((row) => ({
    id: row.id,
    crateType: row.crate_type,
    foundAt: row.found_at,
    foundNodeId: row.found_node_id,
  }));
}

export function markCratesSeen(wallet: string) {
  getDb()
    .prepare('UPDATE crates SET seen_at = ? WHERE wallet = ? AND seen_at IS NULL')
    .run(Date.now(), wallet);
}
