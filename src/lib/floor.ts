// Fab floor layouts: where a wallet has physically placed its equipment, and
// what that arrangement is worth.
//
// The layout used to live in localStorage, which made it decoration — it could
// not survive a device change and nothing server-side could read it. Once
// placement feeds production it has to be authoritative, and that means the
// server owns it: it decides what a wallet is allowed to place, where, and what
// the arrangement multiplies to. A client that posts a floor full of equipment
// it does not own gets rejected rather than paid.

import { getDb } from './db';
import { GameError } from './errors';
import { recordQuestProgress } from './quests';
import {
  COOLANT_REACH,
  PACKAGING_REACH,
  CROWDING_DISTANCE,
  SPINE_HALF_WIDTH,
  COOLANT_BONUS,
  PACKAGING_BONUS,
  SPINE_BONUS,
  CROWDING_PENALTY,
  MIN_MULTIPLIER,
  MAX_MULTIPLIER,
  componentKind,
  type MachineKind,
} from './floor-rules';

// Re-exported so existing server callers keep importing these from lib/floor,
// while the values themselves live in the client-safe rules module.
export { componentKind };
export type { MachineKind };

export interface PlacedMachine {
  id: string;
  x: number;
  z: number;
  rotation: number;
}

/**
 * The extent the server will accept a machine at.
 *
 * Mirrored client-side by BOARD_BOUNDS in components/iso/IsoBoard. If these two
 * ever disagree, a saved machine can land outside the board and become
 * unreachable, so they must move together.
 */
export const FLOOR_BOUNDS = { minX: -12, maxX: 12, minZ: -20, maxZ: 12 } as const;

/** No wallet can own anywhere near this many machines; it is a payload guard. */
const MAX_PLACEMENTS = 256;

const ID_PATTERN = /^(line|component):(\d+)$/;

interface OwnedMachine {
  id: string;
  kind: MachineKind;
}

