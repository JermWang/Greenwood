// What the GLB exporter draws, one entry per file it writes.
//
// Derived from ASSETS so the export can never fall behind the asset builder —
// the whole reason asset-registry.ts is derived rather than hand-listed. Each
// registry entry contributes its FIRST variant, which is the neutral one by
// construction: `deskVariants` leads with "No livery", the seeded props lead
// with seed 1, and the stateful ones lead with idle.
//
// EXTRAS is the part that is not derived, and it exists because the registry is
// incomplete. Seven components in MapDressing/OutdoorDressing are exported,
// used by scenes, and absent from ASSETS — so the asset builder cannot show
// them and nothing would have caught one breaking. They are listed here rather
// than added to the registry because that file feeds a player-facing-ish
// workbench and widening it is a separate decision from exporting geometry.

import { ASSETS } from '@/lib/asset-registry';

export interface ExportItem {
  /** Becomes the .glb filename and the Blender object name. */
  id: string;
  name: string;
  category: string;
  source: string;
  props: Record<string, unknown>;
}

/**
 * Models that exist in code but not in ASSETS.
 *
 * `width`/`depth` on SettlementBuilding are required props with no default, so
 * a size has to be chosen here — these are the numbers the Grounds uses for the
 * Machine Room shell, which makes the export match something real rather than
 * an invented box.
 */
const EXTRAS: ExportItem[] = [
  { id: 'dressing-CraftBench', name: 'Craft Bench', category: 'dressing', source: 'components/iso/MapDressing.tsx', props: { seed: 1 } },
  { id: 'outdoor-StreetPlanter', name: 'Street Planter', category: 'outdoor', source: 'components/iso/OutdoorDressing.tsx', props: { seed: 1 } },
  { id: 'outdoor-SettlementBuilding', name: 'Settlement Building', category: 'outdoor', source: 'components/iso/OutdoorDressing.tsx', props: { width: 8, depth: 6, height: 4.2, seed: 1 } },
  { id: 'outdoor-Stump', name: 'Stump', category: 'outdoor', source: 'components/iso/OutdoorDressing.tsx', props: { seed: 1 } },
  { id: 'outdoor-ParkedVan', name: 'Parked Van', category: 'outdoor', source: 'components/iso/OutdoorDressing.tsx', props: { seed: 1 } },
  { id: 'outdoor-Skip', name: 'Skip', category: 'outdoor', source: 'components/iso/OutdoorDressing.tsx', props: { seed: 1 } },
  { id: 'outdoor-PalletStack', name: 'Pallet Stack', category: 'outdoor', source: 'components/iso/OutdoorDressing.tsx', props: { seed: 1 } },
];

/**
 * Props a registry entry needs but does not supply.
 *
 * `Rug` declares `size: [number, number]` with no default and its registry
 * variant is `{}`, so it renders `size[0] - 0.5` against undefined and throws.
 * That is not an export problem — the asset builder hits the same crash, which
 * is how a model nobody could look at stayed broken. Filled in here so the
 * export completes; the registry entry itself still wants fixing.
 */
const REQUIRED_PROPS: Record<string, Record<string, unknown>> = {
  'dressing-Rug': { size: [6, 4] },
};

export const EXPORT_ITEMS: ExportItem[] = [
  ...ASSETS.map((a) => ({
    id: a.id,
    name: a.name,
    category: a.category as string,
    source: a.source,
    props: { ...a.variants[0].props, ...(REQUIRED_PROPS[a.id] ?? {}) },
  })),
  ...EXTRAS,
];
