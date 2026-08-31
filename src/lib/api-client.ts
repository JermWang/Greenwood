'use client';

// Client for the same-origin API. Auth is a wallet-session cookie (see lib/siwe)
// attached automatically by the browser on same-origin requests, replacing the
// former Privy bearer tokens. Historical comment below kept for context only.
// Client for the same-origin API. Privy tokens are attached automatically when
// managed wallet mode is configured, allowing the server to bind every write
// to the authenticated wallet owner.

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
  pendingGreen: number;
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
    totalGreen: number;
    feeEth: number;
    burnGreen: number;
    reserveGreen: number;
    treasuryGreen: number;
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
  greenBalance: number;
  totalProduced: number;
  totals: Record<string, number>;
  pending: Record<string, number>;
  claimCooldownRemainingMs: number;
  crateCooldown: { rigCratesRemaining: number; shaftCratesRemaining: number };
  /** Mined, unopened crates held by this wallet. */
  crates: Array<{
    id: number;
    crateType: 'equity_allocation' | 'treasury_allocation';
    foundAt: number;
    foundNodeId: number | null;
  }>;
  /** Subset of the above the operator has not been shown yet. */
  unseenCrates: Array<{
    id: number;
    crateType: 'equity_allocation' | 'treasury_allocation';
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
  totalEquityDesks: number;
  totalTreasuryDesks: number;
  totalSupply: number;
  totalGreenBurned: number;
  totalCreatorRewardsProcessed: number;
  greenReserveBalance: number;
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
  /** Where to go to do it. Used for resuming, never for teleporting. */
  href: string;
  /** The room, named. The guide prints this instead of linking — see lib/intro. */
  where: string;
  done: boolean;
  claimed: boolean;
  /** Exactly one step is current at a time. */
  current: boolean;
  /**
   * Unclaimed, but not actionable yet, so the chain has moved past it for now.
   * It comes back on its own. See canAct in lib/intro.
   */
  parked: boolean;
  /** What to do meanwhile. Present only on steps that can park. */
  waiting?: string;
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

/** One bench row, as the server describes it. */
export interface BenchRecipe {
  id: string;
  name: string;
  kind: string;
  tier: number;
  logs: number;
  xp: number;
  yields?: number;
  blurb: string;
  ok: boolean;
  reason: string | null;
  plan: Array<{ ref: string; quantity: number }>;
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
  /**
   * What they are holding, by weapon id, resolved SERVER-SIDE.
   *
   * Not carried over presence like an outfit: what somebody appears to be armed
   * with is information other players act on out there. See lib/expedition.
   */
  weapon: string | null;
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
  /**
   * The weapon in this player's hand, by id, or null for fists.
   *
   * Resolved by the same code that decides damage, rather than derived from
   * `pack` below — the axe is not in the pack, and a second implementation of
   * "which of these is best" is a second answer waiting to disagree.
   */
  weapon: string | null;
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
  /** Price in GREEN. */
  green: number;
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
  /** GREEN price of every step, so the whole ladder can be shown up front. */
  ladder: number[];
  /** Null at the cap, and while the item is not owned. */
  nextUpgrade: { level: number; green: number; rank: string } | null;
}

export interface CosmeticsResponse {
  /** House cut on a cosmetic sale, in basis points. */
  feeBps: number;
  maxLevel: number;
  ranks: string[];
  /** False once GREEN settlement is live: ETH has no payment rail yet. */
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
  nextUpgrade: { level: number; green: number; rank: string } | null;
  catalog: CosmeticsResponse;
}

/** Mirrors the server's CosmeticCurrency in lib/economy. Keep the two in step. */
export type CosmeticCurrency = 'GREEN' | 'ETH' | 'SCRIP';

export type MarketItemKind = 'crate' | 'component' | 'node' | 'cosmetic';

export interface MarketListing {
  id: number;
  seller: string;
  /**
   * The seller's profile name, or null if they have not set one.
   *
   * Joined server-side in one batched query (see api/market/listings). Null is
   * the ordinary case, not a failure — the board falls back to the shortened
   * address, which it also does when the registry is unreachable.
   */
  sellerName?: string | null;
  itemKind: MarketItemKind;
  itemId: number;
  priceGreen: number;
  createdAt: number;
  item: Record<string, unknown> | null;
}

/** One completed trade, from the point of view of the wallet that asked. */
export interface TradeView {
  id: number;
  side: 'bought' | 'sold';
  itemKind: MarketItemKind;
  itemId: number;
  priceGreen: number;
  /** What the seller received after the fee. Zero on a buy — see lib/market. */
  netGreen: number;
  feeGreen: number;
  at: number;
  counterparty: string;
  counterpartyName?: string | null;
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

async function request<T>(path: string, opts?: RequestInit): Promise<T> {
  const controller = opts?.signal ? null : new AbortController();
  const timeout = controller ? window.setTimeout(() => controller.abort(), 15_000) : null;
  let res: Response;
  try {
    // Auth is a session cookie now, not a bearer token. `credentials: same-origin`
    // is the browser default for same-origin fetches, so the cookie rides along
    // with no header plumbing — which is the whole reason SIWE is simpler than
    // the Privy token dance this replaced.
    res = await fetch(`/api${path}`, {
      ...opts,
      signal: opts?.signal ?? controller?.signal,
      headers: {
        'Content-Type': 'application/json',
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
  key: 'coolant' | 'settlement' | 'spine' | 'crowding';
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
  /** Who this browser is signed in as, from the session cookie. */
  session: () => request<{ authenticated: boolean; wallet?: string }>('/auth/session'),
  /** Step one of sign-in: a nonce for the wallet to sign. */
  authNonce: (wallet: string) =>
    request<{ nonce: string }>('/auth/nonce', { method: 'POST', body: JSON.stringify({ wallet }) }),
  /** Step two: submit the signature and receive the session cookie. */
  authVerify: (wallet: string, nonce: string, signature: string) =>
    request<{ authenticated: boolean; wallet: string }>('/auth/verify', {
      method: 'POST',
      body: JSON.stringify({ wallet, nonce, signature }),
    }),
  /** End the session and clear the cookie. */
  logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST' }),
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
    request<Array<{ key: string; name: string; description: string; family: 'oil' | 'mine'; burnCostGreen: number; burnShareBps: number; treasuryShareBps: number; mintFeeEth: number }>>(
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
  // Opening locks GREEN away, so it is a spend and goes through the same
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
  /**
   * `configured` means the profile registry is usable right now. `degraded`
   * separates the two ways it can be unusable: false is "never set up for this
   * environment", true is "set up but not answering". See lib/profiles.
   */
  /**
   * Say something in world chat.
   *
   * Text only. The wallet is here so the session check has something to compare
   * against, and every other field on the line — who said it, what they are
   * called, when — is decided by the server and handed back in the reply. The
   * dock draws what comes back rather than what was typed, which is why there
   * is a return value at all: it is the only way a player's own line and
   * everybody else's are the same object.
   */
  say: (wallet: string, text: string) =>
    post<{ line: { wallet: string; name: string; text: string; at: number }; shard: string }>(
      '/chat/say',
      { wallet, text }
    ),
  profile: (wallet: string) =>
    request<{
      configured: boolean;
      degraded: boolean;
      profile: GlobalProfile | null;
      history: ActivityItem[];
    }>(`/profiles/${wallet}`),
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
  /** Fell a tree. The server decides what was standing there and what it pays. */
  chopTree: (wallet: string, region: string, x: number, z: number) =>
    post<{
      species: string;
      logs: number;
      xp: number;
      ref: string;
      regrowsAt: number;
      stumps: Array<{ id: string; x: number; z: number }>;
    }>('/trees/chop', { wallet, region, x, z }),

  /** The craft bench, with every recipe and its verdict for this wallet. */
  craftBench: (wallet: string) =>
    request<{ bench: BenchRecipe[] }>(`/craft?wallet=${wallet}`),

  /** Make something. What it costs is decided server-side from the real pack. */
  craft: (wallet: string, recipe: string) =>
    post<{ recipe: string; name: string; yielded: number; xp: number; bench: BenchRecipe[] }>(
      '/craft',
      { wallet, recipe }
    ),

  /** Which trees are currently down in a region. Only the exceptions travel. */
  stumps: (wallet: string, region: string) =>
    request<{ stumps: Array<{ id: string; x: number; z: number }> }>(
      `/trees?wallet=${wallet}&region=${region}`
    ),

  /** The axe this fund carries, and the next rung up. */
  axe: (wallet: string) =>
    request<{
      axe: { id: string; name: string; tier: number; damage: number; scripCost: number; blurb: string } | null;
      next: { id: string; name: string; tier: number; damage: number; scripCost: number; blurb: string } | null;
    }>(`/tools/axe?wallet=${wallet}`),

  buyAxe: (wallet: string, axe: string) =>
    post<{ axe: string; spent: number; tool: { name: string } }>('/tools/axe', { wallet, axe }),

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
   * Buy a cosmetic. GREEN rides the settlement rail like any other spend; ETH is
   * applied server-side in one call, and the shop only offers it while the
   * catalogue reports `ethCheckout`.
   */
  buyCosmetic: (wallet: string, key: string, currency: CosmeticCurrency, onStep?: StepHandler) =>
    runAction<CosmeticPurchase>('/cosmetics/buy', wallet, { key, currency }, onStep),

  /** Take an owned cosmetic one step up its track. GREEN only, by design. */
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
   * request, and the server transfers GREEN from the protocol wallet.
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
      /** GREEN withheld to cover the gas of the payout transaction. */
      gasGreen?: number;
    }>('/rewards/claim', {
      wallet,
      nodeId: nodeId == null ? undefined : Number(nodeId),
      mode,
    });
    return { ...res.result, txHash: res.txHash, gasGreen: res.gasGreen ?? 0 };
  },


  // ---- Marketplace ----------------------------------------------------------
  /** Open listings and recent sales. Public — no wallet needed to browse. */
  marketListings: (kind?: MarketItemKind) =>
    request<{ listings: MarketListing[]; sales: MarketSale[]; feeBps: number }>(
      kind ? `/market/listings?kind=${kind}` : '/market/listings'
    ),

  /** This wallet's own completed trades. Authenticated: receipts are private. */
  marketHistory: (wallet: string) =>
    request<{ trades: TradeView[] }>(`/market/history?wallet=${wallet}`),
  marketList: (wallet: string, itemKind: MarketItemKind, itemId: number, priceGreen: number) =>
    post<{ listing: MarketListing }>('/market/list', { wallet, itemKind, itemId, priceGreen }),

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
    // Multipart, so it bypasses the JSON helper — but auth is the session cookie,
    // which the browser attaches to a same-origin fetch automatically, so there
    // are no headers to set beyond the multipart boundary the browser writes.
    const res = await fetch('/api/profiles/avatar', { method: 'POST', body: form });
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