/** Every machine id this wallet may legally place, with its true kind. */
export function ownedMachines(wallet: string): Map<string, MachineKind> {
  const db = getDb();
  const owned = new Map<string, MachineKind>();

  const nodes = db
    .prepare('SELECT id, family FROM nodes WHERE wallet = ?')
    .all(wallet) as unknown as Array<{ id: number; family: string }>;
  for (const node of nodes) {
    owned.set(`line:${node.id}`, node.family === 'oil' ? 'equity' : 'rack');
  }

  const components = db
    .prepare('SELECT id, slot, family FROM components WHERE wallet = ?')
    .all(wallet) as unknown as Array<{ id: number; slot: string; family: string }>;
  for (const component of components) {
    owned.set(`component:${component.id}`, componentKind(component.slot, component.family));
  }

  return owned;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Validate a posted layout against what the wallet actually owns.
 *
 * Everything the client sends is treated as a claim, not a fact: ids are checked
 * against owned equipment, coordinates are clamped into the room rather than
 * trusted, and two machines may not occupy the same cell. Unknown ids are
 * dropped instead of rejecting the whole layout, so a player who sells a machine
 * does not end up with a floor they can never save again.
 */
export function normalizeLayout(wallet: string, input: unknown): PlacedMachine[] {
  if (!Array.isArray(input)) throw new GameError('layout must be an array', 400);
  if (input.length > MAX_PLACEMENTS) throw new GameError('layout is too large', 400);

  const owned = ownedMachines(wallet);
  const seenIds = new Set<string>();
  const seenCells = new Set<string>();
  const layout: PlacedMachine[] = [];

  for (const entry of input) {
    if (!entry || typeof entry !== 'object') continue;
    const candidate = entry as Partial<PlacedMachine>;
    if (typeof candidate.id !== 'string' || !ID_PATTERN.test(candidate.id)) continue;
    if (!owned.has(candidate.id) || seenIds.has(candidate.id)) continue;
    if (![candidate.x, candidate.z, candidate.rotation].every((n) => typeof n === 'number' && Number.isFinite(n))) {
      continue;
    }

    const x = Math.round(clamp(candidate.x!, FLOOR_BOUNDS.minX, FLOOR_BOUNDS.maxX));
    const z = Math.round(clamp(candidate.z!, FLOOR_BOUNDS.minZ, FLOOR_BOUNDS.maxZ));
    const cell = `${x}:${z}`;
    if (seenCells.has(cell)) continue;

    // Rotation is stored as a quarter turn so the bonus rules can reason about
    // facing later without carrying float drift from repeated client rounding.
    const quarter = ((Math.round(candidate.rotation! / (Math.PI / 2)) % 4) + 4) % 4;

    seenIds.add(candidate.id);
    seenCells.add(cell);
    layout.push({ id: candidate.id, x, z, rotation: quarter * (Math.PI / 2) });
  }

  return layout;
}

export function getLayout(wallet: string): PlacedMachine[] {
  const row = getDb()
    .prepare('SELECT layout FROM floor_layouts WHERE wallet = ?')
    .get(wallet) as { layout: string } | undefined;
  if (!row) return [];
  try {
    const parsed = JSON.parse(row.layout) as unknown;
    return Array.isArray(parsed) ? (parsed as PlacedMachine[]) : [];
  } catch {
    return [];
  }
}

export function saveLayout(wallet: string, input: unknown): PlacedMachine[] {
  const layout = normalizeLayout(wallet, input);
  getDb()
    .prepare(
      `INSERT INTO floor_layouts (wallet, layout, updated_at) VALUES (?,?,?)
         ON CONFLICT(wallet) DO UPDATE SET layout = excluded.layout, updated_at = excluded.updated_at`
    )
    .run(wallet, JSON.stringify(layout), Date.now());
  // One save is one arrangement action, not one per machine in the payload —
  // the client debounces and posts the whole floor, so counting rows would
  // finish a "rearrange 3 desks" daily on the first save of a full floor.
  recordQuestProgress(wallet, 'place_desk');
  return layout;
}

// ---------------------------------------------------------------------------
// Layout economics
// ---------------------------------------------------------------------------

export interface LayoutEffect {
  key: 'coolant' | 'settlement' | 'spine' | 'crowding';
  label: string;
  /** Signed contribution to the multiplier, already averaged across lines. */
  delta: number;
  /** How many production lines this effect applied to. */
  lines: number;
}

export interface LayoutBonus {
  multiplier: number;
  placed: number;
  lines: number;
  effects: LayoutEffect[];
}

const NEUTRAL: LayoutBonus = { multiplier: 1, placed: 0, lines: 0, effects: [] };

function distance(a: PlacedMachine, b: PlacedMachine) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/**
 * Score an arrangement.
 *
 * Bonuses are earned per production line and then averaged, so the multiplier
 * answers "how well is my fab laid out" rather than "how many machines do I
 * own" — owning more equipment already raises grow power on its own, and having
 * it count twice here would make placement a second, hidden power curve.
 */
export function scoreLayout(layout: PlacedMachine[], kinds: Map<string, MachineKind>): LayoutBonus {
  if (layout.length === 0) return NEUTRAL;

  const withKind = layout.flatMap((machine) => {
    const kind = kinds.get(machine.id);
    return kind ? [{ ...machine, kind }] : [];
  });
  const lines = withKind.filter((m) => m.kind === 'equity' || m.kind === 'rack');
  if (lines.length === 0) {
    return { multiplier: 1, placed: withKind.length, lines: 0, effects: [] };
  }

  const coolers = withKind.filter((m) => m.kind === 'cooling');
  const packers = withKind.filter((m) => m.kind === 'settlement');

  let coolantLines = 0;
  let packagingLines = 0;
  let spineLines = 0;
  let crowdedLines = 0;

  for (const line of lines) {
    if (coolers.some((cooler) => distance(line, cooler) <= COOLANT_REACH)) coolantLines += 1;
    if (packers.some((packer) => distance(line, packer) <= PACKAGING_REACH)) packagingLines += 1;
    if (Math.abs(line.x) <= SPINE_HALF_WIDTH) spineLines += 1;
    if (withKind.some((other) => other.id !== line.id && distance(line, other) < CROWDING_DISTANCE)) {
      crowdedLines += 1;
    }
  }

  // Typed before filtering: `.filter` returns a fresh array, which severs the
  // contextual type and widens `key` back to string.
  const scored: LayoutEffect[] = [
    { key: 'coolant', label: 'Liquidity desk in reach', delta: (coolantLines / lines.length) * COOLANT_BONUS, lines: coolantLines },
    { key: 'settlement', label: 'Structured desk in reach', delta: (packagingLines / lines.length) * PACKAGING_BONUS, lines: packagingLines },
    { key: 'spine', label: 'On the main aisle', delta: (spineLines / lines.length) * SPINE_BONUS, lines: spineLines },
    { key: 'crowding', label: 'Crowded — desks too close', delta: -(crowdedLines / lines.length) * CROWDING_PENALTY, lines: crowdedLines },
  ];
  const effects = scored.filter((effect) => effect.lines > 0);

  const multiplier = clamp(
    1 + effects.reduce((sum, effect) => sum + effect.delta, 0),
    MIN_MULTIPLIER,
    MAX_MULTIPLIER
  );

  return { multiplier, placed: withKind.length, lines: lines.length, effects };
}

/** Scored layout for one wallet, reading both the layout and its owned kinds. */
export function layoutBonus(wallet: string): LayoutBonus {
  const layout = getLayout(wallet);
  if (layout.length === 0) return NEUTRAL;
  return scoreLayout(layout, ownedMachines(wallet));
}

/**
 * Layout multiplier for every wallet that has saved one, in a single pass.
 *
 * The network grow-power denominator has to apply the same multipliers the
 * numerator does, or a well-arranged fab would inflate its own share without
 * anyone else's share shrinking — the bonus would print emission rather than
 * redistribute it. Wallets with no saved layout are simply absent and default
 * to 1.
 */
export function allLayoutMultipliers(): Map<string, number> {
  const db = getDb();
  const rows = db
    .prepare('SELECT wallet, layout FROM floor_layouts')
    .all() as unknown as Array<{ wallet: string; layout: string }>;
  if (rows.length === 0) return new Map();

  const nodes = db
    .prepare('SELECT id, wallet, family FROM nodes')
    .all() as unknown as Array<{ id: number; wallet: string; family: string }>;
  const components = db
    .prepare('SELECT id, wallet, slot, family FROM components')
    .all() as unknown as Array<{ id: number; wallet: string; slot: string; family: string }>;

  const kindsByWallet = new Map<string, Map<string, MachineKind>>();
  const kindsFor = (wallet: string) => {
    let map = kindsByWallet.get(wallet);
    if (!map) {
      map = new Map();
      kindsByWallet.set(wallet, map);
    }
    return map;
  };
  for (const node of nodes) {
    kindsFor(node.wallet).set(`line:${node.id}`, node.family === 'oil' ? 'equity' : 'rack');
  }
  for (const component of components) {
    kindsFor(component.wallet).set(
      `component:${component.id}`,
      componentKind(component.slot, component.family)
    );
  }

  const multipliers = new Map<string, number>();
  for (const row of rows) {
    let layout: PlacedMachine[];
    try {
      const parsed = JSON.parse(row.layout) as unknown;
      layout = Array.isArray(parsed) ? (parsed as PlacedMachine[]) : [];
    } catch {
      continue;
    }
    const score = scoreLayout(layout, kindsFor(row.wallet));
    if (score.multiplier !== 1) multipliers.set(row.wallet, score.multiplier);
  }
  return multipliers;
}

export type { OwnedMachine };
