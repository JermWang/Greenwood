'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import PageShell from '@/components/ui/PageShell';
import { api, type ProtocolOverview } from '@/lib/api-client';
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

export default function VaultPage() {
  const [overview, setOverview] = useState<ProtocolOverview | null>(null);
  const [reserves, setReserves] = useState<ReserveRow[]>([]);
  const [events, setEvents] = useState<TreasuryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      setError(message.startsWith('429') ? 'Telemetry bus is saturated. Retry in a moment.' : message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const reserveFill = useMemo(() => {
    if (!overview) return 0;
    const reserve = Math.max(0, overview.osrReserveBalance ?? 0);
    const retired = Math.max(0, overview.totalOsrBurned ?? 0);
    return reserve + retired > 0 ? reserve / (reserve + retired) : 0;
  }, [overview]);

  return (
    <PageShell title="Treasury Core" subtitle="Inspect the emission chamber, custody cells, and every network flow from one proof-of-reserve console." maxWidth="max-w-[1500px]">
      {loading && !overview ? (
        <div className="fab-loading-deck"><span className="fab-loading-scan" /><p className="font-mono text-[10px] uppercase tracking-[.25em] text-cyan-200">Reading reserve lattice</p></div>
      ) : error ? (
        <div className="fab-system-alert is-error"><span>CORE</span><p>{error}</p><button className="btn-secondary ml-auto" onClick={() => void load()}>Retry link</button></div>
      ) : (
        <div className="treasury-layout">
          <section className="treasury-reactor">
            <div className="treasury-reactor-copy">
              <span className="fab-scene-kicker">EMISSION CHAMBER / LIVE</span>
              <h2>{compact(overview?.osrReserveBalance)} <small>GPU</small></h2>
              <p>Unrouted network reserve</p>
              <div className="treasury-flow-legend">
                <span><i className="is-reserve" /> Reserve {Math.round(reserveFill * 100)}%</span>
                <span><i className="is-retired" /> Retired {Math.round((1 - reserveFill) * 100)}%</span>
              </div>
            </div>
            <div className="treasury-orbit" style={{ '--reserve-fill': `${reserveFill * 360}deg` } as CSSProperties}>
              <span className="treasury-orbit-ring is-a" />
              <span className="treasury-orbit-ring is-b" />
              <span className="treasury-orbit-core"><b>GPU</b><small>RESERVE</small></span>
            </div>
          </section>

          <section className="treasury-signal-grid">
            <Signal code="BURN" label="GPU permanently retired" value={compact(overview?.totalOsrBurned)} unit="GPU" tone="lime" />
            <Signal code="LINES" label="Active process lines" value={String(overview?.totalNodes ?? 0)} unit="UNITS" tone="cobalt" />
            <Signal code="FLOW" label="Network silicon output" value={overview?.networkProductionRate?.toFixed(3) ?? '—'} unit="GPU/S" tone="cyan" />
          </section>

          <section className="treasury-cells">
            <div className="fab-console-heading"><span>CUSTODY CELLS</span><span>{TOKEN_LIVE ? 'ON-CHAIN' : 'PRE-TOKEN'}</span></div>
            {reserves.length === 0 ? (
              <div className="treasury-empty">
                <span className="treasury-empty-icon">◇</span>
                <strong>{TOKEN_LIVE ? 'No balances returned' : 'Custody cells awaiting token launch'}</strong>
                <p>{TOKEN_LIVE ? 'The configured treasury returned no indexed assets.' : 'Protocol accounting is active; public chain balances appear here after GPU launches.'}</p>
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
            <div className="fab-console-heading"><span>FLOW LEDGER</span><span>{events.length} SIGNALS</span></div>
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
