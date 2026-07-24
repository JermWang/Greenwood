'use client';

// Fab Floor — the GPU campus cockpit, digital twin, and production controls.

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useOperation } from '@/lib/useOperation';
import {
  api,
  type CrateResult,
  type NodeInfo,
  type SettlementStep,
  type StepHandler,
} from '@/lib/api-client';
import { useWalletStore } from '@/lib/store';
import { playSfx } from '@/lib/sfx';
import { useDeployStatus } from '@/lib/useDeployStatus';
import { COMPONENT_RARITIES, NODE_SLOTS, SLOT_LABELS, rarityHex, type Rarity } from '@/lib/rarity';
import { auraHex, auraLabel } from '@/lib/aura';
import { RARITY_MULT, WELCOME_BOOST_WINDOW_S } from '@/lib/economy';
import { type LightingPreset } from '@/components/three/Compound';
import type { RigNodeData } from '@/components/three/NodeRig';
import { CHAIN, TOKEN_LIVE } from '@/lib/config';
import NextStep from '@/components/ui/NextStep';

/** Operator-facing wording for each stage of an on-chain settlement. */
const SETTLEMENT_STEP_LABEL: Record<SettlementStep, string> = {
  quoting: 'Pricing action…',
  preflighting: 'Simulating exact wallet call...',
  reviewing: 'Review the verified transaction details',
  submitting: 'Confirm the GPU payment in your wallet',
  confirming: 'Waiting for confirmation…',
  settling: 'Finalising…',
};

const Scene = dynamic(() => import('@/components/three/Scene'), { ssr: false });
const CrateCinematic = dynamic(() => import('@/components/three/CrateCinematic'), { ssr: false });
const CrateThumb = dynamic(() => import('@/components/three/CrateThumb'), { ssr: false });

const SLOT_GLYPH: Record<string, string> = {
  derrick: '◎',
  pump_jack: '◫',
  pipeline: '⌬',
  flare_stack: 'ϟ',
  drill_bit: '◉',
  ore_cart: '◇',
  rail_track: '⊞',
  elevator: '≈',
};

function fmt(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e4) return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(digits);
}

function Countdown({ ms }: { ms: number }) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return <>{h > 0 ? `${h}h ${m}m` : `${m}m`}</>;
}

