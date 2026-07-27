'use client';

// Client for the same-origin API. Privy tokens are attached automatically when
// managed wallet mode is configured, allowing the server to bind every write
// to the authenticated wallet owner.

import { getAccessToken, getIdentityToken } from '@privy-io/react-auth';
import { PRIVY_CONFIGURED } from './config';
import {
  submitPayment,
  type PaymentRequest,
  type StepHandler,
} from './settlement-client';

export type { SettlementStep, StepHandler } from './settlement-client';

export interface NodeInfo {
  id: string;
  type: 'oil' | 'mine';
  level: number;
  productionRate: number;
  isActive: boolean;
  totalProduced: number;
  createdAt: string;
  layoutSeed: number;
  components: Array<{ slot: string; rarity: string; durability?: number }>;
  componentMultiplier: number;
  pendingOsr: number;
  storageCap: number;
  nextLevelCost: number;
}

export interface CompoundInfo {
  level: number;
  maxNodes: number;
  shaftBonusSlots: number;
  cratesPerDay: number;
  crateCost: number;
  cooldownRemainingMs: number;
  nextUpgradeCost: null | {
    targetLevel: number;
    totalOsr: number;
    feeEth: number;
    burnOsr: number;
    reserveOsr: number;
    treasuryOsr: number;
  };
}

export interface UserOperation {
  level: number;
  maxNodes: number;
  shaftBonusSlots: number;
  productionRate: number;
  growPower: number;
  networkGrowPower: number;
  joinedAtMs: number | null;
  welcomeBoostFactor: number;
  osrBalance: number;
  totalProduced: number;
  totals: Record<string, number>;
  pending: Record<string, number>;
  claimCooldownRemainingMs: number;
  crateCooldown: { rigCratesRemaining: number; shaftCratesRemaining: number };
  /** Mined, unopened crates held by this wallet. */
  crates: Array<{
    id: number;
    crateType: 'rig_crate' | 'shaft_crate';
    foundAt: number;
    foundNodeId: number | null;
  }>;
  /** Subset of the above the operator has not been shown yet. */
  unseenCrates: Array<{
    id: number;
    crateType: 'rig_crate' | 'shaft_crate';
    foundAt: number;
    foundNodeId: number | null;
  }>;
  compound: CompoundInfo;
  nodes: NodeInfo[];
}

export interface ProtocolOverview {
  networkProductionRate: number;
  emissionFactors: { shareCap: number };
  totalNodes: number;
  totalOilRigs: number;
  totalMiningShafts: number;
  totalSupply: number;
  totalOsrBurned: number;
  totalCreatorRewardsProcessed: number;
  osrReserveBalance: number;
  treasury: number;
  genesisMs: number;
  halving: {
    cycleIndex: number;
    nextHalvingMs: number;
    currentRatePerSec: number;
    nextRatePerSec: number;
    cycleProgress: number;
  };
  totalEmitted: number;
  /** Depth of the reserve at today's draw, not a solvency countdown. */
  reserveDaysAtCurrentRate: number;
  contracts: { open: number; lockedPrincipal: number; committedInterest: number };
  mirroredBalances: number;
  activeOperators: number;
}


export interface TrackProgress {
  key: string;
  name: string;
  blurb: string;
  xp: number;
  level: number;
  intoLevel: number;
  levelSpan: number;
  /** True once this track has reached the per-track ceiling. */
  atCap: boolean;
}

export interface Progression {
  tracks: TrackProgress[];
  totalLevel: number;
  totalXp: number;
  /** The ceiling, so the UI never hardcodes 25. */
  maxTotalLevel: number;
  /** True at the cap: XP is still banking, but the level will not move. */
  capped: boolean;
}

export interface QuestView {
  key: string;
  label: string;
  target: number;
  track: string;
  xp: number;
  progress: number;
  complete: boolean;
  claimed: boolean;
}

export interface QuestsResponse {
  day: number;
  resetsInMs: number;
  quests: QuestView[];
  progression: Progression;
}

