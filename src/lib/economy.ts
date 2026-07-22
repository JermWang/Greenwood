// GPU economy constants — matched to the original deployment's reverse-
// engineered tables (see README + guide page for the player-facing versions).

import type { Rarity } from './rarity';

export const RARITY_MULT: Record<Rarity, number> = {
  common: 1,
  uncommon: 1.8,
  rare: 3,
  epic: 10,
  legendary: 50,
  mythic: 300,
  divine: 3000,
};

/** Per-component grow-power boost stack (Formula D). */
export const RARITY_BOOST: Record<Rarity, number> = {
  common: 1,
  uncommon: 1,
  rare: 1,
  epic: 1.05,
  legendary: 1.15,
  mythic: 1.4,
  divine: 2,
};

/** Base crate drop weights (percent). */
export const DROP_WEIGHTS: Record<Rarity, number> = {
  common: 47.9,
  uncommon: 25,
  rare: 15,
  epic: 8,
  legendary: 3,
  mythic: 1,
  divine: 0.1,
};

/** Rarity pools unlock with compound level. */
export const RARITY_UNLOCK_LEVEL: Partial<Record<Rarity, number>> = {
  legendary: 4,
  mythic: 6,
  divine: 8,
};

/** Bad-luck protection ("crates since" thresholds). */
export const PITY = {
  legendary: { soft: 20, hard: 30, rampMax: 4 },
  mythic: { soft: 100, hard: 150, rampMax: 4 },
  divine: { soft: null as number | null, hard: 1500, rampMax: 1 },
};

/** Compound level -> capacity + upgrade cost (cost = GPU to REACH this level). */
export const COMPOUND_LEVELS: Record<
  number,
  { maxNodes: number; cratesPerDay: number; osrUpgradeCost: number; feeEth: number }
> = {
  // Costs doubled across the board so the first upgrade lands at 1,000 GPU.
  // Scaling the whole curve rather than only raising the floor keeps the
  // progression intact — bumping L2 alone to 1,000 would have made it cost the
  // same as L3, so the second upgrade would have been free progress.
  1: { maxNodes: 2, cratesPerDay: 3, osrUpgradeCost: 0, feeEth: 0 },
  2: { maxNodes: 3, cratesPerDay: 4, osrUpgradeCost: 1000, feeEth: 0.00001 },
  3: { maxNodes: 3, cratesPerDay: 5, osrUpgradeCost: 2000, feeEth: 0.00001 },
  4: { maxNodes: 4, cratesPerDay: 6, osrUpgradeCost: 4000, feeEth: 0.00001 },
  5: { maxNodes: 4, cratesPerDay: 8, osrUpgradeCost: 8000, feeEth: 0.00001 },
  6: { maxNodes: 5, cratesPerDay: 10, osrUpgradeCost: 16000, feeEth: 0.00001 },
  7: { maxNodes: 5, cratesPerDay: 12, osrUpgradeCost: 30000, feeEth: 0.00001 },
  8: { maxNodes: 6, cratesPerDay: 15, osrUpgradeCost: 50000, feeEth: 0.00001 },
  9: { maxNodes: 7, cratesPerDay: 18, osrUpgradeCost: 80000, feeEth: 0.00001 },
  10: { maxNodes: 8, cratesPerDay: 20, osrUpgradeCost: 120000, feeEth: 0.00001 },
};
export const MAX_COMPOUND_LEVEL = 10;

/** Cleanrooms add bonus facility slots at higher compound levels. */
export function getShaftBonusSlots(level: number): number {
  if (level >= 9) return 4;
  if (level >= 7) return 3;
  if (level >= 5) return 2;
  return 0;
}

/** Flat GPU cost to open a mined crate. */
export const CRATE_OPEN_OSR = Number(process.env.NEXT_PUBLIC_OSR_CRATE_OSR ?? 10_000);

/**
 * Optional dollar peg for crate opening. Zero (the default) means the flat GPU
 * price above is used.
 *
 * The peg exists because a flat token price drifts with the market — 500 GPU
 * was $0.50 at a $1M cap and $25 at a $50M cap. It is off for now because
 * pegging needs a maintained price feed, and a flat figure that always works
 * beats a pegged one that locks crates whenever the feed goes stale.
 */
export const CRATE_OPEN_USD = Number(process.env.NEXT_PUBLIC_OSR_CRATE_USD ?? 0);

/**
 * What opening a crate costs, in GPU.
 *
 * Uses the dollar peg only when one is configured AND a live price is known;
 * otherwise the flat price. Never returns null, so crates cannot become
 * unopenable because a price feed lapsed.
 */
