'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Flask } from '@phosphor-icons/react';
import FabSandbox, { type MachineKind, type SandboxMachine } from '@/components/game/FabSandbox';
import { api, type InventoryItem } from '@/lib/api-client';
import { SLOT_LABELS } from '@/lib/rarity';
import { useOperation } from '@/lib/useOperation';

function componentKind(item: InventoryItem): MachineKind {
  const slot = item.slot.toLowerCase();
  if (/pipeline|rail|elevator/.test(slot)) return 'packaging';
  if (/flare|drill|pump/.test(slot)) return 'cooling';
  return item.family === 'oil' ? 'euv' : 'rack';
}

export default function CompanyFloorPage() {
  const wallet = useOperation((state) => state.wallet);
  const op = useOperation((state) => state.op);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!wallet) return;
    let cancelled = false;
    setLoading(true);
    void api.inventory(wallet).then((result) => {
      if (!cancelled) setInventory(result.items);
    }).catch(() => {
      if (!cancelled) setInventory([]);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [wallet]);

  const machines = useMemo<SandboxMachine[]>(() => [
    ...(op?.nodes ?? []).map((node, index) => ({
      id: `line:${node.id}`,
      kind: (node.type === 'oil' ? 'euv' : 'rack') as MachineKind,
      label: `${node.type === 'oil' ? 'Wafer Fab' : 'Accelerator Line'} ${String(index + 1).padStart(2, '0')}`,
      accent: node.type === 'oil' ? '#b7ff4a' : '#56e5ff',
    })),
    ...inventory.map((item) => ({
      id: `component:${item.id}`,
      kind: componentKind(item),
      label: SLOT_LABELS[item.slot as keyof typeof SLOT_LABELS] ?? 'Fab Component',
      accent: item.rarity === 'divine' ? '#ffdf70' : item.rarity === 'mythic' ? '#ff6ceb' : '#65e8ff',
    })),
  ], [inventory, op?.nodes]);

  if (!wallet) {
    return (
      <div className="gpu-page mx-auto max-w-[900px]">
        <section className="fab-floor-gate"><Flask size={38} weight="duotone" /><h1>Walk the floor first.</h1><p>Connect an operator to organize owned production equipment, or enter the wallet-free demo immediately.</p><div><Link href="/demo" className="btn-primary">Play demo</Link><Link href="/start" className="btn-secondary">Link operator</Link></div></section>
      </div>
    );
  }

  if (loading && machines.length === 0) return <div className="fab-floor-loading">Loading owned equipment…</div>;
  return (
    <FabSandbox
      machines={machines}
      wallet={wallet.toLowerCase()}
      storageKey={`gpu:company-floor:${wallet.toLowerCase()}:v1`}
    />
  );
}
