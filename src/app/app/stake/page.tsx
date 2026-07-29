'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Lock, LockOpen, Vault as VaultIcon, Warning } from '@phosphor-icons/react';
import PageShell from '@/components/ui/PageShell';
import {
  api,
  type StakePosition,
  type StakeRates,
  type StakeTotals,
  type StepHandler,
} from '@/lib/api-client';
import { useOperation } from '@/lib/useOperation';

const bnty = (value: number, digits = 0) =>
  value.toLocaleString(undefined, { maximumFractionDigits: digits });

const pct = (bps: number) => `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)}%`;

/** Coarse countdown — a contract runs for months, so seconds are noise. */
function remaining(ms: number): string {
  if (ms <= 0) return 'Matured';
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  if (days > 0) return `${days}d ${hours}h`;
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  return `${hours}h ${minutes}m`;
}

export default function StakePage() {
  const wallet = useOperation((state) => state.wallet);
  const op = useOperation((state) => state.op);
  const refresh = useOperation((state) => state.refresh);

  const [positions, setPositions] = useState<StakePosition[]>([]);
  const [totals, setTotals] = useState<StakeTotals | null>(null);
  const [rates, setRates] = useState<StakeRates | null>(null);
  const [termDays, setTermDays] = useState<number | null>(null);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState<number | 'open' | null>(null);
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!wallet) {
      // Signed out, the rate card is still public and worth showing.
      try {
        setRates(await api.stakeTerms());
      } catch {
        /* the gate below already explains there is nothing to show */
      }
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const result = await api.stakes(wallet);
      setPositions(result.positions);
      setTotals(result.totals);
      setRates(result.rates);
      setTermDays((current) => current ?? result.rates.terms[0]?.days ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not reach the vault');
    } finally {
      setLoading(false);
    }
  }, [wallet]);

  useEffect(() => { void load(); }, [load]);

  const balance = op?.bntyBalance ?? 0;
  const term = useMemo(
    () => rates?.terms.find((candidate) => candidate.days === termDays) ?? null,
    [rates, termDays]
  );

  const principal = Math.floor(Number(amount) || 0);
  const projectedInterest = term ? principal * (term.aprBps / 10_000) * (term.days / 365) : 0;

  const blocker = (() => {
    if (!term) return 'Pick a term';
    if (!principal) return null;
    if (rates && principal < rates.minPrincipal) return `Minimum ${bnty(rates.minPrincipal)} BNTY`;
    if (principal > balance) return 'More than your balance';
    if (principal > term.maxPrincipal) return 'Beyond what the reserve can back right now';
    return null;
  })();

  const open = async () => {
    if (!wallet || !term || !principal || blocker) return;
    setBusy('open');
    setError(null);
    setNotice(null);
    try {
      const onStep: StepHandler = (phase) => setStep(phase);
      const result = await api.openStake(wallet, principal, term.days, onStep);
      setPositions(result.positions);
      setTotals(result.totals);
      setAmount('');
      setNotice(`Locked ${bnty(principal)} BNTY for ${term.days} days.`);
      await Promise.all([load(), refresh()]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not open that Note');
    } finally {
      setBusy(null);
      setStep(null);
    }
  };

  const close = async (position: StakePosition) => {
    if (!wallet) return;
    setBusy(position.id);
    setError(null);
    setNotice(null);
    try {
      const result = await api.closeStake(wallet, position.id);
      setPositions(result.positions);
      setTotals(result.totals);
      setNotice(
        result.result.matured
          ? `Note matured. ${bnty(result.result.payout)} BNTY returned, including ${bnty(result.result.interest)} interest.`
          : `Closed early. ${bnty(result.result.payout)} BNTY returned after a ${bnty(result.result.penalty)} BNTY penalty.`
      );
      await Promise.all([load(), refresh()]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not close that Note');
    } finally {
      setBusy(null);
    }
  };

  if (!wallet) {
    return (
      <PageShell title="Fixed Income" subtitle="Lock BNTY for a fixed term and draw a published rate from the emission reserve.">
        <section className="gw-floor-gate">
          <VaultIcon size={38} weight="duotone" />
          <h1>Link a fund.</h1>
          <p>Notes are held against a wallet. Connect one to open a position, or read the current rate card below.</p>
          <div><Link href="/start" className="btn-primary">Link fund</Link></div>
        </section>
        {rates && <RateCard rates={rates} />}
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Fixed Income"
      subtitle="Lock BNTY for a fixed term and draw a published rate from the emission reserve. Rates are fixed when a Note opens and never move underneath it."
      maxWidth="max-w-[1500px]"
    >
      {error && <div className="gw-system-alert is-error"><span>VAULT</span><p>{error}</p></div>}
      {notice && <div className="gw-system-alert"><span>VAULT</span><p>{notice}</p></div>}

      <div className="stake-layout">
        <section className="stake-open panel">
          <div className="gw-console-heading"><span>OPEN A NOTE</span><span>{bnty(balance)} BNTY AVAILABLE</span></div>

          <div className="stake-terms">
            {rates?.terms.map((candidate) => (
              <button
                key={candidate.days}
                type="button"
                className={`stake-term ${candidate.days === termDays ? 'is-active' : ''}`}
                onClick={() => setTermDays(candidate.days)}
              >
                <span>{candidate.label}</span>
                <b>{pct(candidate.aprBps)}</b>
                <small>{candidate.days} days · APR</small>
              </button>
            ))}
          </div>

          <label className="stake-amount">
            <span>Principal</span>
            <input
              type="number"
              inputMode="numeric"
              min={rates?.minPrincipal ?? 100}
              placeholder={`${bnty(rates?.minPrincipal ?? 100)} minimum`}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
            <button type="button" onClick={() => setAmount(String(Math.floor(balance)))}>Max</button>
          </label>

          {term && principal > 0 && (
            <dl className="stake-projection">
              <div><dt>Interest at maturity</dt><dd>{bnty(projectedInterest)} BNTY</dd></div>
              <div><dt>Returned at maturity</dt><dd>{bnty(principal + projectedInterest)} BNTY</dd></div>
              <div className="is-warn">
                <dt>If closed early</dt>
                <dd>{bnty(principal - principal * ((rates?.earlyExitPenaltyBps ?? 1000) / 10_000))} BNTY</dd>
              </div>
            </dl>
          )}

          <button type="button" className="btn-primary stake-submit" onClick={() => void open()} disabled={busy === 'open' || !principal || Boolean(blocker)}>
            <Lock size={15} weight="duotone" />
            {busy === 'open' ? (step ? `${step}…` : 'Opening…') : blocker ?? `Lock ${principal ? bnty(principal) : ''} BNTY`}
          </button>

          {rates && (
            <p className="stake-note">
              <Warning size={13} weight="duotone" />
              Closing before maturity forfeits all interest and returns {pct(10_000 - rates.earlyExitPenaltyBps)} of principal.
              The rest goes to the treasury.
            </p>
          )}
        </section>

        <section className="stake-positions">
          <div className="gw-console-heading">
            <span>YOUR NOTES</span>
            <span>{totals?.openContracts ?? 0} OPEN · {bnty(totals?.lockedPrincipal ?? 0)} BNTY LOCKED</span>
          </div>

          {loading && positions.length === 0 ? (
            <p className="stake-empty">Reading positions…</p>
          ) : positions.length === 0 ? (
            <p className="stake-empty">No Notes yet. Lock BNTY on the left to start earning from the reserve.</p>
          ) : (
            <div className="stake-list">
              {positions.map((position) => {
                const left = position.maturesAt - Date.now();
                return (
                  <article key={position.id} className={`stake-row ${position.status === 'closed' ? 'is-closed' : position.matured ? 'is-matured' : ''}`}>
                    <div className="stake-row-head">
                      <b>{bnty(position.principal)} <small>BNTY</small></b>
                      <span>{position.termDays}d · {pct(position.aprBps)} APR</span>
                    </div>
                    <div className="stake-row-meter">
                      <i style={{ width: `${Math.min(100, Math.max(0, ((Date.now() - position.openedAt) / (position.maturesAt - position.openedAt)) * 100))}%` }} />
                    </div>
                    <div className="stake-row-stats">
                      {position.status === 'closed' ? (
                        <>
                          <span>Closed</span>
                          <b>{bnty((position.paidPrincipal ?? 0) + (position.paidInterest ?? 0))} BNTY returned</b>
                        </>
                      ) : (
                        <>
                          <span>{position.matured ? 'Matured' : remaining(left)}</span>
                          <b>{bnty(position.accruedInterest, 2)} / {bnty(position.termInterest, 2)} BNTY interest</b>
                        </>
                      )}
                    </div>
                    {position.status === 'active' && (
                      <button type="button" className={position.matured ? 'btn-primary' : 'btn-secondary'} onClick={() => void close(position)} disabled={busy === position.id}>
                        <LockOpen size={14} weight="duotone" />
                        {busy === position.id
                          ? 'Closing…'
                          : position.matured
                            ? `Collect ${bnty(position.closeValueNow)} BNTY`
                            : `Exit early · −${bnty(position.earlyExitPenalty)} BNTY`}
                      </button>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {rates && <RateCard rates={rates} />}
      </div>
    </PageShell>
  );
}

/**
 * Reserve capacity readout.
 *
 * Shown to signed-out visitors too, because the honest version of "what rate
 * can I get" includes how much of the reserve is already promised to somebody
 * else — a rate card without it would advertise capacity that does not exist.
 */
function RateCard({ rates }: { rates: StakeRates }) {
  const committedShare = rates.reserveBalance > 0 ? rates.committedInterest / rates.reserveBalance : 0;
  return (
    <section className="stake-capacity panel">
      <div className="gw-console-heading"><span>RESERVE CAPACITY</span><span>LIVE</span></div>
      <div className="stake-capacity-bar"><i style={{ width: `${Math.min(100, committedShare * 100)}%` }} /></div>
      <dl>
        <div><dt>Emission reserve</dt><dd>{bnty(rates.reserveBalance)} BNTY</dd></div>
        <div><dt>Promised to open Notes</dt><dd>{bnty(rates.committedInterest)} BNTY</dd></div>
        <div><dt>Free to back new Notes</dt><dd>{bnty(rates.uncommittedReserve)} BNTY</dd></div>
      </dl>
      <p className="stake-note">
        Every Note&rsquo;s full interest is reserved the moment it opens, so the protocol never promises
        BNTY it does not already hold.
      </p>
    </section>
  );
}