export function crateCostOsr(osrUsdPrice: number | null): number {
  if (CRATE_OPEN_USD > 0 && osrUsdPrice && osrUsdPrice > 0) {
    return Math.max(1, Math.round(CRATE_OPEN_USD / osrUsdPrice));
  }
  return CRATE_OPEN_OSR;
}

/**
 * Global cap on how many crates the whole network may find per day.
 *
 * Deliberately scarce: crates are meant to feel like a find, and an uncapped
 * drop rate is the same infinite-supply problem as letting people buy them.
 * Raise it as the player base grows.
 */
export const CRATES_FOUND_PER_DAY = Number(process.env.NEXT_PUBLIC_OSR_CRATES_PER_DAY ?? 75);

/**
 * Cap on how much of the daily crate budget a single wallet may take.
 *
 * Drops are weighted by grow-power share, so without this the largest operation
 * would sweep most of a 75-crate day. Mirrors SHARE_CAP's role in emission.
 */
export const CRATE_WALLET_DAILY_CAP = Number(process.env.NEXT_PUBLIC_OSR_CRATE_WALLET_CAP ?? 6);

/** Marketplace fee, in basis points, taken from the sale price. */
export const MARKET_FEE_BPS = Number(process.env.NEXT_PUBLIC_OSR_MARKET_FEE_BPS ?? 250);

/** Node level -> production multiplier (L11+ extrapolates +0.6/level). */
export function levelMultiplier(level: number): number {
  const TABLE: Record<number, number> = {
    1: 1.0, 2: 1.25, 3: 1.55, 4: 1.9, 5: 2.3,
    6: 2.75, 7: 3.25, 8: 3.8, 9: 4.4, 10: 5.0,
  };
  if (level <= 10) return TABLE[Math.max(1, level)];
  return 5.0 + (level - 10) * 0.6;
}

// Fees & splits — protocol fees denominated in ETH (Robinhood Chain gas token).
export const CLAIM_FEE_BPS = 200; // 2% claim fee
export const CLAIM_COOLDOWN_MS = 3_600_000; // 1h per wallet
export const COMPOUND_REINVEST_FEE_BPS = 75; // 0.75% when compounding instead of claiming
export const MINT_FEE_ETH = 0.0002;
export const CRATE_FEE_ETH = 0.00002;
export const COMPOUND_FEE_ETH = 0.00001;
export const EXPEDITE_FEE_ETH = 0.005;
/** Mint GPU split. */
export const MINT_BURN_BPS = 7000;
export const MINT_TREASURY_BPS = 3000;
/** Upgrade & crate GPU split: burn / reserve / treasury. */
export const SPLIT_BURN_BPS = 5000;
export const SPLIT_RESERVE_BPS = 3000;
export const SPLIT_TREASURY_BPS = 2000;

// ---------------------------------------------------------------------------
// Fab Capacity Contracts — the staking vault
// ---------------------------------------------------------------------------

/**
 * Lock GPU for a fixed term and be paid a published rate out of the emission
 * reserve. The rates rise faster than the term does — 180 days pays more than
 * six times the 30-day rate — because the point of the instrument is to take
 * float out of circulation for long enough to matter, and a linear ladder gives
 * nobody a reason to pick the long end.
 *
 * Interest is simple, not compounding, and is fixed at the moment a contract
 * opens. A rate that moved underneath an open position would make the payout
 * unknowable at the time of the decision, which is exactly what a fixed-term
 * instrument exists to avoid.
 */
export interface StakeTerm {
  days: number;
  aprBps: number;
  label: string;
}

export const STAKE_TERMS: readonly StakeTerm[] = [
  { days: 30, aprBps: 800, label: 'Short run' },
  { days: 90, aprBps: 1600, label: 'Production run' },
  { days: 180, aprBps: 2800, label: 'Full campaign' },
] as const;

/** Below this a contract's interest is dust and the row costs more than it earns. */
export const STAKE_MIN_OSR = 100;

/** Cap on simultaneously open contracts per operator, so positions stay legible. */
export const STAKE_MAX_OPEN = 8;

/**
 * Early exit forfeits all accrued interest and burns this much of the principal
 * to the treasury. Without a principal penalty a contract would be a free
 * option: lock at a fixed rate, and walk the moment anything better appears.
 */
export const STAKE_EARLY_EXIT_PENALTY_BPS = 1000;

/** Interest owed over a full term, in GPU. Simple interest, not compounded. */
export function stakeTermInterest(principal: number, term: StakeTerm): number {
  return principal * (term.aprBps / 10_000) * (term.days / 365);
}

// Node families
export interface NodeFamilyDef {
  key: 'oil_rig' | 'mine_shaft';
  name: string;
  description: string;
  family: 'oil' | 'mine';
  burnCostOsr: number;
  burnShareBps: number;
  treasuryShareBps: number;
  mintFeeEth: number;
}

