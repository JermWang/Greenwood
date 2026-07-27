// Scrip — the soft currency, in two kinds.
//
// The problem Scrip solves: every reward in this game was previously a claim on
// BNTY emission, which halves and is capped. That makes it impossible to be
// generous in a player's first session, which is precisely the session where
// generosity buys you a player. Scrip is earned from ACTIVITY and has no supply
// schedule to protect, so quests and streaks can pay properly without the
// halving curve ever hearing about it.
//
// ---------------------------------------------------------------------------
// Why two kinds
// ---------------------------------------------------------------------------
//
// A single Scrip that could be both earned from quests AND sold for BNTY would
// be an emission tap with an extra hop: farm the dailies, dump the Scrip, take
// the BNTY. It is the exact dynamic the quest module refuses to allow directly,
// and it is farmable at scale by anyone willing to script it.
//
// So Scrip comes in two kinds that spend identically and move differently:
//
//   BOUND   earned from quests, streaks and work orders. Spends on anything.
//           Cannot be traded, cannot be sold, never becomes BNTY. This is the
//           faucet, and it is a closed one.
//
//   BEARER  bought from the protocol with BNTY, and tradeable between players.
//           This is the market side: BNTY flows to the protocol to mint it, and
//           players trade it among themselves afterwards.
//
// The rule that makes the whole thing safe is that THE PROTOCOL NEVER BUYS
// SCRIP BACK. There is deliberately no sellScripToProtocol() below. A player
// with surplus Scrip sells it to another player on the Exchange, which moves
// BNTY between two wallets rather than creating any — so the market has a real
// bid and a real ask without the faucet ever draining into the token.
//
// Spending always burns BOUND first. A player who has both should keep the kind
// they could have sold.

import { getDb } from './db';
import { GameError } from './errors';
import { addLedger, bumpProtocolCounter, getOrCreateUser, type SpendOpts } from './game';
import { cosmeticFeeSplit } from './economy';

/** Scrip minted per whole BNTY at the protocol window. */
export const SCRIP_PER_BNTY = 1;

/**
 * Smallest purchase, in BNTY.
 *
 * A floor rather than a fee: it keeps the ledger from filling with dust rows
 * that cost more to store than the amount they record.
 */
export const MIN_SCRIP_PURCHASE_BNTY = 100;

export interface ScripBalances {
  /** Earned. Spendable, never tradeable. */
  bound: number;
  /** Bought or traded for. Spendable and tradeable. */
  bearer: number;
  total: number;
}

interface ScripRow {
  bound: number;
  bearer: number;
}

function readRow(wallet: string): ScripRow {
  const row = getDb()
    .prepare('SELECT scrip_bound AS bound, scrip_bearer AS bearer FROM users WHERE wallet = ?')
    .get(wallet) as ScripRow | undefined;
  return { bound: row?.bound ?? 0, bearer: row?.bearer ?? 0 };
}

/** Pure read — an unknown wallet holds nothing rather than being created. */
export function scripBalances(wallet: string): ScripBalances {
  const row = readRow(wallet);
  return { bound: row.bound, bearer: row.bearer, total: row.bound + row.bearer };
}

/**
 * Pay out earned Scrip.
 *
 * Always bound: this is the faucet, and everything that comes out of it has to
 * stay inside the game. Quests, streaks and work orders all land here.
 */
export function grantScrip(wallet: string, amount: number, reason: string): number {
  if (!(amount > 0)) return 0;
  getOrCreateUser(wallet);
  getDb()
    .prepare('UPDATE users SET scrip_bound = scrip_bound + ? WHERE wallet = ?')
    .run(amount, wallet);
  addLedger(wallet, 'scrip_grant', 0, { amount, reason, kind: 'bound' });
  return amount;
}

/**
 * Buy Scrip from the protocol with BNTY.
 *
 * This is the buy-side pressure: the only way to get Scrip faster than playing
 * for it is to spend the token. The BNTY paid takes the same 2% house cut as
 * every other transaction — half burned, half back into the rewards reserve —
 * and the remainder is protocol revenue, because the protocol is the seller.
 *
 * Charging is skipped when the operator already settled on-chain, exactly as
 * every other spend does; debiting the mirrored balance as well would take the
 * price twice.
 */