export type CosmeticSlot = 'avatar' | 'desk' | 'plinth';
export type CosmeticTier = 'standard' | 'rare' | 'signature';

/** One step of the introduction, as the server describes it. */
export interface IntroStepView {
  key: string;
  label: string;
  /** The mechanic this step teaches. Shown under the label, not hidden away. */
  why: string;
  target: number;
  progress: number;
  xp: number;
  scrip: number;
  /** Where to go to do it. */
  href: string;
  done: boolean;
  claimed: boolean;
  /** Exactly one step is current at a time. */
  current: boolean;
}

export interface IntroState {
  steps: IntroStepView[];
  currentKey: string | null;
  completed: number;
  total: number;
  finished: boolean;
}

export interface IntroResponse {
  intro: IntroState;
  progression: Progression;
}

/** One region and this fund's verdict on it. */
export interface RegionView {
  id: string;
  name: string;
  href: string;
  blurb: string;
  minTotalLevel: number;
  pvp: boolean;
  hostiles: boolean;
  requiresPack: boolean;
  lighting: string;
  /** Whether this wallet may enter right now. */
  allowed: boolean;
  /** Player-facing sentence for the gate. Null when allowed. */
  reason: string | null;
  /** Machine-readable cause, so the client knows what to offer next. */
  code: 'ok' | 'unknown-region' | 'level' | 'desk' | 'pack';
  /** The level your best desk must reach. 0 when the region has no such gate. */
  minDeskLevel: number;
}

export interface RegionsResponse {
  totalLevel: number;
  pack: {
    step: number;
    name: string | null;
    slots: number;
    used: number;
    free: number;
    nextTier: { step: number; name: string; slots: number; scripCost: number; blurb: string } | null;
  };
  regions: RegionView[];
}
/** A loot pile as this viewer may see it. Contents are absent unless adjacent. */
export interface VisiblePile {
  id: string;
  x: number;
  z: number;
  droppedAt: number;
  readable: boolean;
  contents?: Array<{ kind: string; ref: string; quantity: number }>;
}

export interface PackState {
  step: number;
  name: string | null;
  slots: number;
  used: number;
  free: number;
  contents: Array<{ kind: string; ref: string; quantity: number }>;
  nextTier: { step: number; name: string; slots: number; scripCost: number; blurb: string } | null;
}

/** A creature as this player currently sees it. */
export interface CreatureView {
  id: string;
  kind: 'shambler' | 'wolf';
  x: number;
  z: number;
  seed: number;
  health: number;
  maxHealth: number;
  /** True once it has noticed you. Drives the model animation. */
  hunting: boolean;
  dead: boolean;
}

/** Another player in the zone. Positions are public in a PvP region. */
export interface PlayerView {
  wallet: string;
  x: number;
  z: number;
  health: number;
  maxHealth: number;
}

export interface StrikeResult {
  target: string;
  dealt: number;
  targetHealth: number;
  killed: boolean;
  /** Set when the kill spilled a pack. */
  pileId: string | null;
  health: number;
  players: PlayerView[];
  creatures: CreatureView[];
  piles: VisiblePile[];
}

export interface AttackResult {
  creature: { id: string; health: number; maxHealth: number; dead: boolean };
  dealt: number;
  /** Damage the counter-attack landed. Zero when it was on cooldown or died. */
  took: number;
  health: number;
  drop: string | null;
  creatures: CreatureView[];
  /** Set when the counter-attack killed you: the pack is already on the ground. */
  died: { pileId: string | null; respawn: { x: number; z: number } } | null;
}

export interface ExpeditionState {
  allowed: boolean;
  health: number;
  maxHealth: number;
  reason: string | null;
  code: string;
  position: { x: number; z: number };
  /** False until the first step of the session anchors the player. */
  anchored: boolean;
  pack: PackState;
  piles: VisiblePile[];
  creatures: CreatureView[];
  players: PlayerView[];
}

