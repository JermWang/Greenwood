'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import PageShell from '@/components/ui/PageShell';
import { api, type ProtocolOverview } from '@/lib/api-client';
import { useOperation } from '@/lib/useOperation';
import { CHAIN, TOKEN_LIVE } from '@/lib/config';

interface ReserveRow {
  walletLabel: string;
  walletAddress: string;
  assetSymbol: string;
  balanceUi: number;
}

interface TreasuryEvent {
  id: number;
  createdAt: number;
  eventType: string;
  walletLabel: string;
  amount: number;
  assetSymbol: string;
}

const compact = (value: number | undefined) => value == null ? '—' : new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 2 }).format(value);

/** Coarse countdown to the next halving — cycles run for weeks. */
function halvingCountdown(target: number, now: number): string {
  const ms = target - now;
  if (ms <= 0) return 'Due now';
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  return days > 0 ? `${days}d ${hours}h` : `${hours}h ${minutes}m`;
}

export default function VaultPage() {
  const op = useOperation((state) => state.op);
  const [overview, setOverview] = useState<ProtocolOverview | null>(null);
  const [reserves, setReserves] = useState<ReserveRow[]>([]);
  const [events, setEvents] = useState<TreasuryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Ticks the halving countdown without re-fetching. A minute is finer than the
  // display needs at day/hour resolution, and costs one render.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ov, rs, ev] = await Promise.all([api.overview(), api.reserves(), api.treasuryEvents(50)]);
      setOverview(ov);
      setReserves(rs);
      setEvents(ev as unknown as TreasuryEvent[]);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'API unreachable';
      setError(message.startsWith('429') ? 'Data feed is saturated. Retry in a moment.' : message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const reserveFill = useMemo(() => {
    if (!overview) return 0;
    const reserve = Math.max(0, overview.bntyReserveBalance ?? 0);
    const retired = Math.max(0, overview.totalBntyBurned ?? 0);
    return reserve + retired > 0 ? reserve / (reserve + retired) : 0;
  }, [overview]);

  const countdown = overview ? halvingCountdown(overview.halving.nextHalvingMs, now) : '—';
  const share = op && op.networkGrowPower > 0 ? op.growPower / op.networkGrowPower : null;

  return (
    <PageShell title="The Vault" subtitle="Inspect the emission chamber, custody cells, and every network flow from one proof-of-reserve console." maxWidth="max-w-[1500px]">
      {loading && !overview ? (
        <div className="gw-loading-deck"><span className="gw-loading-scan" /><p className="font-mono text-[10px] uppercase tracking-[.25em] text-emerald-200">Reading reserve ledger</p></div>
      ) : error ? (
        <div className="gw-system-alert is-error"><span>VAULT</span><p>{error}</p><button className="btn-secondary ml-auto" onClick={() => void load()}>Retry link</button></div>
      ) : (
        <div className="treasury-layout">
          <section className="treasury-reactor">
            <div className="treasury-reactor-copy">
              <span className="gw-scene-kicker">EMISSION CHAMBER / LIVE</span>
              <h2>{compact(overview?.bntyReserveBalance)} <small>BNTY</small></h2>
              <p>Unrouted network reserve</p>
              <div className="treasury-flow-legend">
                <span><i className="is-reserve" /> Reserve {Math.round(reserveFill * 100)}%</span>
                <span><i className="is-retired" /> Retired {Math.round((1 - reserveFill) * 100)}%</span>
              </div>
            </div>
            <div className="treasury-orbit" style={{ '--reserve-fill': `${reserveFill * 360}deg` } as CSSProperties}>
              <span className="treasury-orbit-ring is-a" />
              <span className="treasury-orbit-ring is-b" />
              <span className="treasury-orbit-core"><b>BNTY</b><small>RESERVE</small></span>
            </div>
          </section>

          <section className="treasury-signal-grid">
            <Signal code="BURN" label="BNTY permanently retired" value={compact(overview?.totalBntyBurned)} unit="BNTY" tone="lime" />
            <Signal code="DESKS" label="Active desks" value={String(overview?.totalNodes ?? 0)} unit="UNITS" tone="cobalt" />
            <Signal code="FLOW" label="Network yield output" value={overview?.networkProductionRate?.toFixed(3) ?? '—'} unit="BNTY/S" tone="cyan" />
          </section>

          <section className="treasury-network">
            <div className="gw-console-heading"><span>EMISSION SCHEDULE</span><span>CYCLE {String((overview?.halving.cycleIndex ?? 0) + 1).padStart(2, '0')}</span></div>
            <div className="treasury-halving">
              <div className="treasury-halving-copy">
                <span>Next halving</span>
                <b>{countdown}</b>
                <small>
                  {overview?.halving.currentRatePerSec.toFixed(3) ?? '—'} → {overview?.halving.nextRatePerSec.toFixed(3) ?? '—'} BNTY/sec
                </small>
              </div>
              {/* The bar is cycle progress, which is also how close the rate is
                  to halving — one number doing both jobs honestly. */}
              <div className="treasury-halving-bar">
                <i style={{ width: `${Math.min(100, (overview?.halving.cycleProgress ?? 0) * 100)}%` }} />
              </div>
            </div>

            <dl className="treasury-network-stats">
              <div>
                <dt>Reserve depth at current rate</dt>
                <dd>{overview && Number.isFinite(overview.reserveDaysAtCurrentRate) ? `${Math.round(overview.reserveDaysAtCurrentRate).toLocaleString()} d` : '—'}</dd>
                <small>Not a countdown — the rate halves, so this grows</small>
              </div>
              <div>
                <dt>Emitted to date</dt>
                <dd>{compact(overview?.totalEmitted)} <em>BNTY</em></dd>
                <small>Drawn from the reserve since genesis</small>
              </div>
              <div>
                <dt>Locked in Notes</dt>
                <dd>{compact(overview?.contracts.lockedPrincipal)} <em>BNTY</em></dd>
                <small>{overview?.contracts.open ?? 0} open · {compact(overview?.contracts.committedInterest)} BNTY promised</small>
              </div>
              <div>
                <dt>Your share of output</dt>
                <dd>{share == null ? '—' : `${(share * 100).toFixed(2)}%`}</dd>
                <small>{op ? `${op.growPower.toFixed(1)} of ${op.networkGrowPower.toFixed(1)} yield power` : 'Link a fund to see it'}</small>
              </div>
            </dl>
          </section>

          <section className="treasury-cells">
            <div className="gw-console-heading"><span>CUSTODY CELLS</span><span>{TOKEN_LIVE ? 'ON-CHAIN' : 'PRE-TOKEN'}</span></div>
            {reserves.length === 0 ? (
              <div className="treasury-empty">
                <span className="treasury-empty-icon">◇</span>
                <strong>{TOKEN_LIVE ? 'No balances returned' : 'Custody cells awaiting token launch'}</strong>
                <p>{TOKEN_LIVE ? 'The configured treasury returned no indexed assets.' : 'Protocol accounting is active; public chain balances appear here after BNTY launches.'}</p>
              </div>
            ) : (
              <div className="treasury-cell-grid">
                {reserves.map((row, index) => (
                  <article key={row.walletAddress} className="treasury-cell">
                    <div className="treasury-cell-index">{String(index + 1).padStart(2, '0')}</div>
                    <div><span>{row.walletLabel}</span><strong>{row.balanceUi.toLocaleString()} <small>{row.assetSymbol}</small></strong><code>{row.walletAddress.slice(0, 10)}…{row.walletAddress.slice(-6)}</code></div>
                    <a href={`${CHAIN.explorer}/address/${row.walletAddress}`} target="_blank" rel="noreferrer" aria-label={`Inspect ${row.walletLabel} on explorer`}>↗</a>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="treasury-events">
            <div className="gw-console-heading"><span>FLOW LEDGER</span><span>{events.length} SIGNALS</span></div>
            <div className="treasury-event-stream">
              {events.length === 0 ? <p className="treasury-event-empty">No indexed treasury movement yet.</p> : events.map((event) => (
                <article key={event.id}>
                  <time>{new Date(event.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
                  <span className="treasury-event-pulse" />
                  <div><strong>{event.eventType.replaceAll('_', ' ')}</strong><small>{event.walletLabel}</small></div>
                  <b>{event.amount.toLocaleString()} <small>{event.assetSymbol}</small></b>
                </article>
              ))}
            </div>
          </section>

          <footer className="treasury-proof">
            <span className="network-pulse" />
            <p><strong>Proof path</strong> Balances read directly from {CHAIN.name} JSON-RPC. Only indexed contract logs enter this flow ledger; local simulation records are never represented as chain activity.</p>
            <button type="button" onClick={() => void load()}>{loading ? 'Syncing…' : 'Refresh proof'}</button>
          </footer>
        </div>
      )}
    </PageShell>
  );
}

function Signal({ code, label, value, unit, tone }: { code: string; label: string; value: string; unit: string; tone: 'lime' | 'cobalt' | 'cyan' }) {
  return <article className={`treasury-signal is-${tone}`}><span>{code}</span><strong>{value}</strong><small>{unit}</small><p>{label}</p></article>;
}