export const NODE_FAMILIES: NodeFamilyDef[] = [
  {
    key: 'oil_rig',
    name: 'Wafer Fab',
    description: 'Front-end silicon production wing. Farms GPU and unlocks the strategic xStock bonus pool at Warehouse L5+.',
    family: 'oil',
    burnCostOsr: 1000,
    burnShareBps: MINT_BURN_BPS,
    treasuryShareBps: MINT_TREASURY_BPS,
    mintFeeEth: MINT_FEE_ETH,
  },
  {
    key: 'mine_shaft',
    name: 'Cleanroom',
    description: 'Back-end dicing and packaging wing. Farms GPU, compounds at a reduced 0.75% fee, and adds bonus facility slots at L5/L7/L9.',
    family: 'mine',
    burnCostOsr: 750,
    burnShareBps: MINT_BURN_BPS,
    treasuryShareBps: MINT_TREASURY_BPS,
    mintFeeEth: MINT_FEE_ETH,
  },
];

// Emission — Bitcoin-style halving curve.
/**
 * Total GPU supply.
 *
 * Flap mints every launch at its default max supply of 1e9 with 18 decimals,
 * so that is the figure the app must agree with. Overridable because the true
 * number is whatever the deployed token reports: once NEXT_PUBLIC_OSR_TOKEN is
 * set, protocolOverview reads totalSupply() straight off the contract and this
 * constant becomes a fallback for the pre-launch period only.
 *
 * Emission is sized from this rather than hardcoded, so the schedule can never
 * promise more GPU than the reserve holds. See EMISSION_RESERVE below.
 */
export const TOTAL_SUPPLY = Number(
  process.env.NEXT_PUBLIC_OSR_TOTAL_SUPPLY ?? 1_000_000_000
);

/**
 * How often emission halves — the lever that sets how long the game lives.
 *
 * Note this is independent of EMISSION_RESERVE_PCT. Because the genesis rate is
 * derived as reserve/(period*2), changing the reserve percentage scales how much
 * players earn but leaves the curve's shape untouched: a 5% reserve and a 10%
 * reserve are both half-spent after one period and ~94% spent after four. Only
 * this constant changes the timeline.
 *
 * At the original 7 days the reserve was 94% gone inside a month. Fortnightly
 * keeps a hot launch (3.6% of the reserve on day one) while stretching
 * meaningful emission across a quarter rather than a few weeks.
 */
export const HALVING_PERIOD_MS = 14 * 24 * 3600 * 1000; // halves fortnightly
export const SHARE_CAP = 0.3; // no user captures more than 30% of emission

/**
 * Share of total supply reserved to pay node rewards.
 *
 * On a Flap launch the full 1e9 is minted to the bonding curve; this slice is
 * acquired at genesis and held as the emission reserve, leaving the remainder
 * as public float. Rewards are the product here, so a dedicated rewards pool is
 * the allocation that actually has to exist.
 */
export const EMISSION_RESERVE_PCT = Number(
  process.env.NEXT_PUBLIC_OSR_EMISSION_RESERVE_PCT ?? 0.05
);

/** GPU set aside at genesis to fund every reward the protocol will ever pay. */
export const EMISSION_RESERVE = TOTAL_SUPPLY * EMISSION_RESERVE_PCT;

/**
 * Genesis emission rate, derived so the halving schedule spends exactly the
 * reserve and not a token more.
 *
 * A halving schedule's lifetime sum is rate * period * 2, so inverting it gives
 * the only rate that makes lifetime emission equal the reserve. Hardcoding the
 * rate instead is how the previous 262 GPU/sec ended up promising 316.9M
 * against a 229M supply — 38% more than could ever exist.
 */
export const GENESIS_RATE_PER_SEC = EMISSION_RESERVE / ((HALVING_PERIOD_MS / 1000) * 2);

