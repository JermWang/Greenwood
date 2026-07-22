'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import PageShell from '@/components/ui/PageShell';
import { api } from '@/lib/api-client';
import { getBrowserSupabase } from '@/lib/supabase-browser';

type Metric = 'compound_level' | 'total_produced' | 'total_burned';
interface Row { rank: number; wallet: string; displayName?: string | null; online?: boolean; compoundLevel?: number; maxLevel: number; sumLevel: number; totalProduced: number; totalBurned: number; }

const METRICS: Array<{ key: Metric; label: string; unit: string; description: string }> = [
  { key: 'compound_level', label: 'Campus tier', unit: 'TIER', description: 'Warehouse progression and installed capacity' },
  { key: 'total_produced', label: 'Silicon output', unit: 'GPU', description: 'Lifetime GPU routed through production lines' },
  { key: 'total_burned', label: 'GPU retired', unit: 'GPU', description: 'Token permanently removed while expanding fabs' },
];
const valueFor = (row: Row, metric: Metric) => metric === 'total_produced' ? row.totalProduced : metric === 'total_burned' ? row.totalBurned : row.compoundLevel ?? row.maxLevel;
const operatorName = (row: Row) => row.displayName?.trim() || `${row.wallet.slice(0, 7)}…${row.wallet.slice(-4)}`;

export default function LeaderboardPage() {
  const [metric, setMetric] = useState<Metric>('compound_level');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async (nextMetric: Metric) => {
    setLoading(true); setError(null);
    try { setRows((await api.leaderboard(nextMetric)) as Row[]); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Race telemetry unavailable'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(metric); }, [metric, load]);
  useEffect(() => {
    const supabase = getBrowserSupabase();
    if (!supabase) { const timer = window.setInterval(() => void load(metric), 30_000); return () => window.clearInterval(timer); }
    const channel = supabase.channel('gpu-silicon-race').on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => void load(metric)).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [metric, load]);

  const activeMetric = METRICS.find((item) => item.key === metric)!;
  const topValue = Math.max(1, ...rows.map((row) => valueFor(row, metric)));
  const podium = useMemo(() => [rows[1], rows[0], rows[2]].filter(Boolean) as Row[], [rows]);

  return (
    <PageShell title="Silicon Race" subtitle="A live circuit of the campuses turning capital, cleanroom capacity, and process equipment into network share." maxWidth="max-w-[1500px]">
      <div className="race-console">
        <section className="race-control-strip">
          <div><span className="network-pulse" /><strong>RACE TELEMETRY LIVE</strong><small>{rows.length} CAMPUSES INDEXED</small></div>
          <nav aria-label="Race metric">
            {METRICS.map((item) => <button key={item.key} onClick={() => setMetric(item.key)} className={metric === item.key ? 'is-active' : ''}><span>{item.label}</span><small>{item.unit}</small></button>)}
          </nav>
        </section>

        <section className="race-hero">
          <div className="race-hero-copy"><span className="fab-scene-kicker">ACTIVE CLASSIFICATION</span><h2>{activeMetric.label}</h2><p>{activeMetric.description}</p></div>
          <div className="race-wafer-mark"><span /><b>01</b><small>POLE</small></div>
        </section>

        {error && <div className="fab-system-alert is-error"><span>RACE</span><p>{error}</p></div>}
        {loading && rows.length === 0 ? <div className="fab-loading-deck"><span className="fab-loading-scan" /><p>Calibrating race lanes…</p></div> : (
          <>
            {podium.length > 0 && (
              <section className="race-podium-deck">
                {podium.map((row) => (
                  <article key={row.rank} className={`race-podium-block is-${row.rank}`}>
                    <span className="race-podium-rank">{String(row.rank).padStart(2, '0')}</span>
                    <div className="race-podium-avatar">{operatorName(row).slice(0, 1).toUpperCase()}<i className={row.online ? 'is-online' : ''} /></div>
                    <strong>{operatorName(row)}</strong>
                    <small>{row.wallet.slice(0, 6)}…{row.wallet.slice(-4)}</small>
                    <b>{valueFor(row, metric).toLocaleString(undefined, { maximumFractionDigits: 2 })} <em>{activeMetric.unit}</em></b>
                    <div className="race-podium-base"><span /></div>
                  </article>
                ))}
              </section>
            )}

            <section className="race-lanes">
              <div className="fab-console-heading"><span>NETWORK FIELD</span><span>TOP 100 / AUTO REFRESH</span></div>
              {rows.length === 0 ? <div className="race-empty">No campus has entered this classification yet.</div> : rows.slice(3, 100).map((row) => {
                const progress = Math.max(3, valueFor(row, metric) / topValue * 100);
                return (
                  <article key={row.rank} className="race-lane">
                    <span className="race-lane-rank">{String(row.rank).padStart(2, '0')}</span>
                    <div className="race-lane-operator"><i className={row.online ? 'is-online' : ''} /><strong>{operatorName(row)}</strong><small>MAX L{row.maxLevel} · TOTAL L{row.sumLevel}</small></div>
                    <div className="race-lane-track"><span style={{ width: `${progress}%` }}><i /></span></div>
                    <b>{valueFor(row, metric).toLocaleString(undefined, { maximumFractionDigits: 2 })}<small>{activeMetric.unit}</small></b>
                    <div className="race-lane-matrix"><span>{row.totalProduced.toFixed(1)} output</span><span>{row.totalBurned.toLocaleString()} retired</span></div>
                  </article>
                );
              })}
            </section>
          </>
        )}
      </div>
    </PageShell>
  );
}
