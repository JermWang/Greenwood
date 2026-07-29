// Fixed income notes — the BNTY staking vault.
//
// An operator locks BNTY for a fixed term and is paid a rate published at the
// moment they commit. The interest comes out of the emission reserve, the same
// pool that funds production rewards, which is what makes solvency the central
// concern of this module rather than an afterthought.
//
// The rule that shapes everything here: the protocol never promises BNTY it does
// not already hold. A contract's full term interest is reserved when it opens,
// not when it closes, and a new contract is refused if the reserve cannot cover
// it alongside everything already committed. A vault that accepts deposits it
// cannot pay out is a vault that defaults on the last operator to leave.

import { getDb, getProtocolValue, setProtocolValue } from './db';
import { GameError } from './errors';
import { addLedger, bumpProtocolCounter, getOrCreateUser, protocolCounters } from './game';
import { recordQuestProgress } from './quests';
import {
  EMISSION_RESERVE,
  TOTAL_SUPPLY,
  STAKE_EARLY_EXIT_PENALTY_BPS,
  STAKE_MAX_OPEN,
  STAKE_MIN_OSR,
  STAKE_TERMS,
  stakeTermInterest,
  type StakeTerm,
} from './economy';

const DAY_MS = 86_400_000;

/** Protocol counter holding interest promised to open contracts but not yet paid. */
const COMMITTED_KEY = 'stakeCommitted';

export interface StakeRow {
  id: number;
  wallet: string;
  principal: number;
  term_days: number;
  apr_bps: number;
  term_interest: number;
  opened_at: number;
  matures_at: number;
  status: string;
  closed_at: number | null;
  paid_principal: number | null;
  paid_interest: number | null;
  penalty: number | null;
}

export interface StakePosition {
  id: number;
  principal: number;
  termDays: number;
  aprBps: number;
  openedAt: number;
  maturesAt: number;
  status: 'active' | 'closed';
  /** Full interest if held to maturity. */
  termInterest: number;
  /** Interest earned so far, which is only payable at maturity. */
  accruedInterest: number;
  matured: boolean;
  /** What closing right now would pay out, all in. */
  closeValueNow: number;
  /** Principal forfeited if closed now. Zero once matured. */
  earlyExitPenalty: number;
  closedAt: number | null;
  paidPrincipal: number | null;
  paidInterest: number | null;
  penalty: number | null;
}

export function committedInterest(): number {
  return Math.max(0, Number(getProtocolValue(COMMITTED_KEY) ?? '0'));
}

/**
 * BNTY in the emission reserve right now.
 *
 * Mirrors protocolOverview's figure exactly: the reserve is what was pre-minted
 * for rewards, less everything emitted, plus the reserve share of in-game
 * spends routed back into it.
 */
export function reserveBalance(): number {
  const counters = protocolCounters();
  return Math.max(0, EMISSION_RESERVE - counters.emitted + counters.reserve);
}

/** Reserve that is not already spoken for by an open contract. */
export function uncommittedReserve(): number {
  return Math.max(0, reserveBalance() - committedInterest());
}

export function findTerm(days: unknown): StakeTerm {
  const term = STAKE_TERMS.find((candidate) => candidate.days === Number(days));
  if (!term) {
    throw new GameError(
      `term must be one of ${STAKE_TERMS.map((t) => `${t.days}d`).join(', ')}`,
      400
    );
  }
  return term;
}

function toPosition(row: StakeRow, now: number): StakePosition {
  const elapsed = Math.max(0, Math.min(now, row.matures_at) - row.opened_at);
  const full = row.matures_at - row.opened_at;
  const accruedInterest = full > 0 ? row.term_interest * (elapsed / full) : 0;
  const matured = now >= row.matures_at;
  const closed = row.status === 'closed';

  // Early exit forfeits interest entirely and takes a bite of principal, so the
  // value of closing now is strictly below the principal until maturity.
  const earlyExitPenalty = closed || matured
    ? 0
    : row.principal * (STAKE_EARLY_EXIT_PENALTY_BPS / 10_000);
  const closeValueNow = closed
    ? (row.paid_principal ?? 0) + (row.paid_interest ?? 0)
    : matured
      ? row.principal + row.term_interest
      : row.principal - earlyExitPenalty;

  return {
    id: row.id,
    principal: row.principal,
    termDays: row.term_days,
    aprBps: row.apr_bps,
    openedAt: row.opened_at,
    maturesAt: row.matures_at,
    status: closed ? 'closed' : 'active',
    termInterest: row.term_interest,
    accruedInterest,
    matured,
    closeValueNow,
    earlyExitPenalty,
    closedAt: row.closed_at,
    paidPrincipal: row.paid_principal,
    paidInterest: row.paid_interest,
    penalty: row.penalty,
  };
}

