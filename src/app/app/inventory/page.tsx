'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PageShell from '@/components/ui/PageShell';
import ComponentTile from '@/components/ui/ComponentTile';
import NodePreview from '@/components/three/NodePreview';
import { api, type InventoryItem, type NodeInfo, type UserOperation } from '@/lib/api-client';
import { RARITY_MULT } from '@/lib/economy';
import { NODE_SLOTS, RARITIES, SLOT_LABELS, asRarity, rarityHex, type Rarity } from '@/lib/rarity';
import { useWalletStore } from '@/lib/store';

type View = 'locker' | 'equipped';
type Sort = 'rarity' | 'slot' | 'newest';

const rarityRank = (r: string) => RARITIES.indexOf(asRarity(r));
const rarityLabel = (r: string) => {
  const x = asRarity(r);
  return x.charAt(0).toUpperCase() + x.slice(1);
};

function NodeChip({ type, abbrev }: { type: 'oil' | 'mine'; abbrev?: boolean }) {
  const oil = type === 'oil';
  return (
    <span
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider"
      style={{
        background: 'rgba(107,117,128,0.12)',
        border: '1px solid rgba(255,255,255,0.28)',
        color: '#cbd5e1',
      }}
    >
      <span aria-hidden>{oil ? '◉' : '⬡'}</span>
      {abbrev ? (oil ? 'EQD' : 'TSY') : oil ? 'Equity Desk' : 'Treasury Desk'}
    </span>
  );
}