/** Compact figure for display: 1000000000 -> 1B, 316915200 -> 316.9M. */
export function compactOsr(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(n % 1e9 === 0 ? 0 : 2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(n % 1e6 === 0 ? 0 : 1)}M`;
  return Math.round(n).toLocaleString();
}

/**
 * Total GPU ever paid out as rewards, across every halving cycle.
 *
 * Equal to EMISSION_RESERVE by construction, since the genesis rate is derived
 * from it. Kept as its own name because the docs need to talk about the
 * schedule's lifetime output and the pool funding it as separate ideas.
 */
export const LIFETIME_EMISSION = GENESIS_RATE_PER_SEC * (HALVING_PERIOD_MS / 1000) * 2;

/** Supply left circulating on the curve once the reserve is set aside. */
export const PUBLIC_FLOAT = TOTAL_SUPPLY - EMISSION_RESERVE;

export const SUPPLY_LABEL = compactOsr(TOTAL_SUPPLY);
export const LIFETIME_EMISSION_LABEL = compactOsr(LIFETIME_EMISSION);
export const EMISSION_RESERVE_LABEL = compactOsr(EMISSION_RESERVE);
export const PUBLIC_FLOAT_LABEL = compactOsr(PUBLIC_FLOAT);
export const RESERVE_PCT_LABEL = `${Math.round(EMISSION_RESERVE_PCT * 100)}%`;
export const FLOAT_PCT_LABEL = `${Math.round((1 - EMISSION_RESERVE_PCT) * 100)}%`;

/**
 * The halving schedule as displayed text, derived from GENESIS_RATE_PER_SEC.
 *
 * Built rather than written out: these figures move whenever the reserve
 * percentage changes, and a hardcoded table silently goes stale the moment it
 * does (exactly how the old 229M supply figures drifted).
 */
/** Halving period in days, and a label for prose ("14 days"). */
export const HALVING_PERIOD_DAYS = HALVING_PERIOD_MS / 86_400_000;
export const HALVING_PERIOD_LABEL = `${HALVING_PERIOD_DAYS} days`;

// Sampled at whole halvings so the table stays meaningful whatever the period
// is. The previous version divided by a hardcoded 7, which would have gone
// stale the moment HALVING_PERIOD_MS changed — the same failure as the old
// 229M supply figures.
export const HALVING_SCHEDULE_TEXT = [0, 1, 2, 3]
  .map((cycle) => {
    const day = Math.round(cycle * HALVING_PERIOD_DAYS);
    const rate = GENESIS_RATE_PER_SEC / Math.pow(2, cycle);
    const emittedPct = Math.round((1 - Math.pow(0.5, cycle)) * 100);
    const tail = cycle === 0 ? '' : `, ${emittedPct}% of lifetime emitted`;
    return `Day ${String(day).padStart(3)} : ${rate.toFixed(1).padStart(6)} GPU/sec  (${compactOsr(rate * 86400)}/day${tail})`;
  })
  .join('\n');

/** First-day emission, for the docs' summary line. */
export const DAY_ONE_EMISSION_LABEL = compactOsr(GENESIS_RATE_PER_SEC * 86400);

/**
 * Day by which 99% of the reserve has been emitted — the point where the tail
 * stops being worth playing for. Derived, because the docs quote it and a
 * hardcoded "day ~60" silently became wrong the moment the period changed.
 */
export const EMISSION_TAIL_DAY = Math.round(HALVING_PERIOD_DAYS * Math.log2(100));

export function emissionRateAt(genesisMs: number, nowMs: number): number {
  const cycle = Math.max(0, Math.floor((nowMs - genesisMs) / HALVING_PERIOD_MS));
  return GENESIS_RATE_PER_SEC / 2 ** cycle;
}

export function halvingInfo(genesisMs: number, nowMs: number) {
  const cycleIndex = Math.max(0, Math.floor((nowMs - genesisMs) / HALVING_PERIOD_MS));
  const cycleStart = genesisMs + cycleIndex * HALVING_PERIOD_MS;
  const nextHalvingMs = cycleStart + HALVING_PERIOD_MS;
  const currentRatePerSec = GENESIS_RATE_PER_SEC / 2 ** cycleIndex;
  return {
    cycleIndex,
    nextHalvingMs,
    currentRatePerSec,
    nextRatePerSec: currentRatePerSec / 2,
    cycleProgress: (nowMs - cycleStart) / HALVING_PERIOD_MS,
  };
}

// Welcome boost: 8x -> 1x linearly over 72h from first mint.
export const WELCOME_BOOST_WINDOW_S = 259_200;

export function welcomeBoostFactor(joinedAtMs: number | null, nowMs: number): number {
  if (!joinedAtMs) return 1;
  const t = Math.max(0, (nowMs - joinedAtMs) / 1000);
  if (t >= WELCOME_BOOST_WINDOW_S) return 1;
  return 1 + 7 * (1 - t / WELCOME_BOOST_WINDOW_S);
}

/**
 * One-time GPU credited to a wallet on first sight so a new operator can afford
 * their first node (a Wafer Fab burns 1,000 GPU). Without this a fresh wallet has
 * no route to its first node: no nodes means no production means nothing to
 * claim, and crates also cost GPU. Tracked via users.dripped so it grants once.
 */
export const STARTER_OSR_GRANT = 1_000;

/** Storage cap = 12h of production. */
export const STORAGE_CAP_SECONDS = 43_200;

export const COMPOUND_COOLDOWN_MS = 12 * 3600 * 1000; // 12h, expedite fee skips

// xStock
export const XSTOCK_MIN_COMPOUND_LEVEL = 5;
export const AUTO_SWAP_ENABLED = false;
export const XSTOCK_ACCRUAL_RATE = 0.01;
