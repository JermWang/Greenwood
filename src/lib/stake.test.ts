// Capacity contract coverage: the interest math, the reserve solvency rule that
// stops the vault promising GPU it does not hold, and the two ways a contract
// can end.
//
// Each run gets its own SQLite file via OSR_DATA_DIR so tests never touch the
// developer's local data/ directory or each other's state.
import { describe, test, expect, beforeEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'gpu-stake-test-'));
process.env.OSR_DATA_DIR = DATA_DIR;
delete process.env.VERCEL;

const { openStake, closeStake, stakePositions, stakeTerms, committedInterest } = await import('./stake');
const { getOrCreateUser } = await import('./game');
const { getDb, setProtocolValue } = await import('./db');
const { STAKE_MIN_OSR, STAKE_MAX_OPEN, STAKE_TERMS, TOTAL_SUPPLY, stakeTermInterest } =
  await import('./economy');

const wallet = (n: number) => `0x${String(n).padStart(40, '0')}`;
const fund = (w: string, amount: number) => {
  getOrCreateUser(w);
  getDb().prepare('UPDATE users SET osr_balance = ? WHERE wallet = ?').run(amount, w);
};
const balanceOf = (w: string) =>
  (getDb().prepare('SELECT osr_balance AS b FROM users WHERE wallet = ?').get(w) as { b: number }).b;
/** Pull a contract's maturity into the past so it can be collected without waiting. */
const mature = (id: number) =>
  getDb().prepare('UPDATE stakes SET matures_at = ? WHERE id = ?').run(Date.now() - 1000, id);

beforeEach(() => {
  const db = getDb();
  db.exec('DELETE FROM stakes');
  db.exec('DELETE FROM users');
  db.exec('DELETE FROM ledger');
  setProtocolValue('stakeCommitted', '0');
  setProtocolValue('emitted', '0');
  setProtocolValue('treasury', '0');
  setProtocolValue('reserve', '0');
});

const TERM = STAKE_TERMS[0];

describe('opening a contract', () => {
  test('debits the principal and reserves the full term interest up front', () => {
    const w = wallet(1);
    fund(w, 10_000);
    const before = committedInterest();

    const { position } = openStake(w, 5_000, TERM.days);

    expect(balanceOf(w)).toBe(5_000);
    expect(position.principal).toBe(5_000);
    expect(position.aprBps).toBe(TERM.aprBps);
    // The whole term's interest is committed at open, not accrued over time —
    // that is what makes the solvency check meaningful.
    expect(position.termInterest).toBeCloseTo(stakeTermInterest(5_000, TERM), 6);
    expect(committedInterest() - before).toBeCloseTo(position.termInterest, 6);
  });

  test('refuses a principal the wallet cannot cover', () => {
    const w = wallet(2);
    fund(w, 100);
    expect(() => openStake(w, 5_000, TERM.days)).toThrow(/Not enough BNTY/);
  });

  test('refuses a term that is not on the published rate card', () => {
    const w = wallet(3);
    fund(w, 10_000);
    // Otherwise a crafted request could name its own APR by naming its own term.
    expect(() => openStake(w, 1_000, 45)).toThrow(/term must be one of/);
  });

  test('refuses anything under the minimum', () => {
    const w = wallet(4);
    fund(w, 10_000);
    expect(() => openStake(w, STAKE_MIN_OSR - 1, TERM.days)).toThrow(/minimum Note/);
  });

  test('caps how many contracts one operator may hold open', () => {
    const w = wallet(5);
    fund(w, 1_000_000);
    for (let i = 0; i < STAKE_MAX_OPEN; i += 1) openStake(w, 1_000, TERM.days);
    expect(() => openStake(w, 1_000, TERM.days)).toThrow(/maximum of/);
  });

  test('refuses a contract the reserve cannot back', () => {
    const w = wallet(6);
    fund(w, 1_000_000_000);
    // Drain the reserve by claiming almost all of it has already been emitted.
    const { reserveBalance } = stakeTerms();
    setProtocolValue('emitted', String(Number(reserveBalance) * 2));
    expect(() => openStake(w, 1_000_000, TERM.days)).toThrow(/emission reserve cannot cover/);
  });
});