export default function InventoryPage() {
  const wallet = useWalletStore((s) => s.wallet);
  const [op, setOp] = useState<UserOperation | null>(null);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>('locker');
  const [sort, setSort] = useState<Sort>('rarity');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [nodeIndex, setNodeIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [busyItemId, setBusyItemId] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2800);
  }, []);

  const load = useCallback(async () => {
    if (!wallet) return;
    setError(null);
    try {
      const [operation, inv] = await Promise.all([api.operation(wallet), api.inventory(wallet)]);
      setOp(operation);
      setItems(inv.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'API unreachable');
    } finally {
      setLoaded(true);
    }
  }, [wallet]);

  useEffect(() => {
    void load();
  }, [load]);

  const nodes: NodeInfo[] = useMemo(() => op?.nodes ?? [], [op]);
  const node: NodeInfo | null = nodes.length > 0 ? nodes[((nodeIndex % nodes.length) + nodes.length) % nodes.length] : null;

  const lockerItems = useMemo(() => items.filter((i) => i.equippedNodeId == null), [items]);
  const equippedItems = useMemo(() => items.filter((i) => i.equippedNodeId != null), [items]);

  const sorted = useMemo(() => {
    const src = view === 'locker' ? lockerItems : equippedItems;
    const copy = [...src];
    if (sort === 'rarity') {
      copy.sort((a, b) => rarityRank(b.rarity) - rarityRank(a.rarity) || b.createdAt - a.createdAt);
    } else if (sort === 'slot') {
      copy.sort(
        (a, b) => a.slot.localeCompare(b.slot) || rarityRank(b.rarity) - rarityRank(a.rarity)
      );
    } else if (view === 'equipped') {
      copy.sort((a, b) => (a.equippedNodeId ?? 0) - (b.equippedNodeId ?? 0));
    } else {
      copy.sort((a, b) => b.createdAt - a.createdAt);
    }
    return copy;
  }, [view, sort, lockerItems, equippedItems]);

  const selected = useMemo(
    () => lockerItems.find((i) => i.id === selectedId) ?? null,
    [lockerItems, selectedId]
  );
  const compatible = selected != null && node != null && selected.nodeType === node.type;

  const equip = useCallback(
    async (slot: string) => {
      if (!wallet || !selected || !node || busy) return;
      if (selected.nodeType !== node.type) {
        showToast(`That instrument belongs to a ${selected.nodeType === 'oil' ? 'Equity Desk' : 'Treasury Desk'}`);
        return;
      }
      if (selected.slot !== slot) {
        showToast(`${rarityLabel(selected.rarity)} fits in ${SLOT_LABELS[selected.slot]} only`);
        return;
      }
      setBusy(true);
      try {
        await api.equip(wallet, selected.id, node.id);
        showToast(`Equipped ${rarityLabel(selected.rarity)} ${SLOT_LABELS[selected.slot]}`);
        setSelectedId(null);
        await load();
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'Equip failed');
      } finally {
        setBusy(false);
      }
    },
    [wallet, selected, node, busy, load, showToast]
  );

  const unequip = useCallback(
    async (item: InventoryItem) => {
      if (!wallet || item.equippedNodeId == null || busyItemId != null) return;
      setBusyItemId(item.id);
      try {
        await api.unequip(wallet, item.equippedNodeId, item.slot);
        showToast(`Unequipped ${rarityLabel(item.rarity)} → Locker`);
        await load();
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'Unequip failed');
      } finally {
        setBusyItemId(null);
      }
    },
    [wallet, busyItemId, load, showToast]
  );

  return (
    <PageShell title="Instruments" subtitle="Stage, compare, and install instruments across every live desk." backHref="/app" backLabel="Trading Floor" maxWidth="max-w-[1560px]">
      {!wallet ? (
        <p className="text-sm text-steel-400">Connect your wallet to see your instruments.</p>
      ) : !loaded ? (
        <p className="text-sm text-steel-400">Loading inventory…</p>
      ) : error ? (
        <p className="text-sm text-red-400">{error}</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          {/* ─── Left: locker / equipped ─── */}
          <section className="min-w-0">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              {/* View toggle */}
              <div className="flex rounded-md border border-steel-500/50 bg-ink-800/90 p-1">
                {(
                  [
                    { key: 'locker' as View, label: 'Locker', count: lockerItems.length },
                    { key: 'equipped' as View, label: 'Equipped', count: equippedItems.length },
                  ] as const
                ).map(({ key, label, count }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setView(key);
                      if (key === 'equipped') setSelectedId(null);
                    }}
                    className={`flex items-center gap-1.5 rounded px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-widest transition ${
                      view === key
                        ? 'bg-amber-500 text-ink-900'
                        : 'text-steel-300 hover:text-amber-500'
                    }`}
                  >
                    {label}
                    <span
                      className={`rounded px-1 text-[9px] ${
                        view === key ? 'bg-ink-900/20' : 'bg-ink-700'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                ))}
              </div>
              {/* Sort */}
              <div className="flex rounded-md border border-steel-500/50 bg-ink-800/90 p-1">
                {(
                  [
                    { key: 'rarity' as Sort, label: 'Rarity' },
                    { key: 'slot' as Sort, label: 'Slot' },
                    { key: 'newest' as Sort, label: 'Newest' },
                  ] as const
                ).map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSort(key)}
                    className={`rounded px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-widest transition ${
                      sort === key
                        ? 'bg-amber-500 text-ink-900'
                        : 'text-steel-300 hover:text-amber-500'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {sorted.length === 0 ? (
              view === 'locker' ? (
                <div className="rounded-lg border border-dashed border-steel-500/40 p-8 text-center">
                  <p className="text-sm text-steel-300">Locker is empty.</p>
                  <p className="mt-1 text-xs text-steel-500">
                    New allocations land here. Open one from the Trading Floor to start filling
                    it.
                  </p>
                  {equippedItems.length > 0 && (
                    <button
                      type="button"
                      className="btn-secondary mt-4 text-xs"
                      onClick={() => {
                        setView('equipped');
                        setSelectedId(null);
                      }}
                    >
                      View equipped instruments
                    </button>
                  )}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-steel-500/40 p-8 text-center">
                  <p className="text-sm text-steel-300">Nothing equipped.</p>
                  <p className="mt-1 text-xs text-steel-500">
                    Open a desk from the Trading Floor to start installing instruments.
                  </p>
                </div>
              )
            ) : (
              <div className="grid auto-rows-fr grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {sorted.map((item) => {
                  const hex = rarityHex(asRarity(item.rarity));
                  const isSelected = view === 'locker' && selectedId === item.id;
                  const inner = (
                    <>
                      <div
                        className="h-1 w-full rounded-t"
                        style={{ background: hex, boxShadow: `0 0 8px ${hex}aa` }}
                      />
                      <div className="flex flex-1 flex-col p-2.5">
                        <p
                          className="font-mono text-xs font-bold uppercase"
                          style={{ color: hex, letterSpacing: '0.22em' }}
                        >
                          {rarityLabel(item.rarity)}
                        </p>
                        <div className="relative mt-1 flex h-24 items-center justify-center">
                          {view === 'equipped' && (
                            <span className="absolute left-0 top-0 rounded bg-green-500/20 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-green-400">
                              Equipped
                            </span>
                          )}
                          <ComponentTile slot={item.slot} rarity={asRarity(item.rarity)} size={86} />
                        </div>
                        <p className="mt-1.5 text-sm font-semibold text-steel-200">
                          {SLOT_LABELS[item.slot] ?? item.slot}
                        </p>
                        <p className="text-[11px] text-steel-400">
                          {RARITY_MULT[asRarity(item.rarity)].toFixed(1)}x multiplier
                        </p>
                        {view === 'equipped' && (
                          <>
                            <p className="mt-0.5 font-mono text-[10px] text-steel-500">
                              {item.multiplier.toFixed(1)}x · dura{' '}
                              {(item.durability * 100).toFixed(0)}%
                            </p>
                            <p className="font-mono text-[10px] text-steel-500">
                              Node #{String(item.equippedNodeId).slice(-6)}
                            </p>
                          </>
                        )}
                        <div className="mt-auto pt-2">
                          <NodeChip type={item.nodeType} />
                        </div>
                        {view === 'equipped' && (
                          <button
                            type="button"
                            disabled={busyItemId != null}
                            onClick={() => void unequip(item)}
                            className="btn-secondary mt-2 w-full px-2 py-1 text-[11px]"
                          >
                            {busyItemId === item.id ? 'Working…' : 'Unequip → Locker'}
                          </button>
                        )}
                      </div>
                    </>
                  );
                  const baseClass = `flex flex-col overflow-hidden rounded-lg border bg-ink-800/80 text-left transition ${
                    isSelected
                      ? 'border-amber-500 bg-amber-500/10 shadow-[0_0_20px_rgba(245,158,11,0.25)]'
                      : 'border-ink-600'
                  }`;
                  return view === 'locker' ? (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedId(isSelected ? null : item.id)}
                      className={baseClass}
                      style={
                        isSelected ? undefined : { boxShadow: `inset 0 0 18px ${hex}14` }
                      }
                    >
                      {inner}
                    </button>
                  ) : (
                    <div
                      key={item.id}
                      className={baseClass}
                      style={{ boxShadow: `inset 0 0 18px ${hex}14` }}
                    >
                      {inner}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Selection helper */}
            {selected && (
              <div className="mt-4 rounded-lg border border-amber-500/60 bg-amber-500/5 p-3 text-sm">
                <p className="font-semibold text-amber-500">
                  Selected: {rarityLabel(selected.rarity)} {SLOT_LABELS[selected.slot]}
                </p>
                <p className="mt-0.5 text-xs text-steel-300">
                  {compatible
                    ? `Click the ${SLOT_LABELS[selected.slot]} slot on this node to equip.`
                    : selected.nodeType === 'oil'
                      ? 'Navigate to an Equity Desk to equip this instrument.'
                      : 'Navigate to a Treasury Desk to equip this instrument.'}
                </p>
              </div>
            )}
          </section>

          {/* ─── Right: Target Node ─── */}
          <aside>
            <h2 className="stat-label mb-3">Target Node</h2>
            {nodes.length === 0 ? (
              <p className="panel p-4 text-sm text-steel-400">
                You don&rsquo;t own any desks yet. Open an Equity Desk or Treasury Desk from the Trading Floor.
              </p>
            ) : node ? (
              <div className="panel p-4">
                {/* Pager */}
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    aria-label="Previous node"
                    disabled={nodes.length <= 1}
                    onClick={() => setNodeIndex((i) => i - 1)}
                    className="btn-secondary px-3 py-1"
                  >
                    ‹
                  </button>
                  <div className="text-center">
                    <NodeChip type={node.type} />
                    <p className="mt-1 font-mono text-sm text-white">
                      Node #{String(node.id).slice(-6)}
                    </p>
                    <p className="font-mono text-[11px] text-steel-400">
                      {(((nodeIndex % nodes.length) + nodes.length) % nodes.length) + 1} /{' '}
                      {nodes.length} · L{node.level} · {node.componentMultiplier.toFixed(2)}x
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label="Next node"
                    disabled={nodes.length <= 1}
                    onClick={() => setNodeIndex((i) => i + 1)}
                    className="btn-secondary px-3 py-1"
                  >
                    ›
                  </button>
                </div>

                <NodePreview
                  className="mx-auto mt-3 h-[260px] w-full max-w-[340px]"
                  node={{
                    id: node.id,
                    type: node.type,
                    level: node.level,
                    isActive: node.isActive,
                    components: node.components,
                  }}
                />

                {/* 2×2 slot grid */}
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {NODE_SLOTS[node.type].map((slot) => {
                    const comp = node.components.find((c) => c.slot === slot);
                    const enabled = compatible && selected != null && selected.slot === slot;
                    const title = !selected
                      ? 'Select an inventory item first'
                      : !compatible
                        ? 'Selected item belongs to a different node type'
                        : selected.slot === slot
                          ? `Equip selected item onto ${SLOT_LABELS[slot]}`
                          : `Selected item only fits in ${SLOT_LABELS[selected.slot]}`;
                    return (
                      <button
                        key={slot}
                        type="button"
                        title={title}
                        disabled={!enabled || busy}
                        onClick={() => void equip(slot)}
                        className={`flex items-center gap-2 rounded-lg border p-2 text-left transition ${
                          enabled
                            ? 'border-amber-500 bg-amber-500/10 shadow-[0_0_14px_rgba(245,158,11,0.2)]'
                            : 'border-ink-600 bg-ink-800/60'
                        } disabled:cursor-not-allowed`}
                      >
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center">
                          {comp ? (
                            <ComponentTile slot={slot} rarity={asRarity(comp.rarity)} size={44} />
                          ) : (
                            <span className="font-mono text-[9px] uppercase tracking-widest text-steel-600">
                              empty
                            </span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-steel-200">
                            {SLOT_LABELS[slot]}
                          </p>
                          <p
                            className="truncate font-mono text-[10px]"
                            style={{
                              color: comp ? rarityHex(asRarity(comp.rarity)) : '#6b6b6b',
                            }}
                          >
                            {comp ? rarityLabel(comp.rarity) : '— empty —'}
                          </p>
                          {comp && (
                            <p className="font-mono text-[10px] text-steel-500">
                              dura {((comp.durability ?? 1) * 100).toFixed(0)}%
                            </p>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Hints */}
                {!selected ? (
                  <p className="mt-3 text-center text-xs text-steel-500">
                    Pick an instrument from the left to start equipping.
                  </p>
                ) : !compatible ? (
                  <p className="mt-3 text-center text-xs text-steel-500">
                    This item only fits on{' '}
                    {selected.nodeType === 'oil' ? 'an Equity Desk' : 'a Treasury Desk'}. Page to one.
                  </p>
                ) : null}
              </div>
            ) : null}
          </aside>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-[calc(env(safe-area-inset-bottom)_+_84px)] left-1/2 z-[60] -translate-x-1/2 rounded-full border border-amber-500/50 bg-ink-800 px-4 py-2 text-sm text-steel-200 shadow-lg md:bottom-6">
          {toast}
        </div>
      )}
    </PageShell>
  );
}
