// BNTY economy constants — matched to the original deployment's reverse-
// engineered tables (see README + guide page for the player-facing versions).

import type { Rarity } from './rarity';

/**
 * Instrument power by rarity.
 *
 * Compressed from a 1 -> 3000 span, and that change is the single most
 * consequential number in the game, so the reasoning is here rather than in a
 * commit message.
 *
 * Desk power is levelMultiplier MULTIPLIED BY the instrument multiplier. With
 * the old table the three levers were wildly different sizes — desk level spanned
 * 5x, floor layout 1.7x, and instruments 6,486x once the boost stack below was
 * applied. A lever 1,300x wider than every other one is not a lever, it is the
 * game; and because instruments are scarce, the optimal play was always to
 * concentrate them onto the deepest desk. archetype-balance.test.ts measured a
 * deep build finishing 366% ahead of a wide one.
 *
 * The span is now 1 -> 20, which under the averaging below yields a best-case
 * gear multiplier of about 4.5x — deliberately comparable to desk level's 5x.
 * Three levers of similar size is what makes a build a choice.
 *
 * Rarity still means something and still reads the same way: each tier is a
 * clear step up, Divine is still the best thing you can find. What it no longer
 * does is make every other decision in the game irrelevant.
 */
export const RARITY_MULT: Record<Rarity, number> = {
  common: 1,
  uncommon: 1.5,
  rare: 2.2,
  epic: 3.6,
  legendary: 6,
  mythic: 11,
  divine: 20,
};

/**
 * Per-component boost stack — now neutral, and kept only so the shape survives.
 *
 * This multiplied PER FITTED INSTRUMENT, so four Divines compounded to 2^4 = 16x
 * on top of the averaged multiplier. That is what made concentrating scarce gear
 * onto one desk beat spreading it by a factor of nearly six, and it is the
 * mechanism that made a deep build unbeatable rather than merely strong.
 *
 * Flattened to 1 rather than deleted: the table is read in several places, and a
 * neutral table keeps those call sites honest while making the stack a knob that
 * is currently off. If a per-instrument bonus comes back it must be additive,
 * not multiplicative.
 */