describe('closing a contract', () => {
  test('at maturity returns principal plus the full interest', () => {
    const w = wallet(7);
    fund(w, 10_000);
    const { position } = openStake(w, 4_000, TERM.days);
    mature(position.id);

    const result = closeStake(w, position.id);

    expect(result.matured).toBe(true);
    expect(result.penalty).toBe(0);
    expect(result.interest).toBeCloseTo(position.termInterest, 6);
    expect(balanceOf(w)).toBeCloseTo(6_000 + 4_000 + position.termInterest, 6);
    // The commitment is released once the contract is settled.
    expect(committedInterest()).toBeCloseTo(0, 6);
  });

  test('early forfeits all interest and takes a penalty out of principal', () => {
    const w = wallet(8);
    fund(w, 10_000);
    const { position } = openStake(w, 4_000, TERM.days);

    const result = closeStake(w, position.id);

    expect(result.matured).toBe(false);
    expect(result.interest).toBe(0);
    expect(result.penalty).toBeGreaterThan(0);
    expect(result.payout).toBeCloseTo(4_000 - result.penalty, 6);
    expect(balanceOf(w)).toBeCloseTo(6_000 + 4_000 - result.penalty, 6);
    // Reserved interest goes back to the pool even though none was paid.
    expect(committedInterest()).toBeCloseTo(0, 6);
  });

  test('cannot be closed twice', () => {
    const w = wallet(9);
    fund(w, 10_000);
    const { position } = openStake(w, 1_000, TERM.days);
    closeStake(w, position.id);
    expect(() => closeStake(w, position.id)).toThrow(/already closed/);
  });

  test('cannot be closed by another operator', () => {
    const owner = wallet(10);
    const stranger = wallet(11);
    fund(owner, 10_000);
    fund(stranger, 10_000);
    const { position } = openStake(owner, 1_000, TERM.days);
    expect(() => closeStake(stranger, position.id)).toThrow(/another operator/);
  });
});

describe('rate card', () => {
  test('caps advertised capacity at what the uncommitted reserve can back', () => {
    const w = wallet(12);
    fund(w, 1_000_000);
    const before = stakeTerms();
    openStake(w, 100_000, TERM.days);
    const after = stakeTerms();

    expect(after.committedInterest).toBeGreaterThan(before.committedInterest);
    expect(after.uncommittedReserve).toBeLessThan(before.uncommittedReserve);
    // Advertised headroom has to shrink alongside it, or the card would keep
    // offering capacity that is already spoken for.
    //
    // Measured on the longest term. The short terms are cheap enough that the
    // reserve can back interest on more principal than will ever be minted, so
    // their figure sits on the total-supply clamp and cannot move — which is the
    // clamp doing its job, not the headroom failing to shrink.
    const longest = STAKE_TERMS.length - 1;
    expect(after.terms[longest].maxPrincipal).toBeLessThan(before.terms[longest].maxPrincipal);
    expect(before.terms[0].maxPrincipal).toBeLessThanOrEqual(TOTAL_SUPPLY);
  });

  test('accrues interest proportionally while a contract is open', () => {
    const w = wallet(13);
    fund(w, 10_000);
    const { position } = openStake(w, 2_000, TERM.days);
    // Rewind the open date to halfway through the term.
    getDb()
      .prepare('UPDATE stakes SET opened_at = ? WHERE id = ?')
      .run(Date.now() - (TERM.days * 86_400_000) / 2, position.id);

    const { positions } = stakePositions(w);
    const live = positions.find((p) => p.id === position.id)!;
    expect(live.accruedInterest).toBeGreaterThan(0);
    expect(live.accruedInterest).toBeLessThan(live.termInterest);
    // Accrued interest is display-only: closing early still pays none of it.
    expect(live.closeValueNow).toBeLessThan(live.principal);
  });
});
