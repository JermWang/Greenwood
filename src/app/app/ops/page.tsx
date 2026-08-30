'use client';

import { useCallback, useEffect, useState } from 'react';
import PageShell from '@/components/ui/PageShell';
import { api, type UserOperation } from '@/lib/api-client';
import { useWalletStore } from '@/lib/store';

export default function OpsPage() {
  const wallet = useWalletStore((s) => s.wallet);
  const [op, setOp] = useState<UserOperation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!wallet) return;
    setLoading(true);
    setError(null);
    try {
      setOp(await api.operation(wallet));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'API unreachable');
    } finally {
      setLoading(false);
    }
  }, [wallet]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <PageShell title="Fund Analytics" subtitle="A diagnostic readout of every active desk, yield buffer, and fund constraint." maxWidth="max-w-[1440px]">
      {!wallet ? (
        <p className="text-sm text-steel-400">Connect your wallet to see your operations.</p>
      ) : loading && !op ? (
        <p className="text-sm text-steel-400">Loading…</p>
      ) : error ? (
        <div className="panel border-red-500/40 p-4 text-sm text-red-400">
          <p>Couldn&rsquo;t load your operations: {error}</p>
          <button type="button" className="btn-secondary mt-3 text-xs" onClick={() => void load()}>
            Retry
          </button>
        </div>
      ) : op ? (
        <div className="telemetry-layout">
          <section className="telemetry-overview">
            <div className="eg-console-heading"><span>FUND DIAGNOSTIC</span><span>LIVE</span></div>
            <div className="telemetry-gauges">
              <StatCard label="Desk occupancy" value={`${op.nodes.length}/${op.maxNodes}`} tone="lime" />
              <StatCard label="Fund tier" value={`0${op.level}`} tone="cobalt" />
              <StatCard label="BNTY / second" value={op.productionRate.toFixed(4)} tone="cyan" />
              <StatCard label="Lifetime output" value={op.totalProduced.toFixed(2)} tone="orange" />
            </div>
          </section>

          <section className="eg-console-card">
            <div className="eg-console-heading"><span>BUFFER ROUTING</span><span>{Object.keys(op.pending).length} ASSETS</span></div>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              {Object.entries(op.pending).length === 0 ? <p className="text-sm text-emerald-100/45">All yield buffers are clear.</p> : Object.entries(op.pending).map(([asset, amount]) => (
                <div key={asset} className="telemetry-buffer"><span>{asset}</span><strong>{amount.toFixed(6)}</strong><small>Awaiting your route</small></div>
              ))}
            </div>
          </section>

          <section className="eg-console-card telemetry-lines">
            <div className="eg-console-heading"><span>DESK-BY-DESK STATUS</span><span>{op.nodes.length} ONLINE</span></div>
            <div className="mt-4 space-y-2">
              {op.nodes.length === 0 ? <p className="text-sm text-emerald-100/45">No open desks.</p> : op.nodes.map((node, index) => {
                const storage = node.storageCap > 0 ? Math.min(100, (node.pendingBnty / node.storageCap) * 100) : 0;
                return (
                  <div key={node.id} className="telemetry-line-row">
                    <span className="telemetry-line-number">{String(index + 1).padStart(2, '0')}</span>
                    <span className="min-w-0"><strong>{node.type === 'oil' ? 'Equity desk' : 'Treasury desk'}</strong><small>L{node.level} · {node.componentMultiplier.toFixed(2)}× instrument multiplier</small></span>
                    <span className="telemetry-line-flow"><span style={{ width: `${storage}%` }} /></span>
                    <span className="text-right font-mono text-[9px] text-emerald-100/55">{node.productionRate.toFixed(4)}<br /><span className="text-[7px] text-lime-300">BNTY/S</span></span>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      ) : null}
    </PageShell>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string; tone: 'lime' | 'cobalt' | 'cyan' | 'orange' }) {
  return (
    <div className={`telemetry-gauge tone-${tone}`}>
      <span className="telemetry-gauge-ring" />
      <p className="stat-label">{label}</p>
      <p className="mt-2 font-mono text-[clamp(1.25rem,3vw,2rem)] font-bold text-white">{value}</p>
    </div>
  );
}