export interface StepResult {
  position: { x: number; z: number };
  /** False when the server refused — the client must reconcile, not retry. */
  accepted: boolean;
  piles: VisiblePile[];
  creatures: CreatureView[];
  players: PlayerView[];
}
export interface CosmeticItem {
  key: string;
  name: string;
  slot: CosmeticSlot;
  description: string;
  /** Price in BNTY. */
  bnty: number;
  /** Equivalent price in ETH, for players buying in before they have earned. */
  eth: number;
  /**
   * Price in Scrip, absent on the few pieces that stay paid-only.
   *
   * Absent rather than zero: a missing price is a refusal, and zero would read
   * as a giveaway. The shop leads with this button wherever it is present.
   */
  scrip?: number;
  /** Currencies this piece is actually sold for, in shop-button order. */
  currencies: CosmeticCurrency[];
  tier: CosmeticTier;
  owned: boolean;
  /** True only for the one item currently worn in this item's slot. */
  equipped: boolean;
  /** How far up the upgrade track this copy has been taken. 0 on purchase. */
  level: number;
  /** Display name for `level` — "Stock", "Tailored", "Archive". */
  rank: string;
  /** The owned-row id the Exchange lists. Null when the wallet has no copy. */
  ownedId: number | null;
  /** Listed for sale right now — frozen, so it cannot be worn or refined. */
  listed: boolean;
  /** BNTY price of every step, so the whole ladder can be shown up front. */
  ladder: number[];
  /** Null at the cap, and while the item is not owned. */
  nextUpgrade: { level: number; bnty: number; rank: string } | null;
}

export interface CosmeticsResponse {
  /** House cut on a cosmetic sale, in basis points. */
  feeBps: number;
  maxLevel: number;
  ranks: string[];
  /** False once BNTY settlement is live: ETH has no payment rail yet. */
  ethCheckout: boolean;
  /** The wallet's spendable Scrip, bound and bearer combined. */
  scrip: number;
  items: CosmeticItem[];
}

export interface CosmeticPurchase {
  key: string;
  currency: CosmeticCurrency;
  price: number;
  fee: number;
  burn: number;
  reserve: number;
  catalog: CosmeticsResponse;
}

export interface CosmeticUpgrade {
  key: string;
  level: number;
  rank: string;
  price: number;
  xp: number;
  fee: number;
  burn: number;
  reserve: number;
  nextUpgrade: { level: number; bnty: number; rank: string } | null;
  catalog: CosmeticsResponse;
}

/** Mirrors the server's CosmeticCurrency in lib/economy. Keep the two in step. */
export type CosmeticCurrency = 'BNTY' | 'ETH' | 'SCRIP';

export type MarketItemKind = 'crate' | 'component' | 'node' | 'cosmetic';

export interface MarketListing {
  id: number;
  seller: string;
  itemKind: MarketItemKind;
  itemId: number;
  priceOsr: number;
  createdAt: number;
  item: Record<string, unknown> | null;
}

export interface MarketSale {
  item_kind: MarketItemKind;
  item_id: number;
  sold_price_osr: number;
  sold_at: number;
  fee_osr: number;
}

export interface MarketPurchase {
  listing: MarketListing;
  fee: number;
  toSeller?: number;
  payoutHash?: string | null;
  /** False when the item moved but the seller's payout has not gone through. */
  sellerPaid?: boolean;
}

export interface CrateResult {
  inventoryItemId: number;
  slot: string;
  rarity: string;
  isUpgrade: boolean;
  previousRarity?: string;
  pityTriggered: 'legendary' | 'mythic' | 'divine' | null;
}

export interface InventoryItem {
  id: number;
  slot: string;
  family: 'oil' | 'mine';
  nodeType: 'oil' | 'mine';
  rarity: string;
  equippedNodeId: number | null;
  createdAt: number;
  durability: number;
  multiplier: number;
}