export function stakePositions(wallet: string) {
  const now = Date.now();
  const rows = getDb()
    .prepare(
      `SELECT * FROM stakes WHERE wallet = ?
        ORDER BY status = 'closed', matures_at ASC, opened_at DESC
        LIMIT 60`
    )
    .all(wallet) as unknown as StakeRow[];
  const positions = rows.map((row) => toPosition(row, now));
  const active = positions.filter((position) => position.status === 'active');

  return {
    positions,
    totals: {
      openContracts: active.length,
      lockedPrincipal: active.reduce((sum, p) => sum + p.principal, 0),
      accruedInterest: active.reduce((sum, p) => sum + p.accruedInterest, 0),
      maturityValue: active.reduce((sum, p) => sum + p.principal + p.termInterest, 0),
    },
  };
}

/** The published rate card, plus how much capacity the reserve can still back. */
export function stakeTerms() {
  const available = uncommittedReserve();
  return {
    terms: STAKE_TERMS.map((term) => ({
      days: term.days,
      aprBps: term.aprBps,
      label: term.label,
      /**
       * Largest principal this term could still accept. Derived from the
       * uncommitted reserve rather than advertised as unlimited, because the
       * interest on it has to be reservable at the moment of opening.
       *
       * Clamped to total supply: at a short term and a low rate the reserve can
       * arithmetically back interest on several times more BNTY than will ever
       * exist, and quoting that as available capacity would be a number nobody
       * could act on.
       */
      maxPrincipal: Math.min(
        TOTAL_SUPPLY,
        Math.floor(available / ((term.aprBps / 10_000) * (term.days / 365)))
      ),
    })),
    minPrincipal: STAKE_MIN_OSR,
    maxOpen: STAKE_MAX_OPEN,
    earlyExitPenaltyBps: STAKE_EARLY_EXIT_PENALTY_BPS,
    reserveBalance: reserveBalance(),
    committedInterest: committedInterest(),
    uncommittedReserve: available,
  };
}

/**
 * Open a contract.
 *
 * `settledOnChain` says the principal already moved on-chain to the treasury,
 * so the mirrored balance must not be debited a second time. Pre-token there is
 * no chain, and the mirrored balance is the ledger of record.
 */
