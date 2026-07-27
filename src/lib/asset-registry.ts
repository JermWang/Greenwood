// Every visual asset in the game, in one enumerable list.
//
// This backs the asset builder at /dev/assets. The point is not documentation —
// it is that there has never been a way to LOOK at everything. Models live in
// four component files, liveries in two data maps, and the only way to see a
// prop was to find a room that happened to place one. Anything that shipped
// broken stayed broken until somebody wandered past it.
//
// The registry is DERIVED wherever a source of truth already exists. Desk
// liveries come from DESK_LIVERIES, avatar skins from AVATAR_SKINS, cosmetics
// from the catalogue. A hand-maintained copy would go stale the first time
// somebody added a cosmetic, and a stale asset browser is worse than none: it
// would show a full set while a new item was missing from it.

// Imports the RENDER MAPS, never lib/cosmetics. The catalogue reaches for
// node:sqlite the moment it loads, and this module is consumed by a client
// component — importing it drags the database into the browser bundle and the
// build fails on `Can't resolve 'fs'`. Same reason floor-rules.ts exists apart
// from lib/floor.
//
// Deriving from the render maps is also the more honest source for a browser of
// ASSETS: these are the things that can be drawn, which is not quite the same
// set as the things that can be bought.
import { AVATAR_SKINS } from '../components/iso/avatar-skins';
import { DESK_LIVERIES, PLINTH_LIVERIES } from '../components/iso/desk-liveries';

export type AssetCategory =
  | 'desk'
  | 'character'
  | 'dressing'
  | 'architecture'
  | 'portal'
  | 'outdoor';

/**
 * A named variant of an asset — a livery, a skin, a seed.
 *
 * `props` is handed to the preview verbatim, so a variant is defined entirely by
 * data and adding one never means touching the viewer.
 */
export interface AssetVariant {
  id: string;
  label: string;
  props: Record<string, unknown>;
}

export interface AssetEntry {
  id: string;
  name: string;
  category: AssetCategory;
  /** Where the model is defined, so the builder can send you to the code. */
  source: string;
  /** What it is for, in one line. */
  blurb: string;
  /**
   * Animation states this asset can be in.
   *
   * Empty for anything static, which is most of the set — and saying so
   * explicitly is useful, because "this does not animate" is a fact worth being
   * able to check rather than assume.
   */
  animations: string[];
  variants: AssetVariant[];
  /** Suggested camera distance. A wall and a bolt need very different framing. */
  scale: number;
}

/** Desk liveries as preview variants, straight from the render map. */
function deskVariants(): AssetVariant[] {
  return [
    { id: 'none', label: 'No livery', props: {} },
    ...Object.keys(DESK_LIVERIES).map((key) => ({
      id: key,
      label: labelFor(key),
      props: { livery: { desk: key, deskLevel: 0 } },
    })),
    // The refinement track is only visible at the top of the ladder, so the
    // builder offers a maxed version of each livery rather than making someone
    // buy five upgrades to see whether polish actually does anything.
    ...Object.keys(DESK_LIVERIES).map((key) => ({
      id: `${key}-max`,
      label: `${labelFor(key)} · refined`,
      props: { livery: { desk: key, deskLevel: 5 } },
    })),
  ];
}

function plinthVariants(): AssetVariant[] {
  return [
    { id: 'none', label: 'Steel (default)', props: {} },
    ...Object.keys(PLINTH_LIVERIES).map((key) => ({
      id: key,
      label: labelFor(key),
      props: { livery: { plinth: key, plinthLevel: 0 } },
    })),
  ];
}

/**
 * Words that title-casing gets wrong.
 *
 * `desk_gm` came out as "Gm", which is not what anyone calls it — and because
 * the label is what the builder's variant buttons are keyed by, a wrong label is
 * a variant you cannot select by name. Kept as a map rather than a clever rule:
 * there is no general way to tell an acronym from a short word.
 */
const LABEL_OVERRIDES: Record<string, string> = {
  gm: 'GM',
  hi: 'Hi',
  vis: 'Vis',
};