export interface GlobalProfile {
  wallet: string;
  displayName: string | null;
  avatarUrl: string | null;
  joinedAt: number;
  lastSeenAt: number;
  totalSessions: number;
  compoundLevel: number;
  nodeCount: number;
  maxNodeLevel: number;
  sumNodeLevels: number;
  productionRate: number;
  totalProduced: number;
  totalBurned: number;
  online: boolean;
}

export interface ActivityItem {
  id: number;
  wallet: string;
  eventType: string;
  source: 'app' | 'onchain';
  amount: number | null;
  assetSymbol: string | null;
  txHash: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

/**
 * Read both Privy tokens, optionally waiting for them to appear.
 *
 * Privy issues the access and identity tokens asynchronously after sign-in, and
 * every authenticated route requires BOTH. A page mounting in that gap sends an
 * unauthenticated request and gets "Privy authentication required" — a hard
 * error for a session that is perfectly valid and a moment from being ready.
 *
 * `waitMs` is only spent on the retry path. Waiting on every call would make
 * each public read — landing stats, leaderboard, the market board — sit for
 * seconds waiting on tokens a signed-out visitor is never going to have.
 */
async function privyTokens(waitMs = 0): Promise<[string | null, string | null]> {
  const deadline = Date.now() + waitMs;
  let access: string | null = null;
  let identity: string | null = null;
  for (;;) {
    try {
      [access, identity] = await Promise.all([getAccessToken(), getIdentityToken()]);
    } catch {
      // Privy not initialised yet; treat as "no tokens" and retry below.
    }
    if ((access && identity) || Date.now() >= deadline) return [access, identity];
    await new Promise((r) => setTimeout(r, 150));
  }
}

async function request<T>(path: string, opts?: RequestInit, isRetry = false): Promise<T> {
  const controller = opts?.signal ? null : new AbortController();
  const timeout = controller ? window.setTimeout(() => controller.abort(), 15_000) : null;
  let res: Response;
  try {
    let accessToken: string | null = null;
    let identityToken: string | null = null;
    if (PRIVY_CONFIGURED) {
      // Fast path reads whatever is there; only the post-401 retry waits.
      [accessToken, identityToken] = await privyTokens(isRetry ? 2_500 : 0);
    }
    res = await fetch(`/api${path}`, {
      ...opts,
      signal: opts?.signal ?? controller?.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(identityToken ? { 'privy-id-token': identityToken } : {}),
        ...(opts?.headers ?? {}),
      },
      cache: 'no-store',
    });
  } catch (error) {
    if (controller?.signal.aborted) throw new Error('Request timed out');
    throw error;
  } finally {
    if (timeout != null) window.clearTimeout(timeout);
  }
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.error) msg = body.error;
    } catch {
      /* keep default */
    }
    // Privy rotates its tokens, so an authenticated call can land in the gap
    // while one is reissued. Retry once with freshly-read tokens before
    // surfacing it: the alternative is telling a signed-in operator their
    // sign-in failed, on a page that has no retry of its own.
    if (res.status === 401 && !isRetry && PRIVY_CONFIGURED) {
      await new Promise((r) => setTimeout(r, 400));
      return request<T>(path, opts, true);
    }
    throw new Error(msg);
  }
  return res.json();
}