export function openStake(
  wallet: string,
  amountBnty: number,
  termDays: number,
  opts: { settledOnChain?: boolean } = {}
) {
  const term = findTerm(termDays);
  const principal = Math.floor(amountBnty);
  if (!Number.isFinite(principal) || principal < STAKE_MIN_OSR) {
    throw new GameError(`minimum Note is ${STAKE_MIN_OSR.toLocaleString()} BNTY`, 400);
  }

  const db = getDb();
  const user = getOrCreateUser(wallet);

  const open = (
    db.prepare("SELECT COUNT(*) AS c FROM stakes WHERE wallet = ? AND status = 'active'").get(wallet) as { c: number }
  ).c;
  if (open >= STAKE_MAX_OPEN) {
    throw new GameError(`you already hold the maximum of ${STAKE_MAX_OPEN} open contracts`, 409);
  }

  if (!opts.settledOnChain && user.osr_balance < principal) {
    throw new GameError(
      `Not enough BNTY: need ${principal.toLocaleString()} (you have ${Math.floor(user.osr_balance).toLocaleString()}).`,
      400
    );
  }

  const interest = stakeTermInterest(principal, term);
  if (interest > uncommittedReserve()) {
    throw new GameError(
      'the emission reserve cannot cover the interest on a contract that size right now — try a smaller principal or a shorter term',
      409
    );
  }

  const now = Date.now();
  const maturesAt = now + term.days * DAY_MS;

  let stakeId: number;
  db.exec('BEGIN IMMEDIATE');
  try {
    if (!opts.settledOnChain) {
      // Guarded UPDATE rather than a read-then-write: two concurrent opens must
      // not both pass the balance check above and overdraw the account.
      const debited = db
        .prepare('UPDATE users SET osr_balance = osr_balance - ? WHERE wallet = ? AND osr_balance >= ?')
        .run(principal, wallet, principal);
      if (debited.changes === 0) throw new GameError('Not enough BNTY to open that Note.', 400);
    }
    const inserted = db
      .prepare(
        `INSERT INTO stakes
           (wallet, principal, term_days, apr_bps, term_interest, opened_at, matures_at, status)
         VALUES (?,?,?,?,?,?,?,'active')`
      )
      .run(wallet, principal, term.days, term.aprBps, interest, now, maturesAt);
    stakeId = Number(inserted.lastInsertRowid);

    // Reserve the interest inside the same transaction that creates the
    // contract. Doing it afterwards leaves a window where a crash produces a
    // promise with nothing backing it, and the reserve would then over-lend to
    // the next operator through the gap.
    setProtocolValue(COMMITTED_KEY, String(committedInterest() + interest));
    addLedger(wallet, 'stake_open', -principal, {
      termDays: term.days,
      aprBps: term.aprBps,
      interest,
      maturesAt,
    });
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  const row = db.prepare('SELECT * FROM stakes WHERE id = ?').get(stakeId) as unknown as StakeRow;
  recordQuestProgress(wallet, 'open_note');
  return { position: toPosition(row, now), ...stakePositions(wallet) };
}

export interface StakeClose {
  principal: number;
  interest: number;
  penalty: number;
  payout: number;
  matured: boolean;
}

/**
 * Close a contract and work out what it pays.
 *
 * Matured: principal plus the full term interest, drawn from the reserve.
 * Early: principal less the penalty, no interest at all. The penalty goes to the
 * treasury and the reserved interest is released back to the reserve, which is
 * why an early exit leaves the protocol strictly better off than it expected.
 *
 * The row is claimed with a conditional UPDATE before any money moves, so two
 * concurrent closes cannot both pay out the same contract.
 */
export function closeStake(
  wallet: string,
  stakeId: number,
  opts: { settledOnChain?: boolean } = {}
): StakeClose {
  const db = getDb();
  const row = db.prepare('SELECT * FROM stakes WHERE id = ?').get(stakeId) as unknown as StakeRow | undefined;
  if (!row) throw new GameError('contract not found', 404);
  if (row.wallet !== wallet) throw new GameError('that contract belongs to another operator', 403);
  if (row.status !== 'active') throw new GameError('that contract is already closed', 409);

  const now = Date.now();
  const matured = now >= row.matures_at;
  const interest = matured ? row.term_interest : 0;
  const penalty = matured ? 0 : row.principal * (STAKE_EARLY_EXIT_PENALTY_BPS / 10_000);
  const principalBack = row.principal - penalty;
  const payout = principalBack + interest;

  db.exec('BEGIN IMMEDIATE');
  try {
    const claimed = db
      .prepare(
        `UPDATE stakes
            SET status = 'closed', closed_at = ?, paid_principal = ?, paid_interest = ?, penalty = ?
          WHERE id = ? AND status = 'active'`
      )
      .run(now, principalBack, interest, penalty, stakeId);
    if (claimed.changes === 0) throw new GameError('that contract is already closed', 409);

    // Pre-token the payout lands in the mirrored balance. On-chain, the caller
    // transfers it from the treasury after this returns, so the balance is left
    // alone and only the accounting below runs.
    if (!opts.settledOnChain) {
      db.prepare('UPDATE users SET osr_balance = osr_balance + ? WHERE wallet = ?').run(payout, wallet);
    }

    // All of the accounting rides on the same transaction as the close, so a
    // crash cannot leave the contract settled while the reserve still believes
    // its interest is committed — or the reverse.
    //
    // The commitment is released whether or not interest was actually paid: an
    // early exit pays none, which hands the whole reserved amount back.
    setProtocolValue(COMMITTED_KEY, String(Math.max(0, committedInterest() - row.term_interest)));
    // Interest paid is emission leaving the reserve; the penalty is treasury income.
    if (interest > 0) bumpProtocolCounter('emitted', interest);
    if (penalty > 0) bumpProtocolCounter('treasury', penalty);
    addLedger(wallet, matured ? 'stake_mature' : 'stake_early_exit', payout, {
      stakeId,
      principal: row.principal,
      interest,
      penalty,
    });
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  return { principal: principalBack, interest, penalty, payout, matured };
}