/** A readable label from a cosmetic key: `desk_green_candles` → `Green Candles`. */
function labelFor(key: string): string {
  return key
    .replace(/^(desk|plinth|avatar)_/, '')
    .split('_')
    .map((word) => LABEL_OVERRIDES[word] ?? word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
    // "Hi Vis" is hyphenated everywhere else it appears, including the shop.
    .replace('Hi Vis', 'Hi-Vis');
}

const DESK_KINDS = [
  { id: 'euv', name: 'Equity Desk', blurb: 'Yield desk. The tall glass-and-panel tower.' },
  { id: 'rack', name: 'Treasury Desk', blurb: 'Yield desk. Squat vault silhouette.' },
  { id: 'cooling', name: 'Liquidity Desk', blurb: 'Support desk. Boosts yield desks in reach.' },
  { id: 'packaging', name: 'Structured Desk', blurb: 'Support desk. Wider reach, smaller bonus.' },
];

export const ASSETS: AssetEntry[] = [
  ...DESK_KINDS.map((kind) => ({
    id: `desk-${kind.id}`,
    name: kind.name,
    category: 'desk' as const,
    source: 'components/iso/DeskModels.tsx',
    blurb: kind.blurb,
    animations: [],
    variants: deskVariants().map((v) => ({
      ...v,
      props: { ...v.props, kind: kind.id },
    })),
    scale: 1,
  })),
  {
    id: 'plinth',
    name: 'Plinth',
    category: 'desk',
    source: 'components/iso/DeskModels.tsx',
    blurb: 'What every desk stands on. Its own cosmetic slot.',
    animations: [],
    // Shown under an Equity Desk rather than alone: a plinth by itself is a
    // slab, and the thing being judged is how it sits under a machine.
    variants: plinthVariants().map((v) => ({ ...v, props: { ...v.props, kind: 'euv' } })),
    scale: 1,
  },
  {
    id: 'character',
    name: 'Fund Avatar',
    category: 'character',
    source: 'components/iso/Character.tsx',
    blurb: 'The player. Hands, boots and paired eyes; walk cycle derived from motion.',
    // Not a list of clips — the avatar has no skeletal animation. These are the
    // states the component can be in, and each is driven by a different input:
    // walking comes from velocity, interact from the action prop.
    animations: ['idle', 'walking', 'interact', 'turning'],
    variants: [
      { id: 'default', label: 'No cosmetic', props: {} },
      ...Object.keys(AVATAR_SKINS).map((key) => ({
        id: key,
        label: labelFor(key),
        props: { outfit: key },
      })),
    ],
    scale: 1,
  },
  {
    id: 'portal',
    name: 'Doorway',
    category: 'portal',
    source: 'components/iso/MapDressing.tsx',
    blurb: 'A way out. Frame, lit threshold, ground arrow — all four wall sides.',
    animations: ['idle', 'active'],
    variants: [
      { id: 'south', label: 'South wall', props: { facing: 0 } },
      { id: 'north', label: 'North wall', props: { facing: Math.PI } },
      { id: 'east', label: 'East wall', props: { facing: Math.PI / 2 } },
      { id: 'west', label: 'West wall', props: { facing: -Math.PI / 2 } },
    ],
    scale: 2.2,
  },
];

/** Dressing props, which all share one shape: a position and maybe a seed. */
const DRESSING: Array<{ id: string; name: string; blurb: string; seeds?: number; scale?: number }> = [
  { id: 'Planter', name: 'Planter', blurb: 'Evergreen in a box. The mark, in three dimensions.', seeds: 4 },
  { id: 'Bench', name: 'Bench', blurb: 'Lounge seating.' },
  { id: 'Stanchion', name: 'Stanchion', blurb: 'Queue post, optionally roped.' },
  { id: 'CrateStack', name: 'Crate Stack', blurb: 'Stacked shipping crates.', seeds: 4 },
  { id: 'ServicePanel', name: 'Service Panel', blurb: 'Wall-mounted plant panel.', seeds: 3 },
  { id: 'Column', name: 'Column', blurb: 'Structural column.', scale: 2.4 },
  { id: 'Beam', name: 'Beam', blurb: 'Overhead tie between columns.', scale: 3 },
  { id: 'PipeRun', name: 'Pipe Run', blurb: 'Ceiling services.', scale: 3 },
  { id: 'Pendant', name: 'Pendant', blurb: 'Hanging light with a real pool under it.', scale: 2 },
  { id: 'TickerBoard', name: 'Ticker Board', blurb: 'The one live surface on the Trading Floor.', scale: 2.4 },
  { id: 'ZoneSign', name: 'Zone Sign', blurb: 'Lit overhead area label.', scale: 2 },
  { id: 'Medallion', name: 'Medallion', blurb: 'The atrium floor inlay.', scale: 3 },
  { id: 'Rug', name: 'Rug', blurb: 'Lounge floor covering.', scale: 2.4 },
  { id: 'Wall', name: 'Wall', blurb: 'Glazed wall section.', scale: 4 },
];

for (const prop of DRESSING) {
  ASSETS.push({
    id: `dressing-${prop.id}`,
    name: prop.name,
    category: prop.id === 'Wall' || prop.id === 'Column' || prop.id === 'Beam' ? 'architecture' : 'dressing',
    source: 'components/iso/MapDressing.tsx',
    blurb: prop.blurb,
    animations: [],
    variants: prop.seeds
      ? Array.from({ length: prop.seeds }, (_, i) => ({
          id: `seed-${i}`,
          label: `Seed ${i + 1}`,
          props: { seed: i + 1 },
        }))
      : [{ id: 'default', label: 'Default', props: {} }],
    scale: prop.scale ?? 1.6,
  });
}

/**
 * Outdoor props, for Greenwood Grounds and the Treeline.
 *
 * Registered before any scene uses them, so each piece can be judged on its own.
 * The alternative is building a two-hundred-tree wood and discovering the tree
 * was wrong at the two-hundredth one.
 */
const OUTDOOR: Array<{
  id: string;
  name: string;
  blurb: string;
  seeds?: number;
  scale?: number;
  variants?: AssetVariant[];
}> = [
  {
    id: 'Tree',
    name: 'Conifer',
    blurb: 'The mark at scale. Free rotation — a tree line should not look planted.',
    seeds: 5,
    scale: 3,
  },
  {
    id: 'DeadTree',
    name: 'Dead Tree',
    blurb: 'Sparse, among live ones. A wood something happened to.',
    seeds: 4,
    scale: 3,
  },
  {
    id: 'Boulder',
    name: 'Boulder',
    blurb: 'Deliberately dull. Stops open ground reading as lawn.',
    seeds: 4,
    scale: 1.4,
  },
  {
    id: 'FenceSection',
    name: 'Perimeter Fence',
    blurb: 'Site fencing, until you notice the height and which way the floodlight points.',
    scale: 2.6,
    variants: [
      { id: 'plain', label: 'Plain run', props: {} },
      { id: 'lit', label: 'With floodlight', props: { floodlight: true } },
      { id: 'dark', label: 'Floodlight, dead', props: { floodlight: true, lightOn: false } },
    ],
  },
  {
    id: 'BrokenBarrier',
    name: 'Broken Barrier',
    blurb: 'Used to keep people to a path. Boards go missing on a seeded pattern.',
    seeds: 4,
    scale: 2,
  },
  {
    id: 'WreckedCar',
    name: 'Wrecked Car',
    blurb: 'On the grid and on a quarter turn. Wheels, doors and paint all vary.',
    seeds: 5,
    scale: 2.4,
  },
  {
    id: 'RockCluster',
    name: 'Rock Cluster',
    blurb: 'An outcrop rather than a single stone. Still one tile.',
    seeds: 4,
    scale: 1.4,
  },
  {
    id: 'GatheringNode',
    name: 'Gathering Node',
    blurb: 'Harvestable. Dims rather than vanishing when spent, so players learn it recharges.',
    scale: 1.2,
    variants: [
      { id: 'scrap', label: 'Scrap', props: { kind: 'scrap' } },
      { id: 'timber', label: 'Timber', props: { kind: 'timber' } },
      { id: 'cable', label: 'Cable', props: { kind: 'cable' } },
      { id: 'spent', label: 'Scrap, depleted', props: { kind: 'scrap', depleted: true } },
    ],
  },
];

for (const prop of OUTDOOR) {
  ASSETS.push({
    id: `outdoor-${prop.id}`,
    name: prop.name,
    category: 'outdoor',
    source: 'components/iso/OutdoorDressing.tsx',
    blurb: prop.blurb,
    animations: [],
    variants:
      prop.variants ??
      (prop.seeds
        ? Array.from({ length: prop.seeds }, (_, i) => ({
            id: `seed-${i}`,
            label: `Seed ${i + 1}`,
            props: { seed: i + 1 },
          }))
        : [{ id: 'default', label: 'Default', props: {} }]),
    scale: prop.scale ?? 1.6,
  });
}

/**
 * Creatures.
 *
 * Registered so a silhouette can be judged on a turntable before any spawning or
 * AI depends on it. The entire design brief for these is that you can tell what
 * one is from its shape alone, at distance, in fog — which is a thing you can
 * only check by looking at it.
 */
const CREATURES: Array<{ id: string; name: string; blurb: string }> = [
  { id: 'Shambler', name: 'Shambler', blurb: 'Upright, narrow, arms forward. Slow.' },
  { id: 'Wolf', name: 'Wolf', blurb: 'Low, long, wide stance. Fast.' },
];

for (const creature of CREATURES) {
  ASSETS.push({
    id: `creature-${creature.id}`,
    name: creature.name,
    category: 'character',
    source: 'components/iso/Creatures.tsx',
    blurb: creature.blurb,
    animations: ['idle', 'hunting', 'dead'],
    variants: [
      { id: 'idle', label: 'Idle', props: { state: 'idle' } },
      { id: 'hunting', label: 'Hunting', props: { state: 'hunting' } },
      { id: 'dead', label: 'Dead', props: { state: 'dead' } },
      { id: 'seed2', label: 'Seed 2', props: { seed: 2 } },
      { id: 'seed3', label: 'Seed 3', props: { seed: 3 } },
    ],
    scale: 1.5,
  });
}

export const CATEGORIES: Array<{ id: AssetCategory; label: string }> = [
  { id: 'desk', label: 'Desks' },
  { id: 'character', label: 'Characters' },
  { id: 'dressing', label: 'Dressing' },
  { id: 'architecture', label: 'Architecture' },
  { id: 'portal', label: 'Portals' },
  { id: 'outdoor', label: 'Outdoors' },
];

export function assetById(id: string): AssetEntry | null {
  return ASSETS.find((a) => a.id === id) ?? null;
}

/** Totals for the builder's header, so gaps are visible at a glance. */
export function assetCounts() {
  return {
    assets: ASSETS.length,
    variants: ASSETS.reduce((sum, a) => sum + a.variants.length, 0),
    animated: ASSETS.filter((a) => a.animations.length > 0).length,
  };
}
