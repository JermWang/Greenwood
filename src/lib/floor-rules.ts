// Layout rules and machine utilities — the numbers, with no database attached.
//
// Split out of lib/floor so the client can read them. lib/floor reaches for
// node:sqlite the moment it loads, so anything importing it drags the database
// into the browser bundle; but the UI has to be able to state exactly what a
// Liquidity Desk does and by how much. Both the server scorer and the player
// facing copy now read these same constants, so the panel can never quote a
// bonus the engine does not actually pay.

export type MachineKind = 'equity' | 'rack' | 'cooling' | 'settlement';

/** How close a support desk must be for its bonus to apply, in tiles. */
export const COOLANT_REACH = 4;
export const PACKAGING_REACH = 5;
/** Closer than this and yield desks crowd each other. */
export const CROWDING_DISTANCE = 2;
/** Half-width of the central aisle running down the room. */
export const SPINE_HALF_WIDTH = 2;

export const COOLANT_BONUS = 0.06;
export const PACKAGING_BONUS = 0.05;
export const SPINE_BONUS = 0.04;
export const CROWDING_PENALTY = 0.05;

/** Multiplier bounds. A floor can help a lot but never carry a weak operation. */
export const MIN_MULTIPLIER = 0.8;
export const MAX_MULTIPLIER = 1.35;

/**
 * Component slot to machine kind.
 *
 * Exported because the client renders from the same mapping — if the two drifted,
 * a player would arrange support desks against a layout the server scores as
 * something else, and the bonus panel would lie to them.
 */
export function componentKind(slot: string, family: string): MachineKind {
  const key = slot.toLowerCase();
  if (/pipeline|rail|elevator/.test(key)) return 'settlement';
  if (/flare|drill|pump/.test(key)) return 'cooling';
  return family === 'oil' ? 'equity' : 'rack';
}

export interface MachineFact {
  label: string;
  value: string;
  /** Positive facts read as gains, negative as costs. */
  tone?: 'good' | 'bad';
}

export interface MachineSpec {
  kind: MachineKind;
  name: string;
  /** Does this thing earn on its own, or make its neighbours earn more? */
  role: 'Yield desk' | 'Support desk';
  /** One line a new player can act on. */
  summary: string;
  facts: MachineFact[];
}

const pct = (n: number) => `${n >= 0 ? '+' : ''}${Math.round(n * 100)}%`;

/**
 * What each machine actually does, in the player's words.
 *
 * Yield desks earn emissions directly; support desks earn nothing themselves and
 * exist only to multiply the desks around them. That distinction is the single
 * most useful thing to tell someone staring at a full desk book, so it leads.
 */
export const MACHINE_SPECS: Record<MachineKind, MachineSpec> = {
  equity: {
    kind: 'equity',
    name: 'Equity Desk',
    role: 'Yield desk',
    summary: 'Earns GREEN every second. The higher-yielding of the two desk families, and the one instrument sets are built around.',
    facts: [
      { label: 'Earns emissions', value: 'Yes', tone: 'good' },
      { label: 'Level multiplier', value: 'L1 1.00x → L10 5.00x, then +0.6/level' },
      { label: 'Instrument slots', value: '4 — averaged, then raised to the power 0.75' },
      { label: 'Claim fee', value: '2.00%', tone: 'bad' },
    ],
  },
  rack: {
    kind: 'rack',
    name: 'Treasury Desk',
    role: 'Yield desk',
    summary: 'Earns GREEN from tokenized T-bills, reinvests far cheaper than an Equity Desk, and raises your desk cap as your portfolio grows.',
    facts: [
      { label: 'Earns emissions', value: 'Yes', tone: 'good' },
      { label: 'Level multiplier', value: 'L1 1.00x → L10 5.00x, then +0.6/level' },
      { label: 'Instrument slots', value: '4 — averaged, then raised to the power 0.75' },
      { label: 'Reinvest fee', value: '0.75% vs 2.00% to claim', tone: 'good' },
      { label: 'Bonus desk slots', value: '+2 at L5, +3 at L7, +4 at L9', tone: 'good' },
    ],
  },
  cooling: {
    kind: 'cooling',
    name: 'Liquidity Desk',
    role: 'Support desk',
    summary: `Earns nothing itself. Pays ${pct(COOLANT_BONUS)} to every yield desk within ${COOLANT_REACH} tiles, so it is worth more the more desks it can reach.`,
    facts: [
      { label: 'Earns emissions', value: 'No', tone: 'bad' },
      { label: 'Boost to desks in reach', value: pct(COOLANT_BONUS), tone: 'good' },
      { label: 'Reach', value: `${COOLANT_REACH} tiles` },
      { label: 'Best placed', value: 'Central to a cluster of yield desks' },
    ],
  },
  settlement: {
    kind: 'settlement',
    name: 'Structured Desk',
    role: 'Support desk',
    summary: `Earns nothing itself. Pays ${pct(PACKAGING_BONUS)} to every yield desk within ${PACKAGING_REACH} tiles — a wider reach than a Liquidity Desk, for slightly less.`,
    facts: [
      { label: 'Earns emissions', value: 'No', tone: 'bad' },
      { label: 'Boost to desks in reach', value: pct(PACKAGING_BONUS), tone: 'good' },
      { label: 'Reach', value: `${PACKAGING_REACH} tiles` },
      { label: 'Best placed', value: 'Bridging two clusters of yield desks' },
    ],
  },
};

/** Placement rules that apply to the floor as a whole, not to one machine. */
export const LAYOUT_RULES: MachineFact[] = [
  { label: `On the central aisle (within ${SPINE_HALF_WIDTH} tiles of centre)`, value: pct(SPINE_BONUS), tone: 'good' },
  { label: `Crowded (another desk within ${CROWDING_DISTANCE} tiles)`, value: pct(-CROWDING_PENALTY), tone: 'bad' },
  { label: 'Layout multiplier range', value: `${MIN_MULTIPLIER}x – ${MAX_MULTIPLIER}x` },
];

export const isSupport = (kind: MachineKind) => kind === 'cooling' || kind === 'settlement';
