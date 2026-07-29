'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Flask } from '@phosphor-icons/react';
import IsoFloor, { type IsoMachine, type MachineKind } from '@/components/iso/IsoFloor';
import { api, type InventoryItem } from '@/lib/api-client';
import { COMPONENT_RARITIES, SLOT_LABELS, type Rarity } from '@/lib/rarity';
import { MACHINE_SPECS } from '@/lib/floor-rules';
import { useOperation } from '@/lib/useOperation';

function componentKind(item: InventoryItem): MachineKind {
  const slot = item.slot.toLowerCase();
  if (/pipeline|rail|elevator/.test(slot)) return 'settlement';
  if (/flare|drill|pump/.test(slot)) return 'cooling';
  return item.family === 'oil' ? 'equity' : 'rack';
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

  /**
   * The book, with the numbers a placement decision actually needs.
   *
   * Cost and rate come from the same payload the dashboard reads, so what the
   * book quotes and what the engine charges cannot disagree — and the floor
   * stops being a memory test about which desk is which.
   */
  const machines = useMemo<IsoMachine[]>(() => [
    ...(op?.nodes ?? []).map((node, index) => {
      const kind = (node.type === 'oil' ? 'equity' : 'rack') as MachineKind;
      return {
        id: `line:${node.id}`,
        kind,
        label: `${node.type === 'oil' ? 'Equity Desk' : 'Treasury Desk'} ${String(index + 1).padStart(2, '0')}`,
        accent: node.type === 'oil' ? '#00d26a' : '#3dd6a0',
        blurb: MACHINE_SPECS[kind]?.role,
        cost: node.nextLevelCost > 0 ? node.nextLevelCost : undefined,
        detail: `L${node.level} · ${node.productionRate.toFixed(3)} BNTY/s · ${node.componentMultiplier.toFixed(2)}×`,
      };
    }),
    ...inventory.map((item) => {
      const rarity = COMPONENT_RARITIES[item.rarity as Rarity];
      return {
        id: `component:${item.id}`,
        kind: componentKind(item),
        label: SLOT_LABELS[item.slot as keyof typeof SLOT_LABELS] ?? 'Instrument',
        accent: item.rarity === 'divine' ? '#ffdf70' : item.rarity === 'mythic' ? '#ff6ceb' : '#79e0b0',
        blurb: `${rarity?.label ?? item.rarity} instrument — fit it to a desk to raise its multiplier.`,
        detail: `${item.multiplier.toFixed(2)}× · ${item.equippedNodeId ? 'fitted' : 'spare'}`,
      };
    }),
  ], [inventory, op?.nodes]);

  if (!wallet) {
    return (
      <div className="gw-page mx-auto max-w-[900px]">
        <section className="gw-floor-gate"><Flask size={38} weight="duotone" /><h1>Walk the floor first.</h1><p>Connect a fund to organize your owned instruments, or enter the wallet-free demo immediately.</p><div><Link href="/demo" className="btn-primary">Play demo</Link><Link href="/start" className="btn-secondary">Link fund</Link></div></section>
      </div>
    );
  }

  if (loading && machines.length === 0) return <div className="gw-floor-loading">Loading owned instruments…</div>;
  return (
    <IsoFloor
      machines={machines}
      wallet={wallet.toLowerCase()}
      storageKey={`greenwood:company-floor:${wallet.toLowerCase()}:v1`}
    />
  );
}