export function buyScrip(wallet: string, bntyAmount: number, opts?: SpendOpts) {
  if (!Number.isFinite(bntyAmount) || bntyAmount < MIN_SCRIP_PURCHASE_BNTY) {
    throw new GameError(
      `Minimum purchase is ${MIN_SCRIP_PURCHASE_BNTY.toLocaleString()} BNTY`,
      400
    );
  }
  const db = getDb();
  const user = getOrCreateUser(wallet);

  if (!opts?.settledOnChain) {
    if (user.osr_balance < bntyAmount) {
      throw new GameError(
        `Not enough BNTY: need ${bntyAmount.toLocaleString()} (you have ${Math.floor(user.osr_balance).toLocaleString()}).`
      );
    }
    const charged = db
      .prepare('UPDATE users SET osr_balance = osr_balance - ? WHERE wallet = ? AND osr_balance >= ?')
      .run(bntyAmount, wallet, bntyAmount);
    if (Number(charged.changes) === 0) throw new GameError('Not enough BNTY for that purchase.');
  }

  const split = cosmeticFeeSplit(bntyAmount);
  bumpProtocolCounter('burned', split.burn);
  bumpProtocolCounter('reserve', split.reserve);
  bumpProtocolCounter('treasury', split.net);

  const scrip = bntyAmount * SCRIP_PER_BNTY;
  db.prepare('UPDATE users SET scrip_bearer = scrip_bearer + ? WHERE wallet = ?').run(scrip, wallet);
  addLedger(wallet, 'scrip_buy', -bntyAmount, {
    scrip,
    bnty: bntyAmount,
    fee: split.fee,
    burn: split.burn,
    reserve: split.reserve,
  });

  return { scrip, bnty: bntyAmount, fee: split.fee, burn: split.burn, reserve: split.reserve };
}

/**
 * Spend Scrip on anything the game sells for it.
 *
 * Bound first, deliberately. A player holding both kinds should be left with
 * the tradeable one — spending their bearer Scrip while bound sits idle would
 * quietly confiscate the only kind that had resale value.
 *
 * The two UPDATEs are conditional on the balance still covering them, so two
 * requests arriving together cannot both pass an earlier check and overdraw.
 */
export function spendScrip(wallet: string, amount: number, reason: string) {
  if (!(amount > 0)) throw new GameError('amount must be positive', 400);
  const db = getDb();
  getOrCreateUser(wallet);
  const row = readRow(wallet);
  if (row.bound + row.bearer < amount) {
    throw new GameError(
      `Not enough Scrip: need ${Math.ceil(amount).toLocaleString()} (you have ${Math.floor(row.bound + row.bearer).toLocaleString()}).`
    );
  }

  const fromBound = Math.min(row.bound, amount);
  const fromBearer = amount - fromBound;

  const spent = db
    .prepare(
      `UPDATE users SET scrip_bound = scrip_bound - ?, scrip_bearer = scrip_bearer - ?
         WHERE wallet = ? AND scrip_bound >= ? AND scrip_bearer >= ?`
    )
    .run(fromBound, fromBearer, wallet, fromBound, fromBearer);
  if (Number(spent.changes) === 0) throw new GameError('Not enough Scrip.');

  addLedger(wallet, 'scrip_spend', 0, { amount, reason, fromBound, fromBearer });
  return { amount, fromBound, fromBearer };
}

/**
 * Move bearer Scrip between wallets. Used by the Exchange when a listing sells.
 *
 * Bound Scrip is untouchable here — that is the entire boundary between the two
 * kinds, and it is enforced at the only place value can leave a wallet rather
 * than being left to callers to remember.
 */
export function transferBearerScrip(from: string, to: string, amount: number) {
  if (!(amount > 0)) throw new GameError('amount must be positive', 400);
  const db = getDb();
  getOrCreateUser(from);
  getOrCreateUser(to);
  const moved = db
    .prepare('UPDATE users SET scrip_bearer = scrip_bearer - ? WHERE wallet = ? AND scrip_bearer >= ?')
    .run(amount, from, amount);
  if (Number(moved.changes) === 0) {
    throw new GameError('Not enough tradeable Scrip — earned Scrip cannot be sold', 400);
  }
  db.prepare('UPDATE users SET scrip_bearer = scrip_bearer + ? WHERE wallet = ?').run(amount, to);
  addLedger(from, 'scrip_transfer_out', 0, { amount, to });
  addLedger(to, 'scrip_transfer_in', 0, { amount, from });
  return { amount };
}

// Deliberately absent: sellScripToProtocol().
//
// A protocol bid for Scrip would complete the path quests -> Scrip -> BNTY and
// turn every daily into an emission tap the halving schedule never budgeted
// for. Selling happens player-to-player on the Exchange, where the BNTY comes
// out of another player's wallet rather than out of the reserve.