export default function CommandPage() {
  const { op, overview, error, selectedNodeId, selectNode, refresh, wallet } = useOperation();
  const storeWallet = useWalletStore((s) => s.wallet);
  const [preset, setPreset] = useState<LightingPreset>('sunset');
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [deployOpen, setDeployOpen] = useState(false);
  const [crateOpen, setCrateOpen] = useState(false);
  const [crateResult, setCrateResult] = useState<CrateResult | null>(null);
  const [lastCrateType, setLastCrateType] = useState<'rig_crate' | 'shaft_crate'>('rig_crate');
  const [cameraFocusId, setCameraFocusId] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem('gpu:lighting-preset') as LightingPreset | null;
    if (stored && ['sunset', 'dusk', 'neutral', 'night'].includes(stored)) setPreset(stored);
  }, []);
  const changePreset = (p: LightingPreset) => {
    setPreset(p);
    localStorage.setItem('gpu:lighting-preset', p);
  };

  const say = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3200);
  }, []);

  const nodes = useMemo(() => op?.nodes ?? [], [op]);
  const oilCount = nodes.filter((node) => node.type === 'oil').length;
  const mineCount = nodes.filter((node) => node.type === 'mine').length;
  const oilCapacity = op?.maxNodes ?? 2;
  const mineCapacity = oilCapacity + (op?.shaftBonusSlots ?? 0);
  const totalCapacity = oilCapacity + mineCapacity;
  const capacityFull = oilCount >= oilCapacity && mineCount >= mineCapacity;
  const selected = nodes.find((n) => n.id === selectedNodeId) ?? null;
  const unseen = op?.unseenCrates ?? [];

  // Chime once when a crate is freshly mined, so a find is noticed even when the
  // operator is looking elsewhere on the page. Keyed on the count rising, not on
  // it merely being non-zero, so it does not re-fire every poll.
  const unseenCount = unseen.length;
  const prevUnseen = useRef(0);
  useEffect(() => {
    if (unseenCount > prevUnseen.current) playSfx('notify');
    prevUnseen.current = unseenCount;
  }, [unseenCount]);
  const sceneNodes = useMemo(() => {
    const visible: RigNodeData[] = nodes.map((node) => ({
      id: node.id,
      type: node.type,
      level: node.level,
      isActive: node.isActive,
      components: node.components,
    }));
    return visible;
  }, [nodes]);
  const focusedRig = sceneNodes.find((node) => node.id === cameraFocusId) ?? null;

  const cycleCameraFocus = useCallback(
    (direction: -1 | 1) => {
      setCameraFocusId((current) => {
        if (sceneNodes.length === 0) return null;
        const currentIndex = current ? sceneNodes.findIndex((node) => node.id === current) : -1;
        if (currentIndex < 0) return sceneNodes[direction > 0 ? 0 : sceneNodes.length - 1].id;
        return sceneNodes[(currentIndex + direction + sceneNodes.length) % sceneNodes.length].id;
      });
    },
    [sceneNodes]
  );

  useEffect(() => {
    if (selectedNodeId) setCameraFocusId(selectedNodeId);
  }, [selectedNodeId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        cycleCameraFocus(-1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        cycleCameraFocus(1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [cycleCameraFocus]);
  const pendingTotal = Object.values(op?.pending ?? {}).reduce((a, b) => a + b, 0);
  const dailyOsr = (op?.productionRate ?? 0) * 86400;
  const networkShare =
    op && overview && overview.halving.currentRatePerSec > 0
      ? (op.productionRate / (overview.halving.currentRatePerSec * op.welcomeBoostFactor || 1)) * 100
      : 0;

  const run = useCallback(
    async (label: string, fn: (onStep: StepHandler) => Promise<unknown>, success?: string) => {
      if (!wallet) return say('Connect your wallet first');
      // Refuse to start anything while a deploy is rolling out. A spend puts
      // GPU on-chain before the server records it, so a cutover landing between
      // those two steps costs the player real tokens and leaves us owing a
      // refund. Waiting a couple of minutes is much cheaper than reconciling.
      if (useDeployStatus.getState().deploying) {
        return say('Server update in progress — hold off a moment so nothing is interrupted');
      }
      // No client-side contract gate: the server decides whether an action
      // settles on-chain or runs straight through the engine, and answers with
      // whichever it did. Blocking here would lock the game before the token
      // ships without adding any protection the server does not already give.
      setBusy(label);
      // Held so a background reload cannot fire mid-transaction.
      useDeployStatus.getState().setBusy(true);
      try {
        // Settlement runs quote, preflight simulation, review, direct transfer,
        // then confirmation, so narrate each stage rather than leaving
        // the operator staring at a spinner wondering which prompt is theirs.
        await fn((step) => say(SETTLEMENT_STEP_LABEL[step]));
        await refresh();
        if (success) say(success);
        // A cue matched to the action: coins for a claim, a thunk for a deploy,
        // a generic success for everything else.
        playSfx(label === 'claim' ? 'claim' : label === 'mint' ? 'deploy' : 'success');
      } catch (e) {
        say(e instanceof Error ? e.message : `${label} failed`);
        playSfx('error');
      } finally {
        setBusy(null);
        useDeployStatus.getState().setBusy(false);
      }
    },
    [wallet, refresh, say]
  );

  const claimAll = () =>
    run('claim', async (onStep) => {
      const r = await api.claim(wallet!, undefined, 'claim', onStep);
      const n = r.claims.length;
      if (n === 0) return say('Nothing to claim');
      // Name the network fee rather than letting the payout quietly arrive short.
      const gas = r.gasOsr > 0 ? ` — ${r.gasOsr.toFixed(2)} GPU network fee` : '';
      say(`Rewards claimed (${n})${gas}`);
    });

  const openCrate = (crateId: number) =>
    run('crate', async (onStep) => {
      const crate = op?.crates.find((c) => c.id === crateId);
      setLastCrateType(crate?.crateType ?? 'rig_crate');
      const res = await api.openCrate(wallet!, crateId, selected?.id, onStep);
      setCrateOpen(false);
      setCrateResult(res);
    });

  const boostActive = op && op.welcomeBoostFactor > 1.001;
  const boostPct = op ? Math.max(0, (op.welcomeBoostFactor - 1) / 7) : 0;

  if (!storeWallet) {
    return (
      <div className="gpu-page mx-auto max-w-[1180px]">
        <div className="fab-uplink-empty">
          <div className="fab-uplink-visual" aria-hidden>
            <span className="fab-uplink-orbit orbit-a" />
            <span className="fab-uplink-orbit orbit-b" />
            <span className="fab-uplink-chip">GPU</span>
          </div>
          <div className="relative z-10 max-w-xl">
            <div className="font-mono text-[9px] font-bold uppercase tracking-[.28em] text-lime-300">Operator uplink offline</div>
            <h1 className="mt-4 text-[clamp(2.5rem,7vw,5.5rem)] font-semibold leading-[.9] tracking-[-.06em] text-white">Bring your fab online.</h1>
            <p className="mt-5 max-w-lg text-sm leading-6 text-sky-100/58">
              Connect an authenticated wallet to initialize your cleanroom identity, production ledger, and first wafer line on {CHAIN.name}.
            </p>
            <div className="mt-7 grid gap-2 sm:grid-cols-3">
              {[
                ['01', 'Link operator'],
                ['02', 'Commission fab'],
                ['03', 'Start yield'],
              ].map(([step, label]) => (
                <div key={step} className="fab-uplink-step"><span>{step}</span>{label}</div>
              ))}
            </div>
            <p className="mt-5 font-mono text-[9px] uppercase tracking-[.15em] text-sky-100/35">Use the connect control in the command bar to begin</p>
          </div>
        </div>
      </div>
    );
  }

  if (!op) {
    return (
      <div className="gpu-page mx-auto max-w-[1180px]">
        <div className="fab-loading-deck">
          <span className="fab-loading-scan" />
          <div className="font-mono text-[10px] uppercase tracking-[.28em] text-lime-300">Synchronizing fab telemetry</div>
          <p className="mt-2 text-sm text-sky-100/45">Reading facilities, production buffers, and network share…</p>
        </div>
      </div>
    );
  }

  return (
    <main className="fab-command-page">
      <section className="fab-command-hero">
        <div className="relative z-10">
          <div className="flex flex-wrap items-center gap-2 font-mono text-[9px] font-bold uppercase tracking-[.24em] text-lime-300">
            <span>LIVE FAB OS</span><span className="h-1 w-1 rounded-full bg-sky-300/50" /><span className="text-sky-100/42">CAMPUS {wallet?.slice(2, 8).toUpperCase()}</span>
          </div>
          <h1 className="mt-4 text-[clamp(2.4rem,6vw,5.8rem)] font-semibold leading-[.86] tracking-[-.065em] text-white">Campus operations.</h1>
          <p className="mt-5 max-w-2xl text-sm leading-6 text-sky-100/55">Commission silicon lines, tune equipment, route production, and grow your share of the GPU emission network from one live control surface.</p>
        </div>
        <div className="fab-hero-actions">
          <button className="btn-secondary" onClick={() => setDeployOpen(true)} disabled={capacityFull}>+ Commission line</button>
          <button
            className="btn-primary"
            disabled={pendingTotal <= 0 || busy === 'claim' || op.claimCooldownRemainingMs > 0}
            onClick={claimAll}
          >
            {busy === 'claim' ? 'Routing yield…' : op.claimCooldownRemainingMs > 0 ? `Buffer locked · ${Math.ceil(op.claimCooldownRemainingMs / 60000)}m` : `Route ${fmt(pendingTotal)} GPU`}
          </button>
        </div>
        <div className="fab-metric-grid">
          <div className="fab-metric-card"><span className="fab-metric-code">TIER</span><strong>0{op.level}</strong><small>Campus certification</small></div>
          <div className="fab-metric-card"><span className="fab-metric-code">FLOW</span><strong>{nodes.length ? fmt(dailyOsr, 0) : '0'}</strong><small>GPU per day</small></div>
          <div className="fab-metric-card"><span className="fab-metric-code">LINES</span><strong>{nodes.length}/{totalCapacity}</strong><small>Active capacity</small></div>
          <div className="fab-metric-card"><span className="fab-metric-code">SHARE</span><strong>{networkShare.toFixed(1)}%</strong><small>Emission grid</small></div>
        </div>
        <div className="fab-hero-trace" aria-hidden />
      </section>

      <div className="fab-alert-stack">
        {!TOKEN_LIVE && <div className="fab-system-alert"><span>SIM</span><p>Pre-token simulation is active. Campus activity is tracked now and settles when GPU goes live.</p></div>}
        {unseen.length > 0 && (
          <button className="fab-system-alert is-reward" onClick={() => { setCrateOpen(true); void api.markCratesSeen(wallet!).then(refresh).catch(() => {}); }}>
            <CrateThumb size={34} rarity="legendary" />
            <p><strong>{unseen.length} sealed supply {unseen.length === 1 ? 'pod' : 'pods'}</strong><br />Recovered by your production lines · inspect contents</p>
            <span className="ml-auto">OPEN</span>
          </button>
        )}
        {error && <div className="fab-system-alert is-error"><span>ERR</span><p>{/^\d{3}\b|auth|privy|token|unauthor/i.test(error) ? `Operator uplink verification failed (${error}) · retrying` : `Fab API unreachable (${error}) · retrying`}</p></div>}
      </div>

      <NextStep
        op={op}
        wallet={wallet!}
        onMint={() => setDeployOpen(true)}
        onClaim={claimAll}
        onOpenPod={() => setCrateOpen(true)}
      />

      <div className="fab-command-grid">
        <section className="fab-digital-twin" aria-label="Interactive fab digital twin">
          <div className="fab-scene-head">
            <div><span className="fab-scene-kicker">DIGITAL TWIN / REALTIME</span><strong>{focusedRig ? `${focusedRig.type === 'oil' ? 'WAFER FAB' : 'CLEANROOM'} · L${focusedRig.level}` : 'CAMPUS OVERVIEW'}</strong></div>
            <div className="fab-lighting-tabs" aria-label="Scene lighting">
              {([['sunset', 'DAY'], ['dusk', 'SHIFT'], ['neutral', 'LAB'], ['night', 'NIGHT']] as [LightingPreset, string][]).map(([lighting, label]) => (
                <button key={lighting} onClick={() => changePreset(lighting)} className={preset === lighting ? 'is-active' : ''}>{label}</button>
              ))}
            </div>
          </div>
          <div className="fab-scene-canvas">
            <Scene
              nodes={sceneNodes}
              preset={preset}
              selectedNodeId={selectedNodeId}
              focusNodeId={cameraFocusId}
              onSelect={(id) => { selectNode(id || null); setCameraFocusId(id || null); }}
            />
            {focusedRig && (
              <div className="fab-focus-card">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: auraHex(focusedRig.level), boxShadow: `0 0 12px ${auraHex(focusedRig.level)}` }} />
                  <strong>{auraLabel(focusedRig.level)} LINE</strong>
                  <span className="ml-auto">L{focusedRig.level}</span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
                  {NODE_SLOTS[focusedRig.type === 'oil' ? 'oil' : 'mine'].map((slot) => {
                    const fitted = focusedRig.components.find((component) => component.slot === slot);
                    const rarity = (fitted?.rarity ?? null) as Rarity | null;
                    return <div key={slot} className="flex items-center gap-1.5"><span className="text-sky-100/30">{SLOT_GLYPH[slot]}</span><span className="truncate text-sky-100/58">{SLOT_LABELS[slot]}</span><span className="ml-auto font-mono text-[8px] font-bold uppercase" style={{ color: rarity ? rarityHex(rarity) : '#55708e' }}>{rarity ? COMPONENT_RARITIES[rarity].label : 'EMPTY'}</span></div>;
                  })}
                </div>
              </div>
            )}
            <div className="fab-scene-nav">
              <button onClick={() => cycleCameraFocus(-1)} aria-label="Previous facility">←</button>
              <button onClick={() => setCameraFocusId(null)}>{focusedRig ? 'Release focus' : 'Campus view'}</button>
              <button onClick={() => cycleCameraFocus(1)} aria-label="Next facility">→</button>
            </div>
          </div>
        </section>

        <aside className="fab-console-stack">
          <section className="fab-console-card is-yield">
            <div className="fab-console-heading"><span>YIELD BUFFER</span><span>{overview ? `HALVING ${overview.halving.cycleIndex + 2}` : 'SYNCING'}</span></div>
            <div className="mt-5 flex items-end justify-between gap-4">
              <div><strong className="text-[clamp(2.2rem,5vw,4.2rem)] font-semibold leading-none tracking-[-.06em] text-white">{fmt(pendingTotal)}</strong><span className="ml-2 font-mono text-[10px] text-lime-300">GPU</span></div>
              <span className="font-mono text-[9px] text-sky-100/42">{fmt(op.productionRate, 4)} / SEC</span>
            </div>
            <div className="fab-flow-track"><span style={{ width: `${Math.max(4, Math.min(100, networkShare))}%` }} /></div>
            <div className="mt-2 flex justify-between font-mono text-[8px] uppercase tracking-[.14em] text-sky-100/38"><span>Grid ownership {networkShare.toFixed(2)}%</span><span>{overview ? <Countdown ms={Math.max(0, overview.halving.nextHalvingMs - Date.now())} /> : '—'}</span></div>
            {boostActive && <div className="fab-boost-chip">WELCOME ACCELERATOR · {op.welcomeBoostFactor.toFixed(2)}× · {Math.round(boostPct * 100)}% WINDOW</div>}
          </section>

          <section className="fab-console-card" id="production-lines">
            <div className="fab-console-heading"><span>PRODUCTION LINES</span><span>{nodes.length}/{totalCapacity}</span></div>
            <div className="mt-3 space-y-2">
              {nodes.length === 0 && <button className="fab-empty-line" onClick={() => setDeployOpen(true)}><span>+</span><strong>Commission your first wafer fab</strong><small>Start silicon production</small></button>}
              {nodes.map((node, index) => (
                <button key={node.id} onClick={() => { selectNode(node.id); setCameraFocusId(node.id); }} className={`fab-line-row ${node.id === selectedNodeId ? 'is-active' : ''}`}>
                  <span className="fab-line-index">{String(index + 1).padStart(2, '0')}</span>
                  <span className="min-w-0 text-left"><strong>{node.type === 'oil' ? 'Wafer Fab' : 'Cleanroom'}</strong><small>{auraLabel(node.level)} · {fmt(node.productionRate, 4)} GPU/s</small></span>
                  <span className="ml-auto text-right"><strong style={{ color: auraHex(node.level) }}>L{node.level}</strong><small>{fmt(node.pendingOsr)} GPU</small></span>
                </button>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2"><button className="btn-primary text-xs" disabled={capacityFull} onClick={() => setDeployOpen(true)}>Commission</button><button className="btn-secondary text-xs" onClick={() => setCrateOpen(true)}>Supply pods</button></div>
          </section>
        </aside>
      </div>

      <div className="fab-lower-grid">
        <div id="compound-panel" className="contents"><CompoundPanel busy={busy} run={run} /></div>
        {selected ? <NodeDetail node={selected} busy={busy} run={run} onOpenCrate={() => setCrateOpen(true)} /> : (
          <section className="fab-console-card fab-inspector-empty"><div className="fab-console-heading"><span>LINE INSPECTOR</span><span>STANDBY</span></div><div className="mt-7"><strong>Select a line in the digital twin.</strong><p>Inspect fitted equipment, storage saturation, production rate, and calibration options without leaving the fab floor.</p></div></section>
        )}
        <section className="fab-console-card">
          <div className="fab-console-heading"><span>SUPPLY RECOVERY</span><span>{op.crates.length} SEALED</span></div>
          <div className="mt-4 flex items-center gap-4"><CrateThumb size={68} rarity={unseen.length ? 'legendary' : 'rare'} /><div><strong className="text-white">Process equipment pods</strong><p className="mt-1 text-xs leading-5 text-sky-100/45">Production lines recover randomized fab components. Fit them in the Parts Bay to increase grow-power.</p></div></div>
          <button className="btn-secondary mt-4 w-full text-xs" onClick={() => setCrateOpen(true)}>Open pod inventory</button>
        </section>
        <section className="fab-console-card is-co-yield">
          <div className="fab-console-heading"><span>AI SECTOR CO-YIELD</span><span>UNLOCK · TIER 05</span></div>
          <div className="mt-5 text-3xl font-semibold tracking-[-.04em] text-white">Build toward the compute economy.</div>
          <p className="mt-3 text-xs leading-5 text-sky-100/46">High-tier campuses route a strategic bonus pool beside base GPU production, weighted by active fab power.</p>
        </section>
      </div>

      {deployOpen && <DeployModal onClose={() => setDeployOpen(false)} busy={busy} counts={{ oil: oilCount, mine: mineCount }} capacities={{ oil: oilCapacity, mine: mineCapacity }} onDeploy={(familyKey) => run('mint', async (onStep) => { await api.mintNode(wallet!, familyKey, onStep); setDeployOpen(false); say('Production line commissioned'); })} />}
      {crateOpen && <CratePicker onClose={() => setCrateOpen(false)} busy={busy} op={op} onOpen={openCrate} />}
      {crateResult && <CrateCinematic result={crateResult} onClose={() => setCrateResult(null)} onOpenAnother={() => { setCrateResult(null); setCrateOpen(true); }} />}
      {toast && <div className="fab-toast">{toast}</div>}
    </main>
  );

}

function CompoundPanel({
  busy,
  run,
}: {
  busy: string | null;
  run: (label: string, fn: (onStep: StepHandler) => Promise<unknown>, success?: string) => Promise<void>;
}) {
  const { op, wallet } = useOperation();
  if (!op) return null;
  const c = op.compound;
  const next = c.nextUpgradeCost;
  const cooling = c.cooldownRemainingMs > 0;
  return (
    <div className="panel p-4">
      <div className="mb-1 flex items-center justify-between">
        <div className="stat-label">Warehouse Upgrade</div>
        {next && <span className="font-mono text-[11px] text-steel-400">L{c.level} → L{next.targetLevel}</span>}
      </div>
      {next ? (
        <>
          <div className="text-sm text-steel-300">
            {next.totalOsr.toLocaleString()} GPU
            <span className="text-[11px] text-steel-500"> · 50/30/20 burn/reserve/treasury · +0.00001 ETH</span>
          </div>
          {cooling && (
            <div className="mt-1 text-[11px] text-amber-500">
              Ready in <Countdown ms={c.cooldownRemainingMs} />
            </div>
          )}
          <div className="mt-2 grid grid-cols-1 gap-2">
            <button
              className="btn-primary"
              disabled={busy === 'upgrade' || cooling}
              onClick={() =>
                run('upgrade', async (onStep) => {
                  await api.upgradeCompound(wallet!, onStep);
                }, 'Warehouse upgraded!')
              }
            >
              {busy === 'upgrade' ? 'Upgrading…' : 'Confirm Upgrade'}
            </button>
            {cooling && (
              <button
                className="btn-secondary"
                title="Pay 0.005 ETH to skip the cooldown and upgrade now"
                disabled={busy === 'expedite'}
                onClick={() => {
                  if (confirm('Skip cooldown for 0.005 ETH?'))
                    run('expedite', async (onStep) => {
                      await api.expediteCompound(wallet!, onStep);
                    }, 'Warehouse upgrade expedited!');
                }}
              >
                Skip Cooldown (0.005 ETH)
              </button>
            )}
          </div>
          <p className="mt-2 text-[10px] text-steel-500">12h cooldown applies after upgrade</p>
        </>
      ) : (
        <div className="text-sm text-steel-400">
          Max Level · {c.maxNodes} facilities · {c.cratesPerDay} supply pods/day
        </div>
      )}
    </div>
  );
}

function NodeDetail({
  node,
  busy,
  run,
  onOpenCrate,
}: {
  node: NodeInfo;
  busy: string | null;
  run: (label: string, fn: (onStep: StepHandler) => Promise<unknown>, success?: string) => Promise<void>;
  onOpenCrate: () => void;
}) {
  const { wallet } = useOperation();
  const slots = NODE_SLOTS[node.type === 'oil' ? 'oil' : 'mine'];
  const fill = node.storageCap > 0 ? Math.min(1, node.pendingOsr / node.storageCap) : 0;
  const fillColor = fill >= 0.999 ? '#dc2626' : fill >= 0.85 ? '#ea580c' : fill >= 0.5 ? '#f59e0b' : '#71717a';
  return (
    <div className="panel p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="stat-label">
          {node.type === 'oil' ? 'Wafer Fab' : 'Cleanroom'} · L{node.level}
        </div>
        <span className="font-mono text-[11px] text-amber-400">
          {node.componentMultiplier.toFixed(2)}× GP
        </span>
      </div>

      {/* Names the aura tier and shows its colour, which is the same colour as
          the ring drawn under this fab in the 3D scene — so the ring is
          readable as a rank instead of being unexplained decoration. */}
      <div className="mb-2 flex items-center gap-1.5 text-[11px]">
        <span
          aria-hidden
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{
            background: auraHex(node.level),
            boxShadow: `0 0 6px ${auraHex(node.level)}99`,
          }}
        />
        <span className="text-steel-400">Aura</span>
        <span className="font-mono font-bold uppercase" style={{ color: auraHex(node.level) }}>
          {auraLabel(node.level)}
        </span>
        <span className="ml-auto font-mono text-steel-500">
          {fmt(node.productionRate)} GPU/s
        </span>
      </div>

      <div className="mb-2">
        <div className="flex justify-between text-[11px] text-steel-400">
          <span>Storage {fill >= 0.999 ? '· FULL' : ''}</span>
          <span className="font-mono">
            {fmt(node.pendingOsr)} / {fmt(node.storageCap)}
          </span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded bg-ink-700">
          <div className="h-full transition-all" style={{ width: `${fill * 100}%`, background: fillColor }} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        {slots.map((slot) => {
          const comp = node.components.find((c) => c.slot === slot);
          const rarity = (comp?.rarity ?? null) as Rarity | null;
          return (
            <div
              key={slot}
              className="rounded border border-ink-600 bg-ink-800 p-2"
              style={rarity ? { borderColor: `${'#' + COMPONENT_RARITIES[rarity].tint.toString(16).padStart(6, '0')}66` } : undefined}
            >
              <div className="flex items-center gap-1 text-[11px] text-steel-300">
                <span>{SLOT_GLYPH[slot]}</span> {SLOT_LABELS[slot]}
              </div>
              {rarity ? (
                <div
                  className="mt-0.5 font-mono text-[11px] font-bold uppercase"
                  style={{ color: '#' + COMPONENT_RARITIES[rarity].tint.toString(16).padStart(6, '0') }}
                >
                  {COMPONENT_RARITIES[rarity].label} · {RARITY_MULT[rarity]}×
                </div>
              ) : (
                <div className="mt-0.5 text-[11px] text-steel-500">— empty —</div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <button className="btn-secondary text-xs" onClick={onOpenCrate}>
          Open Supply Pod
        </button>
        <button
          className="btn-secondary text-xs"
          disabled={busy === 'nodeUp'}
          onClick={() =>
            run('nodeUp', async (onStep) => {
              await api.upgradeNode(wallet!, node.id, onStep);
            }, `Facility leveled up!`)
          }
        >
          Level Up · {node.nextLevelCost.toLocaleString()} GPU
        </button>
      </div>
      {node.type === 'mine' && node.pendingOsr > 0 && (
        <button
          className="btn-secondary mt-2 w-full text-xs"
          disabled={busy === 'compound'}
          onClick={() =>
            run('compound', async (onStep) => {
              await api.claim(wallet!, node.id, 'compound', onStep);
            }, 'Compounded at 0.75% fee')
          }
        >
          Compound GPU → Balance (0.75% fee)
        </button>
      )}
    </div>
  );
}

function DeployModal({
  onClose,
  onDeploy,
  busy,
  counts,
  capacities,
}: {
  onClose: () => void;
  onDeploy: (familyKey: string) => void;
  busy: string | null;
  counts: Record<'oil' | 'mine', number>;
  capacities: Record<'oil' | 'mine', number>;
}) {
  const [families, setFamilies] = useState<Awaited<ReturnType<typeof api.families>> | null>(null);
  const [sel, setSel] = useState<string>('oil_rig');
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadFamilies = useCallback(async () => {
    setFamilies(null);
    setLoadError(null);
    try {
      setFamilies(await api.families());
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not load node families');
    }
  }, []);
  useEffect(() => {
    void loadFamilies();
  }, [loadFamilies]);
  useEffect(() => {
    if (!families) return;
    const selected = families.find((family) => family.key === sel);
    if (selected && counts[selected.family] >= capacities[selected.family]) {
      const available = families.find(
        (family) => counts[family.family] < capacities[family.family]
      );
      if (available) setSel(available.key);
    }
  }, [families, sel, counts, capacities]);

  const selectedFamily = families?.find((family) => family.key === sel);
  const selectedFull = selectedFamily
    ? counts[selectedFamily.family] >= capacities[selectedFamily.family]
    : true;

  return (
    <Modal onClose={onClose} title="Deploy Facility">
      <div className="flex flex-col gap-2">
        {(families ?? []).map((f) => {
          const full = counts[f.family] >= capacities[f.family];
          return (
            <button
              key={f.key}
              disabled={full}
              onClick={() => setSel(f.key)}
              className={`rounded border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
                sel === f.key ? 'border-lime-400 bg-lime-400/10' : 'border-ink-600 bg-ink-800 hover:border-steel-500'
              }`}
            >
            <div className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={f.family === 'oil' ? '/assets/fab/lithography-machine-reference.png' : '/assets/fab/packaging-line-reference.png'}
                alt=""
                className="h-12 w-12 rounded object-cover"
              />
              <span className="font-semibold text-white">{f.name}</span>
              <span className="ml-auto font-mono text-sm text-lime-300">
                {f.burnCostOsr.toLocaleString()} GPU
              </span>
            </div>
            <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-steel-500">
              Capacity {counts[f.family]}/{capacities[f.family]}{full ? ' · full' : ''}
            </div>
            <p className="mt-1 text-xs text-steel-400">{f.description}</p>
            <div className="mt-2 grid grid-cols-3 gap-1 text-[10px] text-steel-500">
              <span>→ burned {(f.burnCostOsr * f.burnShareBps) / 10000}</span>
              <span>→ treasury {(f.burnCostOsr * f.treasuryShareBps) / 10000}</span>
              <span>+ {f.mintFeeEth} ETH fee</span>
            </div>
            </button>
          );
        })}
        {!families && !loadError && <div className="text-sm text-steel-400">Loading families…</div>}
        {loadError && (
          <div className="rounded border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-400">
            <p>{loadError}</p>
            <button className="btn-secondary mt-2 text-xs" onClick={() => void loadFamilies()}>
              Retry
            </button>
          </div>
        )}
        <button
          className="btn-primary mt-2"
          disabled={busy === 'mint' || selectedFull || !families}
          onClick={() => onDeploy(sel)}
        >
          {busy === 'mint' ? 'Calibrating…' : 'Deploy · Starting level L1'}
        </button>
      </div>
    </Modal>
  );
}

function CratePicker({
  onClose,
  onOpen,
  busy,
  op,
}: {
  onClose: () => void;
  onOpen: (crateId: number) => void;
  busy: string | null;
  op: ReturnType<typeof useOperation.getState>['op'];
}) {
  const wallet = useOperation((s) => s.wallet);
  const [odds, setOdds] = useState<Awaited<ReturnType<typeof api.crateOdds>> | null>(null);
  useEffect(() => {
    if (wallet) api.crateOdds(wallet).then(setOdds).catch(() => setOdds(null));
  }, [wallet]);
  const cost = op?.compound.crateCost ?? 0;
  const crates = op?.crates ?? [];
  return (
    <Modal onClose={onClose} title="Supply Pods">
      {odds && (
        <>
          <div className="mb-2 grid grid-cols-7 gap-1">
            {odds.odds.map(({ rarity, chance }) => (
              <div key={rarity} className="rounded bg-ink-800 p-1 text-center">
                <div
                  className="font-mono text-[9px] font-bold uppercase"
                  style={{ color: '#' + COMPONENT_RARITIES[rarity as Rarity].tint.toString(16).padStart(6, '0') }}
                >
                  {rarity.slice(0, 3)}
                </div>
                <div className="text-[10px] text-steel-400">{(chance * 100).toFixed(chance < 0.01 ? 1 : 0)}%</div>
              </div>
            ))}
          </div>
          <p className="mb-3 text-[10px] leading-relaxed text-steel-500">
            Bad-Luck Protection (free): Legendary+ within {odds.guarantees.legendaryPlus} · Mythic+
            within {odds.guarantees.mythicPlus} · Divine within {odds.guarantees.divine}.
            {odds.pity && <> Streak: {odds.pity.sinceLegendaryPlus} since Legendary+.</>}
          </p>
        </>
      )}
      {/* Crates are mined, not bought — this lists what the operator actually
          found. With nothing to show, the honest answer is "keep mining", not
          a buy button. */}
      {crates.length === 0 ? (
        <div className="rounded border border-ink-600 bg-ink-800/60 p-4 text-center">
          <div className="text-sm font-semibold text-steel-200">No supply pods in your inventory</div>
          <p className="mt-1 text-[11px] leading-relaxed text-steel-500">
            Supply pods are found while your fabs run. Larger warehouses find them more often, and
            the whole network only releases so many each day.
          </p>
        </div>
      ) : (
        <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
          {crates.map((crate) => (
            <div
              key={crate.id}
              className={`flex items-center gap-2.5 rounded border p-2 ${
                crate.crateType === 'rig_crate'
                  ? 'border-amber-500/40 bg-amber-500/5'
                  : 'border-steel-500/40 bg-steel-500/5'
              }`}
            >
              <CrateThumb size={44} rarity={crate.crateType === 'rig_crate' ? 'legendary' : 'epic'} />
              <div className="min-w-0">
                <div className="text-xs font-semibold text-white">
                  {crate.crateType === 'rig_crate' ? 'Fab Supply Pod' : 'Cleanroom Supply Pod'}
                </div>
                <div className="text-[10px] text-steel-500">
                  Fabricated {new Date(crate.foundAt).toLocaleDateString()}
                </div>
              </div>
              <button
                className="btn-primary ml-auto shrink-0 !py-1.5 text-xs"
                disabled={busy === 'crate'}
                onClick={() => onOpen(crate.id)}
              >
                Open · {cost.toLocaleString()} GPU
              </button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}


function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[65] flex items-center justify-center bg-ink-900/85 p-4" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-lg border border-ink-600 bg-ink-800 p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-mono text-sm uppercase tracking-widest text-amber-500">{title}</h2>
          <button className="text-steel-400 hover:text-white" onClick={onClose}>
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