export const RARITY_BOOST: Record<Rarity, number> = {
  common: 1,
  uncommon: 1,
  rare: 1,
  epic: 1,
  legendary: 1,
  mythic: 1,
  divine: 1,
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

/** Compound level -> capacity + upgrade cost (cost = BNTY to REACH this level). */
export const COMPOUND_LEVELS: Record<
  number,
  { maxNodes: number; cratesPerDay: number; bntyUpgradeCost: number; feeEth: number }
> = {
  // Costs doubled across the board so the first upgrade lands at 1,000 BNTY.
  // Scaling the whole curve rather than only raising the floor keeps the
  // progression intact — bumping L2 alone to 1,000 would have made it cost the
  // same as L3, so the second upgrade would have been free progress.
  1: { maxNodes: 2, cratesPerDay: 3, bntyUpgradeCost: 0, feeEth: 0 },
  2: { maxNodes: 3, cratesPerDay: 4, bntyUpgradeCost: 1000, feeEth: 0.00001 },
  3: { maxNodes: 3, cratesPerDay: 5, bntyUpgradeCost: 2000, feeEth: 0.00001 },
  4: { maxNodes: 4, cratesPerDay: 6, bntyUpgradeCost: 4000, feeEth: 0.00001 },
  5: { maxNodes: 4, cratesPerDay: 8, bntyUpgradeCost: 8000, feeEth: 0.00001 },
  6: { maxNodes: 5, cratesPerDay: 10, bntyUpgradeCost: 16000, feeEth: 0.00001 },
  7: { maxNodes: 5, cratesPerDay: 12, bntyUpgradeCost: 30000, feeEth: 0.00001 },
  8: { maxNodes: 6, cratesPerDay: 15, bntyUpgradeCost: 50000, feeEth: 0.00001 },
  9: { maxNodes: 7, cratesPerDay: 18, bntyUpgradeCost: 80000, feeEth: 0.00001 },
  10: { maxNodes: 8, cratesPerDay: 20, bntyUpgradeCost: 120000, feeEth: 0.00001 },
};
export const MAX_COMPOUND_LEVEL = 10;

/** Treasury Desks add bonus slots at higher portfolio levels. */
export function getShaftBonusSlots(level: number): number {
  if (level >= 9) return 4;
  if (level >= 7) return 3;
  if (level >= 5) return 2;
  return 0;
}

/** Flat BNTY cost to open a mined crate. */
export const CRATE_OPEN_OSR = Number(process.env.NEXT_PUBLIC_OSR_CRATE_OSR ?? 10_000);

/**
 * Optional dollar peg for crate opening. Zero (the default) means the flat BNTY
 * price above is used.
 *
 * The peg exists because a flat token price drifts with the market — 500 BNTY
 * was $0.50 at a $1M cap and $25 at a $50M cap. It is off for now because
 * pegging needs a maintained price feed, and a flat figure that always works
 * beats a pegged one that locks crates whenever the feed goes stale.
 */
export const CRATE_OPEN_USD = Number(process.env.NEXT_PUBLIC_OSR_CRATE_USD ?? 0);

/**
 * What opening a crate costs, in BNTY.
 *
 * Uses the dollar peg only when one is configured AND a live price is known;
 * otherwise the flat price. Never returns null, so crates cannot become
 * unopenable because a price feed lapsed.
 */
export function crateCostBnty(bntyUsdPrice: number | null): number {
  if (CRATE_OPEN_USD > 0 && bntyUsdPrice && bntyUsdPrice > 0) {
    return Math.max(1, Math.round(CRATE_OPEN_USD / bntyUsdPrice));
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

/**
 * The house cut on a player-to-player sale: 2%, matching cosmetics.
 *
 * Unified deliberately so the rule is one sentence a player can hold in their
 * head — "the house takes 2%, and gives all of it back" — and because a single
 * figure is far harder to quietly inflate later than four scattered ones.
 *
 * This applies to TRANSFERS, where value moves between two players. It is not
 * the same thing as the spend splits below, which consume the whole amount.
 */
export const MARKET_FEE_BPS = Number(process.env.NEXT_PUBLIC_OSR_MARKET_FEE_BPS ?? 200);

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
/** Mint BNTY split. */
export const MINT_BURN_BPS = 7000;
export const MINT_TREASURY_BPS = 3000;
/** Upgrade & crate BNTY split: burn / reserve / treasury. */
export const SPLIT_BURN_BPS = 5000;
export const SPLIT_RESERVE_BPS = 3000;
export const SPLIT_TREASURY_BPS = 2000;

// ---------------------------------------------------------------------------
// Cosmetics
// ---------------------------------------------------------------------------

/**
 * The house cut on a cosmetic purchase: 2%.
 *
 * Unlike the other spends in this file, none of it is kept. It is split in half
 * and both halves go back to the players — one burned, tightening supply, and
 * one returned to the emission reserve, which is what actually pays rewards.
 * The treasury takes nothing here on purpose: cosmetics are meant to circulate
 * value rather than extract it.
 */
export const COSMETIC_FEE_BPS = 200;
/** Of the fee above: half burned, half back into the rewards pool. */
export const COSMETIC_FEE_BURN_BPS = 5000;
export const COSMETIC_FEE_RESERVE_BPS = 5000;

/**
 * SCRIP is the earned currency, and most of the cosmetic catalogue is priced in
 * it on purpose. A player should be able to look different without ever buying
 * the token — the wardrobe is the reward for playing, and paywalling all of it
 * turns a status system into a receipt. BNTY and ETH remain for the pieces that
 * are meant to be genuinely scarce.
 */
export type CosmeticCurrency = 'BNTY' | 'ETH' | 'SCRIP';

export interface CosmeticFeeSplit {
  /** Total fee taken from the sale. */
  fee: number;
  /** Fee half that is destroyed. */
  burn: number;
  /** Fee half that funds future rewards. */
  reserve: number;
  /** What remains of the sale after the fee. */
  net: number;
}

/**
 * Split a cosmetic sale into fee, burn, reserve and net.
 *
 * Burn is derived and reserve is the remainder rather than both being computed
 * from basis points, so the two halves always sum to exactly the fee. Computing
 * each independently lets a rounded half-unit go missing on odd amounts, which
 * over many sales is supply that was neither burned nor paid out.
 */
export function cosmeticFeeSplit(amount: number): CosmeticFeeSplit {
  const fee = (amount * COSMETIC_FEE_BPS) / 10_000;
  const burn = (fee * COSMETIC_FEE_BURN_BPS) / 10_000;
  return { fee, burn, reserve: fee - burn, net: amount - fee };
}

/**
 * The upgrade track: how far a cosmetic you already own can be taken.
 *
 * Five steps, and the cap is published rather than open-ended. A visible finish
 * line is what makes the track worth starting — an infinite upgrade path reads
 * as a treadmill, and players stop after the first rung.
 */
export const COSMETIC_MAX_LEVEL = 5;

/**
 * BNTY to take a cosmetic from `fromLevel` to the next step.
 *
 * Priced off the item's own BNTY price so an expensive skin costs more to
 * refine than a cheap one, and geometric so the later steps are a genuine
 * commitment: taking a 6,000 BNTY item to the cap costs about 45,000 in total.
 *
 * This is the sink the token needs. Unlike a multiplier it buys nothing that
 * pays out — the whole amount leaves circulation as fee, burn and revenue — so
 * it can be priced aggressively without touching yield or emission.
 */
export function cosmeticUpgradeCost(basePriceBnty: number, fromLevel: number): number {
  return Math.round(basePriceBnty * 0.4 * Math.pow(1.7, fromLevel));
}

/** Every step's price, for a UI that wants to show the whole ladder up front. */
export function cosmeticUpgradeLadder(basePriceBnty: number): number[] {
  return Array.from({ length: COSMETIC_MAX_LEVEL }, (_, level) =>
    cosmeticUpgradeCost(basePriceBnty, level)
  );
}

// ---------------------------------------------------------------------------
// Fixed Income Notes — the staking vault
// ---------------------------------------------------------------------------

/**
 * Lock BNTY for a fixed term and be paid a published rate out of the emission
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
  { days: 30, aprBps: 800, label: '30-Day Note' },
  { days: 90, aprBps: 1600, label: '90-Day Note' },
  { days: 180, aprBps: 2800, label: '180-Day Note' },
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

/** Interest owed over a full term, in BNTY. Simple interest, not compounded. */
export function stakeTermInterest(principal: number, term: StakeTerm): number {
  return principal * (term.aprBps / 10_000) * (term.days / 365);
}

// Node families
export interface NodeFamilyDef {
  key: 'equity_desk' | 'treasury_desk';
  name: string;
  description: string;
  family: 'oil' | 'mine';
  burnCostBnty: number;
  burnShareBps: number;
  treasuryShareBps: number;
  mintFeeEth: number;
}

export const NODE_FAMILIES: NodeFamilyDef[] = [
  {
    key: 'equity_desk',
    name: 'Equity Desk',
    description: 'Highest base rate of the two families, and the one instrument sets are built around. Claims pay out at the standard 2% fee.',
    family: 'oil',
    burnCostBnty: 1000,
    burnShareBps: MINT_BURN_BPS,
    treasuryShareBps: MINT_TREASURY_BPS,
    mintFeeEth: MINT_FEE_ETH,
  },
  {
    key: 'treasury_desk',
    name: 'Treasury Desk',
    description: 'Tokenized T-bill desk. Earns BNTY, reinvests coupons at a reduced 0.75% fee, and adds bonus desk slots at L5/L7/L9.',
    family: 'mine',
    burnCostBnty: 750,
    burnShareBps: MINT_BURN_BPS,
    treasuryShareBps: MINT_TREASURY_BPS,
    mintFeeEth: MINT_FEE_ETH,
  },
];

// Emission — Bitcoin-style halving curve.
/**
 * Total BNTY supply.
 *
 * Flap mints every launch at its default max supply of 1e9 with 18 decimals,
 * so that is the figure the app must agree with. Overridable because the true
 * number is whatever the deployed token reports: once NEXT_PUBLIC_OSR_TOKEN is
 * set, protocolOverview reads totalSupply() straight off the contract and this
 * constant becomes a fallback for the pre-launch period only.
 *
 * Emission is sized from this rather than hardcoded, so the schedule can never
 * promise more BNTY than the reserve holds. See EMISSION_RESERVE below.
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

/** BNTY set aside at genesis to fund every reward the protocol will ever pay. */
export const EMISSION_RESERVE = TOTAL_SUPPLY * EMISSION_RESERVE_PCT;

/**
 * Genesis emission rate, derived so the halving schedule spends exactly the
 * reserve and not a token more.
 *
 * A halving schedule's lifetime sum is rate * period * 2, so inverting it gives
 * the only rate that makes lifetime emission equal the reserve. Hardcoding the
 * rate instead is how the previous 262 BNTY/sec ended up promising 316.9M
 * against a 229M supply — 38% more than could ever exist.
 */
export const GENESIS_RATE_PER_SEC = EMISSION_RESERVE / ((HALVING_PERIOD_MS / 1000) * 2);

/** Compact figure for display: 1000000000 -> 1B, 316915200 -> 316.9M. */
export function compactBnty(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(n % 1e9 === 0 ? 0 : 2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(n % 1e6 === 0 ? 0 : 1)}M`;
  return Math.round(n).toLocaleString();
}

/**
 * Total BNTY ever paid out as rewards, across every halving cycle.
 *
 * Equal to EMISSION_RESERVE by construction, since the genesis rate is derived
 * from it. Kept as its own name because the docs need to talk about the
 * schedule's lifetime output and the pool funding it as separate ideas.
 */
export const LIFETIME_EMISSION = GENESIS_RATE_PER_SEC * (HALVING_PERIOD_MS / 1000) * 2;

/** Supply left circulating on the curve once the reserve is set aside. */
export const PUBLIC_FLOAT = TOTAL_SUPPLY - EMISSION_RESERVE;

export const SUPPLY_LABEL = compactBnty(TOTAL_SUPPLY);
export const LIFETIME_EMISSION_LABEL = compactBnty(LIFETIME_EMISSION);
export const EMISSION_RESERVE_LABEL = compactBnty(EMISSION_RESERVE);
export const PUBLIC_FLOAT_LABEL = compactBnty(PUBLIC_FLOAT);
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
    return `Day ${String(day).padStart(3)} : ${rate.toFixed(1).padStart(6)} BNTY/sec  (${compactBnty(rate * 86400)}/day${tail})`;
  })
  .join('\n');

/** First-day emission, for the docs' summary line. */
export const DAY_ONE_EMISSION_LABEL = compactBnty(GENESIS_RATE_PER_SEC * 86400);

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
 * One-time BNTY credited to a wallet on first sight so a new operator can afford
 * their first node (a Equity Desk burns 1,000 BNTY). Without this a fresh wallet has
 * no route to its first node: no nodes means no production means nothing to
 * claim, and crates also cost BNTY. Tracked via users.dripped so it grants once.
 */
export const STARTER_BNTY_GRANT = 1_000;

/** Storage cap = 12h of production. */
export const STORAGE_CAP_SECONDS = 43_200;

export const COMPOUND_COOLDOWN_MS = 12 * 3600 * 1000; // 12h, expedite fee skips
