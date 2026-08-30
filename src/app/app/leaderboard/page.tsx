'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import PageShell from '@/components/ui/PageShell';
import { api } from '@/lib/api-client';
import { getBrowserSupabase } from '@/lib/supabase-browser';

type Metric = 'compound_level' | 'total_produced' | 'total_burned';
interface Row { rank: number; wallet: string; displayName?: string | null; online?: boolean; compoundLevel?: number; maxLevel: number; sumLevel: number; totalProduced: number; totalBurned: number; }

const METRICS: Array<{ key: Metric; label: string; unit: string; description: string }> = [
  { key: 'compound_level', label: 'Portfolio tier', unit: 'TIER', description: 'Portfolio progression and installed capacity' },
  { key: 'total_produced', label: 'BNTY output', unit: 'BNTY', description: 'Lifetime BNTY routed through desks' },
  { key: 'total_burned', label: 'BNTY retired', unit: 'BNTY', description: 'Token permanently removed while expanding your fund' },
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
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Leaderboard data unavailable'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(metric); }, [metric, load]);
  useEffect(() => {
    const supabase = getBrowserSupabase();
    if (!supabase) { const timer = window.setInterval(() => void load(metric), 30_000); return () => window.clearInterval(timer); }
    const channel = supabase.channel('eg-standings').on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => void load(metric)).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [metric, load]);

  const activeMetric = METRICS.find((item) => item.key === metric)!;
  const topValue = Math.max(1, ...rows.map((row) => valueFor(row, metric)));
  const podium = useMemo(() => [rows[1], rows[0], rows[2]].filter(Boolean) as Row[], [rows]);

  return (
    <PageShell title="Leaderboard" subtitle="A live ranking of the funds turning capital, treasury capacity, and instruments into network share." maxWidth="max-w-[1500px]">
      <div className="race-console">
        <section className="race-control-strip">
          <div><span className="network-pulse" /><strong>LIVE STANDINGS</strong><small>{rows.length} FUNDS INDEXED</small></div>
          <nav aria-label="Leaderboard metric">
            {METRICS.map((item) => <button key={item.key} onClick={() => setMetric(item.key)} className={metric === item.key ? 'is-active' : ''}><span>{item.label}</span><small>{item.unit}</small></button>)}
          </nav>
        </section>

        <section className="race-hero">
          <div className="race-hero-copy"><span className="eg-scene-kicker">ACTIVE RANKING</span><h2>{activeMetric.label}</h2><p>{activeMetric.description}</p></div>
          <div className="race-desk-mark"><span /><b>01</b><small>LEAD</small></div>
        </section>

        {error && <div className="eg-system-alert is-error"><span>BOARD</span><p>{error}</p></div>}
        {loading && rows.length === 0 ? <div className="eg-loading-deck"><span className="eg-loading-scan" /><p>Loading standings…</p></div> : (
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
              <div className="eg-console-heading"><span>NETWORK FIELD</span><span>TOP 100 / AUTO REFRESH</span></div>
              {rows.length === 0 ? <div className="race-empty">No fund has entered this ranking yet.</div> : rows.slice(3, 100).map((row) => {
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