const idem = () => `idem_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

// ---------------------------------------------------------------------------
// Settlement-backed actions
// ---------------------------------------------------------------------------

const post = <T>(path: string, body: unknown) =>
  request<T>(path, { method: 'POST', body: JSON.stringify(body) });

/**
 * Ask the server to settle, retrying while the receipt is still short of the
 * required confirmations. The server answers 425 in that window; anything else
 * is a real failure and propagates immediately.
 */
async function settleWithRetry<T>(
  path: string,
  wallet: string,
  nonce: string,
  txHash: string,
  extra: Record<string, unknown> = {}
): Promise<T> {
  const ATTEMPTS = 12;
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    try {
      const res = await post<{ settled: boolean; result: T }>(path, {
        wallet,
        nonce,
        txHash,
        ...extra,
      });
      return res.result;
    } catch (e) {
      const awaiting = e instanceof Error && /awaiting confirmations/i.test(e.message);
      if (!awaiting || attempt === ATTEMPTS - 1) throw e;
      await new Promise((r) => setTimeout(r, 3_000));
    }
  }
  throw new Error('Settlement timed out waiting for confirmations');
}

/**
 * Full lifecycle for a priced action: quote, submit on-chain, then settle.
 *
 * The tx hash is the only thing carried from the client into the settle call,
 * and the server re-derives everything else from the receipt, so a tampered
 * client cannot talk itself into a state change it did not pay for.
 */
async function runAction<T>(
  path: string,
  wallet: string,
  params: Record<string, unknown>,
  onStep?: StepHandler
): Promise<T> {
  onStep?.('quoting');
  const quote = await post<{ settled: boolean; payment?: PaymentRequest; result?: T }>(path, {
    wallet,
    ...params,
  });
  // Settlement is not configured yet, so the server already applied the action
  // and there is nothing for the operator to pay.
  if (quote.settled || !quote.payment) return quote.result as T;

  const txHash = await submitPayment(quote.payment, onStep);
  onStep?.('settling');
  return settleWithRetry<T>(path, wallet, quote.payment.nonce, txHash, params);
}

/**
 * Trading floor types.
 *
 * Declared here rather than imported from lib/floor, which reaches for
 * node:sqlite the moment it is loaded and would drag the database into the
 * browser bundle. These mirror the server's shapes; the server is authoritative
 * and returns the normalised layout on every write, so drift shows up
 * immediately as a floor that snaps back rather than as silent disagreement.
 */
export interface FloorMachine {
  id: string;
  x: number;
  z: number;
  rotation: number;
}

export interface FloorEffect {
  key: 'coolant' | 'packaging' | 'spine' | 'crowding';
  label: string;
  delta: number;
  lines: number;
}

export interface FloorBonus {
  multiplier: number;
  placed: number;
  lines: number;
  effects: FloorEffect[];
}

export interface StakePosition {
  id: number;
  principal: number;
  termDays: number;
  aprBps: number;
  openedAt: number;
  maturesAt: number;
  status: 'active' | 'closed';
  termInterest: number;
  accruedInterest: number;
  matured: boolean;
  closeValueNow: number;
  earlyExitPenalty: number;
  closedAt: number | null;
  paidPrincipal: number | null;
  paidInterest: number | null;
  penalty: number | null;
}

export interface StakeTotals {
  openContracts: number;
  lockedPrincipal: number;
  accruedInterest: number;
  maturityValue: number;
}

export interface StakeRates {
  terms: Array<{ days: number; aprBps: number; label: string; maxPrincipal: number }>;
  minPrincipal: number;
  maxOpen: number;
  earlyExitPenaltyBps: number;
  reserveBalance: number;
  committedInterest: number;
  uncommittedReserve: number;
}

export interface StakeCloseResult {
  principal: number;
  interest: number;
  penalty: number;
  payout: number;
  matured: boolean;
}

export const api = {
  privySession: (wallet: string) =>
    request<{ authenticated: boolean; userId: string; wallet: string; walletType: string }>(
      '/auth/session',
      { method: 'POST', body: JSON.stringify({ wallet }) }
    ),
  operation: (wallet: string) => request<UserOperation>(`/user/${wallet}/operation`),
  overview: () => request<ProtocolOverview>('/protocol/overview'),
  reserves: () =>
    request<Array<{ walletLabel: string; walletAddress: string; assetSymbol: string; balanceUi: number }>>(
      '/protocol/reserves'
    ),
  snapshots: () =>
    request<{ genesisMs: number; now: number; currentRatePerSec: number; points: Array<{ t: number; ratePerSec: number; distributedPct: number }> }>(
      '/protocol/snapshots'
    ),
  treasuryEvents: (limit = 100) =>
    request<Array<{ id: number; createdAt: number; eventType: string; walletLabel: string; amount: number; assetSymbol: string; meta: Record<string, unknown> | null }>>(
      `/protocol/treasury-events?limit=${limit}`
    ),
  families: () =>
    request<Array<{ key: string; name: string; description: string; family: 'oil' | 'mine'; burnCostOsr: number; burnShareBps: number; treasuryShareBps: number; mintFeeEth: number }>>(
      '/nodes/families'
    ),
  crateOdds: (wallet?: string) =>
    request<{ level: number; odds: Array<{ rarity: string; chance: number }>; guarantees: { legendaryPlus: number; mythicPlus: number; divine: number }; pity?: { sinceLegendaryPlus: number; sinceMythicPlus: number; sinceDivine: number } }>(
      `/crates/odds${wallet ? `?wallet=${wallet}` : ''}`
    ),
  compound: (wallet: string) => request<CompoundInfo>(`/compound/${wallet}`),
  inventory: (wallet: string) => request<{ items: InventoryItem[] }>(`/user/${wallet}/inventory`),
  stakeTerms: () => request<StakeRates>('/stake/terms'),
  stakes: (wallet: string) =>
    request<{ positions: StakePosition[]; totals: StakeTotals; rates: StakeRates }>(
      `/stake/${wallet}`
    ),
  // Opening locks BNTY away, so it is a spend and goes through the same
  // quote/pay/settle lifecycle as every other priced action.
  openStake: (wallet: string, amount: number, termDays: number, onStep?: StepHandler) =>
    runAction<{ position: StakePosition; positions: StakePosition[]; totals: StakeTotals }>(
      '/stake/open',
      wallet,
      { amount, termDays },
      onStep
    ),
  // Closing pays out, so there is nothing for the operator to sign — one call.
  closeStake: (wallet: string, stakeId: number) =>
    request<{ result: StakeCloseResult; positions: StakePosition[]; totals: StakeTotals; txHash?: string }>(
      '/stake/close',
      { method: 'POST', body: JSON.stringify({ wallet, stakeId }) }
    ),
  floor: (wallet: string) =>
    request<{ layout: FloorMachine[]; bonus: FloorBonus; kinds: Record<string, string> }>(
      `/floor/${wallet}`
    ),
  saveFloor: (wallet: string, layout: FloorMachine[]) =>
    request<{ layout: FloorMachine[]; bonus: FloorBonus }>('/floor/save', {
      method: 'POST',
      body: JSON.stringify({ wallet, layout }),
    }),
  profile: (wallet: string) =>
    request<{ configured: boolean; profile: GlobalProfile | null; history: ActivityItem[] }>(
      `/profiles/${wallet}`
    ),
  leaderboard: (metric = 'compound_level') =>
    request<Array<{ rank: number; wallet: string; compoundLevel: number; maxLevel: number; sumLevel: number; nodes: number; productionRate: number; totalProduced: number; totalBurned: number }>>(
      `/leaderboard?metric=${metric}`
    ),

  quests: (wallet: string) => request<QuestsResponse>(`/quests/${wallet}`),
  regions: (wallet: string) => request<RegionsResponse>(`/regions/${wallet}`),
  /**
   * Start (or resume) a demo session. Returns the throwaway account it minted.
   *
   * No wallet argument: the server decides which account this is, from the
   * cookie it set. A client that could name its own demo address could name
   * somebody else's.
   */
  startDemo: () =>
    post<{ wallet: string; resumed: boolean; scrip?: number }>('/demo/start', {}),
  /**
   * Walk through a door. Throws with the gate's own sentence when refused.
   *
   * The client already knows the verdict from `regions`, which is what lets a
   * locked door say so before any round trip. This is the answer that counts —
   * and it is also where going outside becomes an event the introduction can
   * see, rather than a side effect of the URL changing.
   */
  enterRegion: (wallet: string, region: string) =>
    post<{
      region: { id: string; name: string; href: string; lighting: string; bounds: { minX: number; maxX: number; minZ: number; maxZ: number }; pvp: boolean; hostiles: boolean };
      spawn: { x: number; z: number };
      warning: string | null;
    }>('/regions/enter', { wallet, region }),
  expeditionState: (wallet: string) =>
    request<ExpeditionState>(`/expedition/state/${wallet}`),
  attack: (wallet: string, id: string) => post<AttackResult>('/expedition/attack', { wallet, id }),
  strike: (wallet: string, target: string) =>
    post<StrikeResult>('/expedition/strike', { wallet, target }),
  step: (wallet: string, x: number, z: number) =>
    post<StepResult>('/expedition/step', { wallet, x, z }),
  /**
   * Buy the first pack, or the next step up. The tier is not a parameter — the
   * server derives it from the step you are actually on.
   */
  upgradePack: (wallet: string) =>
    post<{ tier: { step: number; name: string; slots: number; scripCost: number; blurb: string }; pack: PackState }>(
      '/expedition/pack',
      { wallet }
    ),
  intro: (wallet: string) => request<IntroResponse>(`/intro/${wallet}`),
  claimIntroStep: (wallet: string, key: string) =>
    post<{ key: string; xp: number; scrip: number; intro: IntroState; progression: Progression }>(
      '/intro/claim',
      { wallet, key }
    ),
  cosmetics: (wallet: string) => request<CosmeticsResponse>(`/cosmetics/${wallet}`),
  claimQuest: (wallet: string, key: string) =>
    post<{ key: string; track: string; xp: number; progression: Progression }>('/quests/claim', {
      wallet,
      key,
    }),

  /**
   * Buy a cosmetic. BNTY rides the settlement rail like any other spend; ETH is
   * applied server-side in one call, and the shop only offers it while the
   * catalogue reports `ethCheckout`.
   */
  buyCosmetic: (wallet: string, key: string, currency: CosmeticCurrency, onStep?: StepHandler) =>
    runAction<CosmeticPurchase>('/cosmetics/buy', wallet, { key, currency }, onStep),

  /** Take an owned cosmetic one step up its track. BNTY only, by design. */
  upgradeCosmetic: (wallet: string, key: string, onStep?: StepHandler) =>
    runAction<CosmeticUpgrade>('/cosmetics/upgrade', wallet, { key }, onStep),

  /** Wear an owned cosmetic. Free — one request, nothing to sign. */
  equipCosmetic: (wallet: string, key: string) =>
    post<{ slot: string; key: string; catalog: CosmeticsResponse }>('/cosmetics/equip', {
      wallet,
      key,
    }),

  /** Clear a slot. */
  unequipCosmetic: (wallet: string, slot: CosmeticSlot) =>
    post<{ slot: string; catalog: CosmeticsResponse }>('/cosmetics/equip', { wallet, slot }),

  // Each of these quotes on the server, sends one on-chain transaction through
  // the connected wallet, and then settles. onStep lets the UI narrate a flow
  // that may involve an approval as well as the action itself.
  mintNode: (wallet: string, familyKey: string, onStep?: StepHandler) =>
    runAction<{ node: { id: number } }>('/nodes/mint', wallet, { familyKey }, onStep),

  upgradeNode: (wallet: string, nodeId: string | number, onStep?: StepHandler) =>
    runAction<{ nodeId: number; level: number; cost: number }>(
      '/nodes/upgrade',
      wallet,
      { nodeId: Number(nodeId) },
      onStep
    ),

  /**
   * The protocol pays the operator, so there is nothing for them to sign — one
   * request, and the server transfers BNTY from the protocol wallet.
   */
  claim: async (
    wallet: string,
    nodeId?: string | number,
    mode: 'claim' | 'compound' = 'claim',
    onStep?: StepHandler
  ) => {
    type Claims = {
      claims: Array<{ nodeId: number; status: string; gross: number; fee: number; net: number; mode: string }>;
    };
    onStep?.('settling');
    const res = await post<{
      settled: boolean;
      result: Claims;
      txHash?: string;
      /** BNTY withheld to cover the gas of the payout transaction. */
      gasOsr?: number;
    }>('/rewards/claim', {
      wallet,
      nodeId: nodeId == null ? undefined : Number(nodeId),
      mode,
    });
    return { ...res.result, txHash: res.txHash, gasOsr: res.gasOsr ?? 0 };
  },


  // ---- Marketplace ----------------------------------------------------------
  /** Open listings and recent sales. Public — no wallet needed to browse. */
  marketListings: (kind?: MarketItemKind) =>
    request<{ listings: MarketListing[]; sales: MarketSale[]; feeBps: number }>(
      kind ? `/market/listings?kind=${kind}` : '/market/listings'
    ),

  marketList: (wallet: string, itemKind: MarketItemKind, itemId: number, priceOsr: number) =>
    post<{ listing: MarketListing }>('/market/list', { wallet, itemKind, itemId, priceOsr }),

  marketCancel: (wallet: string, listingId: number) =>
    post<{ ok: true }>('/market/cancel', { wallet, listingId }),

  /** Buys a listing, settling on-chain when the token is live. */
  marketBuy: (wallet: string, listingId: number, onStep?: StepHandler) =>
    runAction<MarketPurchase>('/market/buy', wallet, { listingId }, onStep),


  /** Set or clear your display name. */
  updateProfile: (wallet: string, displayName: string | null) =>
    post<{ profile: GlobalProfile }>('/profiles/update', { wallet, displayName }),

  /**
   * Upload a profile picture. Multipart, so it bypasses the JSON request
   * helper — the browser must set its own multipart boundary header.
   */
  uploadAvatar: async (wallet: string, file: File): Promise<GlobalProfile> => {
    const form = new FormData();
    form.set('wallet', wallet);
    form.set('file', file);
    let accessToken: string | null = null;
    let identityToken: string | null = null;
    if (PRIVY_CONFIGURED) {
      try {
        [accessToken, identityToken] = await Promise.all([getAccessToken(), getIdentityToken()]);
      } catch { /* server rejects if absent */ }
    }
    const res = await fetch('/api/profiles/avatar', {
      method: 'POST',
      body: form,
      headers: {
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(identityToken ? { 'privy-id-token': identityToken } : {}),
      },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.error ?? `${res.status} ${res.statusText}`);
    return body.profile as GlobalProfile;
  },

  /** Acknowledge mined-crate notices so they stop being shown. */
  markCratesSeen: (wallet: string) => post<{ ok: true }>('/crates/seen', { wallet }),

  /** Opens a crate the wallet has already mined. Crates cannot be bought. */
  openCrate: (
    wallet: string,
    crateId: number,
    targetNodeId?: string | number,
    onStep?: StepHandler
  ) =>
    runAction<CrateResult>(
      '/crates/open',
      wallet,
      { crateId, targetNodeId: targetNodeId == null ? null : Number(targetNodeId) },
      onStep
    ),

  upgradeCompound: (wallet: string, onStep?: StepHandler) =>
    runAction<{ compound: { level: number; maxNodes: number; cratesPerDay: number } }>(
      '/compound/upgrade',
      wallet,
      {},
      onStep
    ),

  expediteCompound: (wallet: string, onStep?: StepHandler) =>
    runAction<{ compound: { level: number; maxNodes: number; cratesPerDay: number } }>(
      '/compound/expedite',
      wallet,
      {},
      onStep
    ),
  equip: (wallet: string, inventoryItemId: number, targetNodeId: string | number) =>
    request<{ ok: boolean; slot: string }>('/components/equip', {
      method: 'POST',
      body: JSON.stringify({ wallet, inventoryItemId, targetNodeId, idempotencyKey: idem() }),
    }),
  unequip: (wallet: string, nodeId: string | number, slot: string) =>
    request<{ ok: boolean }>('/components/unequip', {
      method: 'POST',
      body: JSON.stringify({ wallet, nodeId, slot, idempotencyKey: idem() }),
    }),
};
