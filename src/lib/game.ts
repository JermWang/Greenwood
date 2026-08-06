// BNTY game engine — all economy state transitions live here. Route handlers
// are thin wrappers around these functions. Production accrual is lazy: every
// read "settles" a node's accrued BNTY up to now, so no background ticker is
// needed.

import { DEMO_BNTY, DEMO_WALLET_LIKE, isDemoWallet } from './demo';
import { TOKEN_LIVE } from './config';
import { getDb, getProtocolValue, setProtocolValue } from './db';
import { rollCrateDrops, unopenedCrates, unseenCrates, type FoundCrate } from './crates';
import { crateCostBnty } from './economy';
import { getOsrUsdPrice } from './price';
import {
  RARITY_MULT,
  RARITY_BOOST,
  DROP_WEIGHTS,
  RARITY_UNLOCK_LEVEL,
  PITY,
  COMPOUND_LEVELS,
  MAX_COMPOUND_LEVEL,
  getShaftBonusSlots,
  levelMultiplier,
  CLAIM_FEE_BPS,
  CLAIM_COOLDOWN_MS,
  COMPOUND_REINVEST_FEE_BPS,
  MINT_BURN_BPS,
  MINT_TREASURY_BPS,
  SPLIT_BURN_BPS,
  SPLIT_RESERVE_BPS,
  NODE_FAMILIES,
  emissionRateAt,
  halvingInfo,
  welcomeBoostFactor,
  SHARE_CAP,
  STORAGE_CAP_SECONDS,
  COMPOUND_COOLDOWN_MS,
  COMPOUND_FEE_ETH,
  CRATE_FEE_ETH,
  EXPEDITE_FEE_ETH,
  TOTAL_SUPPLY,
  EMISSION_RESERVE,
  STARTER_BNTY_GRANT,
} from './economy';
import { DESK_MATERIAL, deskFrames, nodeUpgradeCost } from './capital';
import { spendMaterial } from './materials';
import { NODE_SLOTS, RARITIES, type NodeFamily, type Rarity } from './rarity';
import { allLayoutMultipliers, layoutBonus, type LayoutBonus } from './floor';
import { recordQuestProgress } from './quests';

export { GameError } from './errors';
import { GameError } from './errors';

// ---------------------------------------------------------------------------
// Protocol
// ---------------------------------------------------------------------------

export function genesisMs(): number {
  let g = getProtocolValue('genesisMs');
  if (!g) {
    g = String(Date.now());
    setProtocolValue('genesisMs', g);
  }
  return Number(g);
}

/** Exported for stake.ts, which records its own principal and interest movements. */
export function addLedger(wallet: string, kind: string, amount: number, meta?: object) {
  getDb()
    .prepare('INSERT INTO ledger (wallet, kind, amount, meta, created_at) VALUES (?,?,?,?,?)')
    .run(wallet, kind, amount, meta ? JSON.stringify(meta) : null, Date.now());
}

/** Exported alongside addLedger so staking draws from the same reserve counters. */
export function bumpProtocolCounter(key: string, delta: number) {
  const cur = Number(getProtocolValue(key) ?? '0');
  setProtocolValue(key, String(cur + delta));
}

export function protocolCounters() {
  return {
    burned: Number(getProtocolValue('burned') ?? '0'),
    reserve: Number(getProtocolValue('reserve') ?? '0'),
    treasury: Number(getProtocolValue('treasury') ?? '0'),
    emitted: Number(getProtocolValue('emitted') ?? '0'),
    solRevenue: Number(getProtocolValue('solRevenue') ?? '0'),
  };
}

function paySplits(wallet: string, kind: string, osr: number, splits: { burn: number; reserve?: number; treasury: number }, feeEth = 0, meta?: object) {
  bumpProtocolCounter('burned', splits.burn);
  if (splits.reserve) bumpProtocolCounter('reserve', splits.reserve);
  bumpProtocolCounter('treasury', splits.treasury);
  if (feeEth > 0) bumpProtocolCounter('solRevenue', feeEth);
  addLedger(wallet, kind, -osr, { ...meta, ...splits, feeEth });
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export interface UserRow {
  wallet: string;
  osr_balance: number;
  created_at: number;
  last_seen: number;
  dripped: number;
  compound_level: number;
  compound_started_at: number | null;
  compound_target_level: number | null;
  compound_ready_at: number | null;
  last_crate_at: number | null;
  crates_opened_today: number;
  rig_crates_opened_today: number;
  shaft_crates_opened_today: number;
  crates_day: number;
  pity_legendary: number;
  pity_mythic: number;
  pity_divine: number;
  welcome_started_at: number | null;
  last_claim_at?: number | null;
}

/**
 * The row a wallet would be given on registration, materialised in memory only.
 *
 * Deliberately without the starter grant: nothing has been granted, and a read
 * path must not report a balance the protocol has not actually issued.
 */
function unregisteredUser(wallet: string): UserRow {
  const now = Date.now();
  return {
    wallet,
    osr_balance: 0,
    created_at: now,
    last_seen: now,
    dripped: 0,
    compound_level: 1,
    compound_started_at: null,
    compound_target_level: null,
    compound_ready_at: null,
    last_crate_at: null,
    crates_opened_today: 0,
    rig_crates_opened_today: 0,
    shaft_crates_opened_today: 0,
    crates_day: 0,
    pity_legendary: 0,
    pity_mythic: 0,
    pity_divine: 0,
    welcome_started_at: null,
    last_claim_at: null,
  };
}

/**
 * Look a wallet up without bringing it into existence.
 *
 * Reads are reachable unauthenticated — anyone can ask about any address — so
 * they must not be able to write. getOrCreateUser inserts a row and credits the
 * starter grant, which made a plain GET over random addresses both a way to
 * fill the disk and a way to mint supply that the public protocol figures then
 * reported as circulating.
 */
export function readUser(wallet: string): UserRow {
  const stored = getDb()
    .prepare('SELECT * FROM users WHERE wallet = ?')
    .get(wallet) as unknown as UserRow | undefined;
  return stored ?? unregisteredUser(wallet);
}

/**
 * What a new wallet starts with.
 *
 * The grant exists for exactly one reason: a fresh operator has to be able to
 * afford their first desk out of the MIRRORED balance. That is only how the
 * game works while spends settle off-chain — in the demo, which never signs
 * anything, and before the token exists.
 *
 * Once the token is live a spend is a real ERC-20 transfer and the route passes
 * settledOnChain, so osr_balance is neither debited by spends nor credited by
 * claims. Granting free BNTY there puts a number on the screen that cannot buy
 * anything and cannot be withdrawn: not a drain, but a balance that lies to the
 * player about what they have.
 *
 * This was previously unconditional, which is how every real wallet would have
 * started with 1,000 BNTY it could never spend.
 */
function starterGrantFor(wallet: string): number {
  // Demo accounts never settle on-chain, so the mirrored balance is the only
  // money they will ever have — and they get a different, larger figure than a
  // real wallet does, because the two grants answer different questions. A real
  // wallet is being given enough to START (one desk, then earn the rest); a
  // demo is being given enough to SEE, because it has ten minutes and no way to
  // earn anything. See DEMO_BNTY.
  //
  // Checked before the STARTER_BNTY_GRANT guard below on purpose: turning the
  // real grant off once the token is live must not also empty the demo, which
  // is the one account that can never buy anything with real tokens.
  if (isDemoWallet(wallet)) return DEMO_BNTY;
  if (STARTER_BNTY_GRANT <= 0) return 0;
  // Pre-token, everyone is playing the mirrored game.
  return TOKEN_LIVE ? 0 : STARTER_BNTY_GRANT;
}

export function getOrCreateUser(wallet: string): UserRow {
  const db = getDb();
  let user = db.prepare('SELECT * FROM users WHERE wallet = ?').get(wallet) as unknown as UserRow | undefined;
  const grant = starterGrantFor(wallet);
  if (!user) {
    const now = Date.now();
    // Seed the starter grant so a fresh wallet can afford its first node, and
    // mark dripped so it is credited exactly once per wallet.
    db.prepare(
      'INSERT OR IGNORE INTO users (wallet, osr_balance, created_at, last_seen, dripped) VALUES (?,?,?,?,1)'
    ).run(wallet, grant, now, now);
    user = db.prepare('SELECT * FROM users WHERE wallet = ?').get(wallet) as unknown as UserRow;
    if (grant > 0) addLedger(wallet, 'starter_grant', grant, {});
  } else if (!user.dripped) {
    // Wallet predates the starter grant — credit it once and flag it.
    //
    // Still flagged when the grant is zero, so a wallet first seen after the
    // token went live is not re-examined on every request forever.
    db.prepare('UPDATE users SET osr_balance = osr_balance + ?, dripped = 1 WHERE wallet = ?').run(
      grant,
      wallet
    );
    if (grant > 0) addLedger(wallet, 'starter_grant', grant, {});
    db.prepare('UPDATE users SET last_seen = ? WHERE wallet = ?').run(Date.now(), wallet);
    user = db.prepare('SELECT * FROM users WHERE wallet = ?').get(wallet) as unknown as UserRow;
  } else {
    db.prepare('UPDATE users SET last_seen = ? WHERE wallet = ?').run(Date.now(), wallet);
  }
  return user;
}

// ---------------------------------------------------------------------------
// Nodes & production
// ---------------------------------------------------------------------------

export interface NodeRow {
  id: number;
  wallet: string;
  family: NodeFamily;
  name: string | null;
  level: number;
  created_at: number;
  last_claim_at: number;
  accrued: number;
  accrued_updated_at: number;
  crate_rolled_at: number;
}

interface ComponentRow {
  id: number;
  wallet: string;
  slot: string;
  family: NodeFamily;
  rarity: Rarity;
  equipped_node_id: number | null;
  acquired_at: number;
}

function nodesOf(wallet: string): NodeRow[] {
  return getDb().prepare('SELECT * FROM nodes WHERE wallet = ? ORDER BY created_at').all(wallet) as unknown as NodeRow[];
}

function equippedComponents(nodeId: number): ComponentRow[] {
  return getDb()
    .prepare('SELECT * FROM components WHERE equipped_node_id = ?')
    .all(nodeId) as unknown as ComponentRow[];
}

/**
 * Averaging exponent for fitted instruments.
 *
 * Was 0.75. Halved to 0.5 — a square root — as the second half of the rarity
 * rebalance (see RARITY_MULT in lib/economy for the first).
 *
 * The exponent is what decides how much CONCENTRATING gear beats spreading it,
 * and therefore how much a deep build beats a wide one. archetype-balance.test
 * sweeps it: at 0.75 a deep build finished 64% ahead even with the compressed
 * rarity table, and reaching the test's original 10% needed 0.25 — which caps
 * the best gear in the game at 2.1x and makes instruments barely worth finding.
 *
 * 0.45 is where the levers line up: gear tops out around 3.9x against desk
 * level's 5x, and the gap between builds falls to about 30%. That is a
 * preference. Three hundred and sixty-six percent was a solved game.
 *
 * Chosen over 0.5, which measured 35.4% against a 35% tolerance — passing by
 * four tenths of a percent is not passing, it is a number that will go red on
 * the next unrelated edit. 0.45 leaves five points of headroom.
 */
export const COMPONENT_AVG_EXPONENT = 0.45;

/**
 * Formula D: average of the 4 slots' multipliers (empty = Common 1x), raised to
 * COMPONENT_AVG_EXPONENT, times the per-component rarity-boost stack.
 *
 * The boost stack is currently neutral — every entry is 1. It used to compound
 * per instrument, which meant four Divines on one desk were worth ~6x the same
 * four spread across four desks, and that is what made concentration the only
 * correct play. Kept in the expression rather than removed so the shape is still
 * visible; if it comes back it has to be additive.
 */
export function componentMultiplier(comps: { rarity: Rarity }[]): number {
  const mults = comps.map((c) => RARITY_MULT[c.rarity] ?? 1);
  while (mults.length < 4) mults.push(1);
  const avg = mults.reduce((a, b) => a + b, 0) / 4;
  const powered = Math.min(500, Math.pow(avg, COMPONENT_AVG_EXPONENT));
  const boost = comps.reduce((p, c) => p * (RARITY_BOOST[c.rarity] ?? 1), 1);
  return powered * boost;
}

/**
 * Options for any action that costs BNTY.
 *
 * When settlement is live the operator pays in real ERC-20 through
 * OSRGame.execute() before the server ever applies the state change. Debiting
 * the mirrored off-chain balance as well would charge them twice, so the route
 * passes settledOnChain and the debit is skipped. The ledger and protocol
 * counters still record the spend — only the balance column is left alone.
 */
export interface SpendOpts {
  settledOnChain?: boolean;
}

/**
 * Resolve how much to subtract from the mirrored balance, enforcing the
 * affordability check only when the operator has not already paid on-chain.
 */
/**
 * Assert a guarded debit actually took the money.
 *
 * The balance test in offChainDebit runs against a row read earlier in the
 * request, so it cannot see a debit that landed in between — and the schema has
 * no CHECK keeping osr_balance non-negative, so nothing below it would object
 * either. The `AND osr_balance >= ?` on each UPDATE is what genuinely enforces
 * the balance; this turns the resulting no-op into an error rather than letting
 * the caller carry on and hand out the goods for free.
 */
function requireDebited(result: { changes: number | bigint }, message: string): void {
  if (Number(result.changes) === 0) throw new GameError(message);
}

function offChainDebit(
  user: UserRow,
  cost: number,
  opts: SpendOpts | undefined,
  message: (have: string) => string
): number {
  if (opts?.settledOnChain) return 0;
  if (user.osr_balance < cost) {
    throw new GameError(message(Math.floor(user.osr_balance).toLocaleString()));
  }
  return cost;
}

/** Node grow-power = level multiplier x Formula D component multiplier. */
function nodeGp(node: NodeRow, comps: ComponentRow[]): number {
  return levelMultiplier(node.level) * componentMultiplier(comps);
}

/**
 * Total grow power across every node in the protocol, all wallets included.
 *
 * This is the emission denominator. It must be the whole network, not one
 * wallet: with a per-wallet denominator the share ratio is always 1, so every
 * operator pins to SHARE_CAP forever and node count, level, and gear stop
 * affecting emission share entirely.
 *
 * Cached briefly because settleUser runs on every read path.
 */
let networkGpCache: { value: number; at: number } | null = null;
const NETWORK_GP_TTL_MS = 5_000;

export function networkGrowPower(now = Date.now()): number {
  if (networkGpCache && now - networkGpCache.at < NETWORK_GP_TTL_MS) {
    return networkGpCache.value;
  }
  const rows = getDb()
    .prepare(
      `SELECT n.id AS id, n.wallet AS wallet, n.level AS level, c.rarity AS rarity
         FROM nodes n
         LEFT JOIN components c ON c.equipped_node_id = n.id`
    )
    .all() as unknown as Array<{ id: number; wallet: string; level: number; rarity: Rarity | null }>;

  const byNode = new Map<number, { wallet: string; level: number; comps: { rarity: Rarity }[] }>();
  for (const r of rows) {
    let entry = byNode.get(r.id);
    if (!entry) {
      entry = { wallet: r.wallet, level: r.level, comps: [] };
      byNode.set(r.id, entry);
    }
    if (r.rarity) entry.comps.push({ rarity: r.rarity });
  }

  // Floor-layout multipliers apply here as well as in settleUser. If they only
  // raised the numerator, a well-arranged fab would grow its own share without
  // shrinking anyone else's — the bonus would mint extra emission instead of
  // redistributing a fixed one. Applying it to both sides keeps the schedule
  // exact and makes layout a competition rather than a money printer.
  const layoutMultipliers = allLayoutMultipliers();

  let total = 0;
  for (const n of byNode.values()) {
    const layout = layoutMultipliers.get(n.wallet) ?? 1;
    total += levelMultiplier(n.level) * componentMultiplier(n.comps) * layout;
  }
  networkGpCache = { value: total, at: now };
  return total;
}

/**
 * Drop the cached denominator after any write that changes node count/level/gear
 * — or floor layout, which now scales grow power too, so the floor save route
 * calls this from outside the engine.
 */
export function invalidateNetworkGp(): void {
  networkGpCache = null;
}

interface SettledNode {
  row: NodeRow;
  comps: ComponentRow[];
  gp: number;
  rate: number;
  pendingBnty: number;
  storageCap: number;
}

/**
 * Settle accrual for all of a user's nodes up to now, and return live rates.
 * user_rate = min(user_gp / network_gp, 30%) x E(t) x welcome_boost,
 * distributed across the user's nodes proportional to node gp.
 */
export function settleUser(wallet: string, create = true): {
  user: UserRow;
  nodes: SettledNode[];
  userRate: number;
  userGp: number;
  networkGp: number;
  emission: number;
  boost: number;
  foundCrates: FoundCrate[];
  layout: LayoutBonus;
} {
  const db = getDb();
  // A wallet that has never played settles to zeros: it owns no nodes, so the
  // accrual loop and the crate roll below are both empty and nothing is written.
  // That is what makes the read routes safe to expose without authentication.
  const user = create ? getOrCreateUser(wallet) : readUser(wallet);
  const now = Date.now();
  const g = genesisMs();
  const emission = emissionRateAt(g, now);
  const boost = welcomeBoostFactor(user.welcome_started_at, now);

  const rows = nodesOf(wallet);
  const withComps = rows.map((row) => ({ row, comps: equippedComponents(row.id) }));
  // How the equipment is arranged on the floor scales the whole operation's
  // grow power. networkGrowPower applies the same factor to every wallet, so
  // this shifts share between operators rather than creating new emission.
  const layout = layoutBonus(wallet);
  const userGp = withComps.reduce((sum, n) => sum + nodeGp(n.row, n.comps), 0) * layout.multiplier;
  // Denominator is the whole protocol. Math.max guards the case where a cached
  // total lags a just-written node, which would otherwise push share above 1.
  const networkGp = Math.max(networkGrowPower(now), userGp);
  const share = networkGp > 0 ? Math.min(userGp / networkGp, SHARE_CAP) : 0;
  const userRate = share * emission * boost;

  const settled: SettledNode[] = withComps.map(({ row, comps }) => {
    const gp = nodeGp(row, comps);
    const rate = userGp > 0 ? (userRate * gp) / userGp : 0;
    const storageCap = Math.max(1, rate * STORAGE_CAP_SECONDS);
    const dt = Math.max(0, (now - row.accrued_updated_at) / 1000);
    const accrued = Math.min(storageCap, row.accrued + rate * dt);
    if (dt > 1) {
      db.prepare('UPDATE nodes SET accrued = ?, accrued_updated_at = ? WHERE id = ?').run(
        accrued,
        now,
        row.id
      );
      bumpProtocolCounter('emitted', Math.max(0, accrued - row.accrued));
      row.accrued = accrued;
      row.accrued_updated_at = now;
    }
    return { row, comps, gp, rate, pendingBnty: accrued, storageCap };
  });

  // Crates drop as a by-product of mining, so they are rolled here rather than
  // by a background job — every read of a wallet's state advances its chances
  // by exactly the time that has passed. Weighted by this wallet's share of
  // network grow power, which is the same basis emission uses.
  const foundCrates = rollCrateDrops(
    wallet,
    rows.map((row) => ({
      id: row.id,
      family: row.family as NodeFamily,
      crateRolledAt: row.crate_rolled_at ?? 0,
    })),
    networkGp > 0 ? userGp / networkGp : 0,
    now
  );

  return { user, nodes: settled, userRate, userGp, networkGp, emission, boost, foundCrates, layout };
}

/** Per-family node cap (mine shafts get bonus slots at L5/7/9). */
export function familyCap(user: UserRow, family: NodeFamily): number {
  const base = COMPOUND_LEVELS[Math.min(user.compound_level, MAX_COMPOUND_LEVEL)].maxNodes;
  return family === 'mine' ? base + getShaftBonusSlots(user.compound_level) : base;
}

// ---------------------------------------------------------------------------
// Crate allowance
// ---------------------------------------------------------------------------

function dayIndex(now: number): number {
  return Math.floor(now / 86_400_000);
}

export function crateAllowance(user: UserRow): {
  rigCratesRemaining: number;
  shaftCratesRemaining: number;
  perDay: number;
} {
  const perDay = COMPOUND_LEVELS[Math.min(user.compound_level, MAX_COMPOUND_LEVEL)].cratesPerDay;
  const today = dayIndex(Date.now());
  const rigUsed = user.crates_day === today ? user.rig_crates_opened_today : 0;
  const shaftUsed = user.crates_day === today ? user.shaft_crates_opened_today : 0;
  return {
    rigCratesRemaining: Math.max(0, perDay - rigUsed),
    shaftCratesRemaining: Math.max(0, perDay - shaftUsed),
    perDay,
  };
}

// ---------------------------------------------------------------------------
// Crate odds & opening
// ---------------------------------------------------------------------------

export function crateOdds(user: UserRow | null) {
  const level = user?.compound_level ?? 1;
  const weights: Record<Rarity, number> = { ...DROP_WEIGHTS };

  // Rarity pools unlock with compound level (Legendary L4, Mythic L6, Divine L8):
  // locked tiers' weight collapses into common.
  for (const [rarity, unlockLevel] of Object.entries(RARITY_UNLOCK_LEVEL) as [Rarity, number][]) {
    if (level < unlockLevel) {
      weights.common += weights[rarity];
      weights[rarity] = 0;
    }
  }

  // Pity ramps: past the soft threshold, legendary+ odds ramp up.
  if (user) {
    const ramp = (since: number, cfg: { soft: number | null; hard: number; rampMax: number }) => {
      if (cfg.soft === null || since <= cfg.soft) return 1;
      const t = Math.min(1, (since - cfg.soft) / (cfg.hard - cfg.soft));
      return 1 + t * (cfg.rampMax - 1);
    };
    weights.legendary *= ramp(user.pity_legendary, PITY.legendary);
    weights.mythic *= ramp(user.pity_mythic, PITY.mythic);
  }

  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  return {
    level,
    crateCost: crateCostBnty(getOsrUsdPrice().usdPerBnty),
    odds: RARITIES.map((rarity) => ({ rarity, chance: weights[rarity] / total })),
    guarantees: {
      legendaryPlus: PITY.legendary.hard,
      mythicPlus: PITY.mythic.hard,
      divine: PITY.divine.hard,
    },
    pity: user
      ? {
          sinceLegendaryPlus: user.pity_legendary,
          sinceMythicPlus: user.pity_mythic,
          sinceDivine: user.pity_divine,
        }
      : undefined,
  };
}

function rollRarity(user: UserRow): { rarity: Rarity; pityTriggered: 'legendary' | 'mythic' | 'divine' | null } {
  const level = user.compound_level;
  const unlocked = (r: Rarity) => level >= (RARITY_UNLOCK_LEVEL[r] ?? 0);
  if (unlocked('divine') && user.pity_divine + 1 >= PITY.divine.hard)
    return { rarity: 'divine', pityTriggered: 'divine' };
  if (unlocked('mythic') && user.pity_mythic + 1 >= PITY.mythic.hard)
    return { rarity: 'mythic', pityTriggered: 'mythic' };
  if (unlocked('legendary') && user.pity_legendary + 1 >= PITY.legendary.hard)
    return { rarity: 'legendary', pityTriggered: 'legendary' };

  const { odds } = crateOdds(user);
  let roll = Math.random();
  for (const { rarity, chance } of odds) {
    roll -= chance;
    if (roll <= 0) return { rarity: rarity as Rarity, pityTriggered: null };
  }
  return { rarity: 'common', pityTriggered: null };
}

export function openCrate(
  wallet: string,
  crateId: number,
  targetNodeId: number | null,
  opts?: SpendOpts & { forceSlot?: string; forceRarity?: Rarity }
) {
  const db = getDb();
  const { user, nodes } = settleUser(wallet);

  // Crates are found by mining, not bought. Opening one requires actually
  // holding it — this is what stops an operator manufacturing unlimited crates
  // by spending, which is what the old daily-purchase allowance permitted.
  const crateRow = db
    .prepare(
      `SELECT id, crate_type, opened_at, listing_id FROM crates WHERE id = ? AND wallet = ?`
    )
    .get(crateId, wallet) as
    | { id: number; crate_type: 'equity_allocation' | 'treasury_allocation'; opened_at: number | null; listing_id: number | null }
    | undefined;
  if (!crateRow) throw new GameError('allocation not found in your inventory', 404);
  if (crateRow.opened_at != null) throw new GameError('that allocation has already been opened', 400);
  if (crateRow.listing_id != null) {
    throw new GameError('that allocation is listed for sale — cancel the listing to open it', 400);
  }
  const crateType = crateRow.crate_type;

  const cost = crateCostBnty(getOsrUsdPrice().usdPerBnty);
  const debit = offChainDebit(user, cost, opts, (have) =>
    `Not enough BNTY to open that allocation: need ${cost.toLocaleString()} BNTY (you have ${have}). Route rewards or earn more BNTY first.`
  );

  const family: NodeFamily = crateType === 'equity_allocation' ? 'oil' : 'mine';
  const slots = NODE_SLOTS[family];
  const slot = opts?.forceSlot && slots.includes(opts.forceSlot)
    ? opts.forceSlot
    : slots[Math.floor(Math.random() * slots.length)];

  let rarity: Rarity;
  let pityTriggered: 'legendary' | 'mythic' | 'divine' | null = null;
  if (opts?.forceRarity && RARITIES.includes(opts.forceRarity)) {
    rarity = opts.forceRarity;
  } else {
    ({ rarity, pityTriggered } = rollRarity(user));
  }

  // Pay: 50/30/20 burn/reserve/treasury + 0.00002 ETH protocol fee.
  const burn = Math.floor((SPLIT_BURN_BPS * cost) / 10000);
  const reserve = Math.floor((SPLIT_RESERVE_BPS * cost) / 10000);
  const treasury = cost - burn - reserve;
  const now = Date.now();
  const today = dayIndex(now);
  const tier = RARITIES.indexOf(rarity);
  const rigIncrement = crateType === 'equity_allocation' ? 1 : 0;
  const shaftIncrement = crateType === 'treasury_allocation' ? 1 : 0;
  const charged = db.prepare(
    `UPDATE users SET
       osr_balance = osr_balance - ?,
       crates_opened_today = CASE WHEN crates_day = ? THEN crates_opened_today + 1 ELSE 1 END,
       rig_crates_opened_today = CASE
         WHEN crates_day = ? THEN rig_crates_opened_today + ? ELSE ? END,
       shaft_crates_opened_today = CASE
         WHEN crates_day = ? THEN shaft_crates_opened_today + ? ELSE ? END,
       crates_day = ?,
       last_crate_at = ?,
       pity_legendary = ?,
       pity_mythic = ?,
       pity_divine = ?
     WHERE wallet = ? AND osr_balance >= ?`
  ).run(
    debit,
    today,
    today,
    rigIncrement,
    rigIncrement,
    today,
    shaftIncrement,
    shaftIncrement,
    today,
    now,
    tier >= RARITIES.indexOf('legendary') ? 0 : user.pity_legendary + 1,
    tier >= RARITIES.indexOf('mythic') ? 0 : user.pity_mythic + 1,
    tier >= RARITIES.indexOf('divine') ? 0 : user.pity_divine + 1,
    wallet,
    debit
  );
  requireDebited(charged, 'Not enough BNTY to open that allocation.');
  // Consume the crate in the same pass that charges for it, so a failure
  // cannot leave the operator paid-up with the crate still openable.
  db.prepare(
    `UPDATE crates SET opened_at = ?, result_rarity = ?, result_slot = ?, seen_at = COALESCE(seen_at, ?)
      WHERE id = ? AND opened_at IS NULL`
  ).run(now, rarity, slot, now, crateId);

  paySplits(wallet, 'crate_open', cost, { burn, reserve, treasury }, CRATE_FEE_ETH, {
    crateType,
    slot,
    rarity,
    crateId,
  });

  let isUpgrade = false;
  let previousRarity: Rarity | undefined;
  if (targetNodeId != null) {
    const target = nodes.find((n) => n.row.id === targetNodeId);
    const existing = target?.comps.find((c) => c.slot === slot);
    if (existing) {
      previousRarity = existing.rarity;
      isUpgrade = RARITIES.indexOf(rarity) > RARITIES.indexOf(existing.rarity);
    }
  }

  const res = db
    .prepare(
      'INSERT INTO components (wallet, slot, family, rarity, equipped_node_id, acquired_at) VALUES (?,?,?,?,NULL,?)'
    )
    .run(wallet, slot, family, rarity, now);

  recordQuestProgress(wallet, 'open_allocation');

  return {
    inventoryItemId: Number(res.lastInsertRowid),
    slot,
    rarity,
    isUpgrade,
    previousRarity,
    pityTriggered,
  };
}

// ---------------------------------------------------------------------------
// Mint / deploy node
// ---------------------------------------------------------------------------

export function mintNode(wallet: string, familyKey: string, opts?: SpendOpts) {
  const db = getDb();
  const { user, nodes } = settleUser(wallet);
  const fam = NODE_FAMILIES.find((f) => f.key === familyKey);
  if (!fam) throw new GameError(`Unknown node family: ${familyKey}`);

  const cap = familyCap(user, fam.family);
  const owned = nodes.filter((n) => n.row.family === fam.family).length;
  if (owned >= cap) throw new GameError('Capacity full · upgrade portfolio to add more');
  /*
   * OPENING a desk costs capital only. No timber.
   *
   * The first draft charged a frame here and it made the game unstartable: the
   * introduction's very first instruction is to open a desk, and a frame is
   * 24 oak behind an axe behind 400 Scrip. Materials start at level 5 instead —
   * see FRAMES_FROM_LEVEL in lib/capital — which is where the wood ladder is
   * both required and reachable.
   */
  const debit = offChainDebit(user, fam.burnCostBnty, opts, (have) =>
    `Not enough BNTY: need ${fam.burnCostBnty.toLocaleString()} BNTY (you have ${have}). Route rewards or open allocations first.`
  );

  const burn = (fam.burnCostBnty * fam.burnShareBps) / 10000;
  const treasury = (fam.burnCostBnty * fam.treasuryShareBps) / 10000;
  const now = Date.now();
  requireDebited(
    db
      .prepare(
        `UPDATE users SET osr_balance = osr_balance - ?, welcome_started_at = COALESCE(welcome_started_at, ?)
          WHERE wallet = ? AND osr_balance >= ?`
      )
      .run(debit, now, wallet, debit),
    'Not enough BNTY to open that desk.'
  );
  paySplits(wallet, 'mint_node', fam.burnCostBnty, { burn, treasury }, fam.mintFeeEth, {
    familyKey,
  });
  const res = db
    .prepare(
      'INSERT INTO nodes (wallet, family, level, created_at, last_claim_at, accrued, accrued_updated_at) VALUES (?,?,1,?,?,0,?)'
    )
    .run(wallet, fam.family, now, now, now);

  invalidateNetworkGp();
  recordQuestProgress(wallet, 'mint_desk');
  return { node: { id: Number(res.lastInsertRowid), type: fam.family, level: 1 } };
}

// ---------------------------------------------------------------------------
// Claim / compound rewards
// ---------------------------------------------------------------------------

function lastClaimAt(wallet: string): number {
  const row = getDb()
    .prepare(
      "SELECT MAX(created_at) AS t FROM ledger WHERE wallet = ? AND kind = 'claim'"
    )
    .get(wallet) as { t: number | null };
  return row.t ?? 0;
}

export function claimRewards(
  wallet: string,
  nodeId?: number,
  mode: 'claim' | 'compound' = 'claim',
  opts?: SpendOpts
) {
  const db = getDb();
  const { user, nodes } = settleUser(wallet);
  const now = Date.now();

  if (mode === 'claim') {
    const since = now - lastClaimAt(wallet);
    if (since < CLAIM_COOLDOWN_MS) {
      const mins = Math.ceil((CLAIM_COOLDOWN_MS - since) / 60000);
      throw new GameError(`Claim cooldown — ready in ${mins}m.`);
    }
  }

  const targets = nodeId != null ? nodes.filter((n) => n.row.id === nodeId) : nodes;
  const claims: Array<{
    nodeId: number;
    status: 'confirmed' | 'failed';
    gross: number;
    fee: number;
    net: number;
    mode: string;
  }> = [];

  for (const n of targets) {
    const gross = n.pendingBnty;
    if (gross <= 0) continue;
    const isCompound = mode === 'compound' && n.row.family === 'mine';
    if (mode === 'compound' && n.row.family !== 'mine') continue;
    const feeBps = isCompound ? COMPOUND_REINVEST_FEE_BPS : CLAIM_FEE_BPS;
    const fee = (gross * feeBps) / 10000;
    const net = gross - fee;

    db.prepare(
      'UPDATE nodes SET accrued = 0, accrued_updated_at = ?, last_claim_at = ? WHERE id = ?'
    ).run(now, now, n.row.id);
    // A settled claim already moved real BNTY out of the vault into the
    // operator's wallet, so crediting the mirrored balance too would pay twice.
    // This holds for compound mode as well: once settlement is live, compounding
    // is a claim at the lower reinvest fee that still lands real tokens on-chain,
    // rather than an internal credit that could never be spent there.
    const credit = opts?.settledOnChain ? 0 : net;
    db.prepare('UPDATE users SET osr_balance = osr_balance + ? WHERE wallet = ?').run(credit, wallet);
    bumpProtocolCounter('reserve', fee);
    addLedger(wallet, isCompound ? 'compound_claim' : 'claim', net, {
      nodeId: n.row.id,
      gross,
      fee,
    });

    claims.push({ nodeId: n.row.id, status: 'confirmed', gross, fee, net, mode: isCompound ? 'compound' : 'claim' });
  }
  // One routing action, however many desks it settled — otherwise a wide floor
  // finishes a "route 3 times" daily in a single click.
  if (claims.length > 0) recordQuestProgress(wallet, 'claim');
  return { claims };
}

// ---------------------------------------------------------------------------
// Compound upgrade
// ---------------------------------------------------------------------------

export function compoundInfo(wallet: string, create = true) {
  const { user } = settleUser(wallet, create);
  const level = user.compound_level;
  const next = level + 1;
  const nextDef = COMPOUND_LEVELS[next];
  const cooldownRemainingMs = Math.max(0, (user.compound_ready_at ?? 0) - Date.now());
  return {
    level,
    maxNodes: COMPOUND_LEVELS[Math.min(level, MAX_COMPOUND_LEVEL)].maxNodes,
    shaftBonusSlots: getShaftBonusSlots(level),
    cratesPerDay: COMPOUND_LEVELS[Math.min(level, MAX_COMPOUND_LEVEL)].cratesPerDay,
    crateCost: crateCostBnty(getOsrUsdPrice().usdPerBnty),
    cooldownRemainingMs,
    nextUpgradeCost:
      level >= MAX_COMPOUND_LEVEL || !nextDef
        ? null
        : {
            targetLevel: next,
            totalBnty: nextDef.bntyUpgradeCost,
            feeEth: COMPOUND_FEE_ETH,
            burnBnty: (nextDef.bntyUpgradeCost * SPLIT_BURN_BPS) / 10000,
            reserveBnty: (nextDef.bntyUpgradeCost * SPLIT_RESERVE_BPS) / 10000,
            treasuryBnty:
              nextDef.bntyUpgradeCost -
              (nextDef.bntyUpgradeCost * SPLIT_BURN_BPS) / 10000 -
              (nextDef.bntyUpgradeCost * SPLIT_RESERVE_BPS) / 10000,
          },
  };
}

export function upgradeCompound(
  wallet: string,
  expedite = false,
  opts?: SpendOpts,
  expectTargetLevel?: number
) {
  const db = getDb();
  const info = compoundInfo(wallet);
  const user = getOrCreateUser(wallet);
  if (!info.nextUpgradeCost) throw new GameError('already at max portfolio level');
  if (!expedite && info.cooldownRemainingMs > 0)
    throw new GameError('Portfolio upgrade is cooling down — expedite for 0.005 ETH or wait.');
  const { totalBnty, burnBnty, reserveBnty, treasuryBnty, targetLevel } = info.nextUpgradeCost;
  // The caller priced a specific level. Re-deriving "whatever is next" here
  // instead would let several quotes taken at one level be settled in sequence,
  // each granting the next level for the price of the first: L1 costs 1,000, so
  // five L2 quotes bought L2..L6 for 5,000 against a real cost of 31,000.
  if (expectTargetLevel != null && expectTargetLevel !== targetLevel) {
    throw new GameError('portfolio level moved since the quote — request a fresh one', 409);
  }
  const debit = offChainDebit(user, totalBnty, opts, (have) =>
    `Not enough BNTY for portfolio upgrade: need ${totalBnty.toLocaleString()} BNTY (you have ${have}).`
  );

  const now = Date.now();
  requireDebited(
    db
      .prepare(
        `UPDATE users SET osr_balance = osr_balance - ?, compound_level = ?, compound_ready_at = ?
          WHERE wallet = ? AND osr_balance >= ?`
      )
      .run(debit, targetLevel, now + COMPOUND_COOLDOWN_MS, wallet, debit),
    'Not enough BNTY for that portfolio upgrade.'
  );
  paySplits(
    wallet,
    expedite ? 'compound_expedite' : 'compound_upgrade',
    totalBnty,
    { burn: burnBnty, reserve: reserveBnty, treasury: treasuryBnty },
    COMPOUND_FEE_ETH + (expedite ? EXPEDITE_FEE_ETH : 0),
    { targetLevel }
  );

  const lvl = COMPOUND_LEVELS[Math.min(targetLevel, MAX_COMPOUND_LEVEL)];
  return {
    compound: {
      level: targetLevel,
      maxNodes: lvl.maxNodes,
      cratesPerDay: lvl.cratesPerDay,
    },
  };
}

// ---------------------------------------------------------------------------
// Components equip / unequip
// ---------------------------------------------------------------------------

export function equipComponent(wallet: string, inventoryItemId: number, targetNodeId: number) {
  const db = getDb();
  const comp = db
    .prepare('SELECT * FROM components WHERE id = ? AND wallet = ?')
    .get(inventoryItemId, wallet) as unknown as ComponentRow | undefined;
  if (!comp) throw new GameError('Instrument not found in your inventory', 404);
  if (comp.equipped_node_id != null) throw new GameError('Instrument is already equipped');
  // An open listing is a promise to a buyer. Fitting a listed instrument to a
  // desk would let the desk sale carry it to one wallet while the listing is
  // still standing for another — the same item sold twice.
  const listed = db
    .prepare(`SELECT 1 AS hit FROM listings WHERE item_kind = 'component' AND item_id = ? AND status = 'open'`)
    .get(inventoryItemId) as { hit: number } | undefined;
  if (listed) throw new GameError('That instrument is listed on the Exchange — cancel the listing first');
  const node = db
    .prepare('SELECT * FROM nodes WHERE id = ? AND wallet = ?')
    .get(targetNodeId, wallet) as unknown as NodeRow | undefined;
  if (!node) throw new GameError('Desk not found', 404);
  if (node.family !== comp.family)
    throw new GameError(
      `That instrument belongs to a ${comp.family === 'oil' ? 'equity desk' : 'treasury desk'}`
    );

  settleUser(wallet);
  db.prepare(
    'UPDATE components SET equipped_node_id = NULL WHERE equipped_node_id = ? AND slot = ?'
  ).run(targetNodeId, comp.slot);
  db.prepare('UPDATE components SET equipped_node_id = ? WHERE id = ?').run(
    targetNodeId,
    inventoryItemId
  );
  invalidateNetworkGp();
  recordQuestProgress(wallet, 'equip_instrument');
  return { ok: true, slot: comp.slot, rarity: comp.rarity, nodeId: targetNodeId };
}

export function unequipComponent(wallet: string, nodeId: number, slot: string) {
  const db = getDb();
  settleUser(wallet);
  const res = db
    .prepare(
      'UPDATE components SET equipped_node_id = NULL WHERE equipped_node_id = ? AND slot = ? AND wallet = ?'
    )
    .run(nodeId, slot, wallet);
  if (res.changes === 0) throw new GameError('Nothing equipped in that slot', 404);
  invalidateNetworkGp();
  return { ok: true };
}

export function inventory(wallet: string) {
  // No user lookup: this only reads rows keyed by wallet, and an unknown wallet
  // simply owns none. The getOrCreateUser call that used to sit here discarded
  // its result — it existed only to ensure the row, which is exactly what a read
  // must not do.
  const rows = getDb()
    .prepare('SELECT * FROM components WHERE wallet = ? ORDER BY acquired_at DESC')
    .all(wallet) as unknown as ComponentRow[];
  return {
    items: rows.map((c) => ({
      id: c.id,
      slot: c.slot,
      family: c.family,
      nodeType: c.family,
      rarity: c.rarity,
      equippedNodeId: c.equipped_node_id,
      createdAt: c.acquired_at,
      durability: 1,
      multiplier: RARITY_MULT[c.rarity] ?? 1,
    })),
  };
}

// ---------------------------------------------------------------------------
// Node level-up (mine compounding sink)
// ---------------------------------------------------------------------------

// Priced in lib/capital, next to the capital a level consumes. The two are one
// decision — what a desk costs in money and what it costs against the fund's
// budget only balance when they are chosen together — and splitting them across
// two files is how they drift apart. Re-exported so existing callers are
// unaffected.
export { nodeUpgradeCost };

export function upgradeNode(
  wallet: string,
  nodeId: number,
  opts?: SpendOpts,
  expectFromLevel?: number
) {
  const db = getDb();
  const { user, nodes } = settleUser(wallet);
  const node = nodes.find((n) => n.row.id === nodeId);
  if (!node) throw new GameError('Desk not found', 404);
  // Upgrade cost climbs with level, and quotes are free and unlimited, so ten
  // taken while the node sits at L1 must not settle in sequence to reach L11 at
  // L1's price — 2,500 BNTY against a true cost near 45,000.
  if (expectFromLevel != null && expectFromLevel !== node.row.level) {
    throw new GameError('desk level moved since the quote — request a fresh one', 409);
  }
  /*
   * Timber for the level being reached, before the token moves.
   *
   * This is what makes materials a PERMANENT parallel demand rather than a
   * one-time tax on opening a desk. A flat cost paid at mint would be outgrown
   * immediately and woodcutting would stay a beginner activity; charging every
   * level means a level-15 floor still wants wood, which is what keeps a
   * gathering skill relevant to somebody a hundred hours in.
   *
   * Priced off the level being MOVED TO, and deliberately shallow — see
   * deskFrames in lib/capital for why two steep curves multiplied together is a
   * wall rather than a decision.
   */
  const toLevel = node.row.level + 1;
  spendMaterial(wallet, DESK_MATERIAL, deskFrames(toLevel), 'Desk Frame');

  const cost = nodeUpgradeCost(node.row.level);
  const debit = offChainDebit(user, cost, opts, (have) =>
    `Not enough BNTY to level up: need ${cost.toLocaleString()} BNTY (you have ${have}).`
  );
  const burn = Math.floor((cost * SPLIT_BURN_BPS) / 10000);
  const reserve = Math.floor((cost * SPLIT_RESERVE_BPS) / 10000);
  requireDebited(
    db
      .prepare('UPDATE users SET osr_balance = osr_balance - ? WHERE wallet = ? AND osr_balance >= ?')
      .run(debit, wallet, debit),
    'Not enough BNTY to level up that desk.'
  );
  db.prepare('UPDATE nodes SET level = level + 1 WHERE id = ?').run(nodeId);
  paySplits(wallet, 'node_upgrade', cost, { burn, reserve, treasury: cost - burn - reserve }, 0, {
    nodeId,
    toLevel: node.row.level + 1,
  });
  invalidateNetworkGp();
  recordQuestProgress(wallet, 'upgrade_desk');
  return { nodeId, level: node.row.level + 1, cost };
}

// ---------------------------------------------------------------------------
// Aggregate views
// ---------------------------------------------------------------------------

export function userOperation(wallet: string) {
  const { user, nodes, userRate, userGp, networkGp, boost } = settleUser(wallet);
  const compound = compoundInfo(wallet);
  const allowance = crateAllowance(user);
  const db = getDb();
  const totals = db
    .prepare(
      "SELECT COALESCE(SUM(amount),0) AS t FROM ledger WHERE wallet = ? AND kind IN ('claim','compound_claim')"
    )
    .get(wallet) as { t: number };
  const claimCooldownRemainingMs = Math.max(0, CLAIM_COOLDOWN_MS - (Date.now() - lastClaimAt(wallet)));

  return {
    level: user.compound_level,
    maxNodes: compound.maxNodes,
    shaftBonusSlots: compound.shaftBonusSlots,
    productionRate: userRate,
    growPower: userGp,
    networkGrowPower: networkGp,
    joinedAtMs: user.welcome_started_at,
    welcomeBoostFactor: boost,
    bntyBalance: user.osr_balance,
    totalProduced: totals.t,
    totals: { BNTY: totals.t },
    pending: { BNTY: nodes.reduce((s, n) => s + n.pendingBnty, 0) },
    claimCooldownRemainingMs,
    crateCooldown: {
      rigCratesRemaining: allowance.rigCratesRemaining,
      shaftCratesRemaining: allowance.shaftCratesRemaining,
    },
    // Crates the operator has mined and not yet opened, plus the ones they have
    // not acknowledged — the latter drives the "you mined a crate" notice.
    crates: unopenedCrates(wallet),
    unseenCrates: unseenCrates(wallet),
    compound,
    nodes: nodes.map((n, i) => ({
      id: String(n.row.id),
      type: n.row.family,
      level: n.row.level,
      productionRate: n.rate,
      isActive: true,
      totalProduced: 0,
      createdAt: new Date(n.row.created_at).toISOString(),
      layoutSeed: n.row.id * 7919 + i,
      components: n.comps.map((c) => ({ id: c.id, slot: c.slot, rarity: c.rarity, durability: 1, multiplier: RARITY_MULT[c.rarity] ?? 1 })),
      componentMultiplier: componentMultiplier(n.comps),
      pendingBnty: n.pendingBnty,
      storageCap: n.storageCap,
      nextLevelCost: nodeUpgradeCost(n.row.level),
    })),
  };
}

export function protocolOverview() {
  const now = Date.now();
  const g = genesisMs();
  // Always report the protocol's real figures. These are all derived from the
  // engine's own ledger and the emission schedule, so they are true before the
  // token exists as well as after; zeroing them pre-token made every protocol
  // page read empty rather than honest.
  const counters = protocolCounters();
  const db = getDb();
  const totalNodes = (db.prepare('SELECT COUNT(*) AS c FROM nodes').get() as { c: number }).c;
  const totalEquityDesks = (db.prepare("SELECT COUNT(*) AS c FROM nodes WHERE family = 'oil'").get() as { c: number }).c;
  const totalTreasuryDesks = (db.prepare("SELECT COUNT(*) AS c FROM nodes WHERE family = 'mine'").get() as { c: number }).c;
  const halving = halvingInfo(g, now);
  const reserve = Math.max(0, EMISSION_RESERVE - counters.emitted + counters.reserve);

  // Queried here rather than imported from stake.ts: the engine must not depend
  // on a module that already depends on it, and this is a plain aggregate.
  const stakeStats = db
    .prepare(
      `SELECT COUNT(*) AS c, COALESCE(SUM(principal), 0) AS principal
         FROM stakes WHERE status = 'active'`
    )
    .get() as { c: number; principal: number };
  // Demo accounts excluded. They hold fake BNTY nobody can sign for, so
  // counting it here would report tokens as circulating that were never minted
  // and can never move — and anyone can open as many demo sessions as they
  // like. See DEMO_WALLET_LIKE.
  const balances = (
    db
      .prepare('SELECT COALESCE(SUM(osr_balance), 0) AS t FROM users WHERE wallet NOT LIKE ?')
      .get(DEMO_WALLET_LIKE) as { t: number }
  ).t;
  const operators = (db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number }).c;
  return {
    networkProductionRate: halving.currentRatePerSec,
    emissionFactors: { shareCap: SHARE_CAP },
    totalNodes,
    totalEquityDesks,
    totalTreasuryDesks,
    totalSupply: TOTAL_SUPPLY,
    totalBntyBurned: counters.burned,
    totalCreatorRewardsProcessed: counters.solRevenue,
    // What is left in the rewards pool, not the whole supply: emission draws
    // from the reserve, and the reserve split on in-game spends tops it back up.
    bntyReserveBalance: reserve,
    treasury: counters.treasury,
    genesisMs: g,
    halving,

    // --- Live network telemetry -------------------------------------------
    // Read straight from the ledger rather than tracked in a counter, so these
    // cannot drift out of step with what actually happened.
    totalEmitted: counters.emitted,
    /**
     * Days of emission the reserve covers at today's rate.
     *
     * Not a solvency countdown. The halving curve means the rate keeps halving,
     * so lifetime emission converges below the reserve and this number climbs
     * over time — it answers "how deep is the pool at the current draw", which
     * is the honest reading of it.
     */
    reserveDaysAtCurrentRate:
      halving.currentRatePerSec > 0
        ? reserve / (halving.currentRatePerSec * 86_400)
        : Number.POSITIVE_INFINITY,
    /** BNTY locked in open capacity contracts, and the interest promised on it. */
    contracts: {
      open: stakeStats.c,
      lockedPrincipal: stakeStats.principal,
      committedInterest: Math.max(0, Number(getProtocolValue('stakeCommitted') ?? '0')),
    },
    /** Circulating float that is not locked away in a contract. */
    mirroredBalances: balances,
    activeOperators: operators,
  };
}

export function leaderboard(metric = 'compound_level') {
  const db = getDb();
  const users = db.prepare('SELECT wallet FROM users').all() as { wallet: string }[];
  const rows = users.map(({ wallet }) => {
    const { user, nodes, userRate } = settleUser(wallet);
    const claimed = db
      .prepare(
        "SELECT COALESCE(SUM(amount),0) AS t FROM ledger WHERE wallet = ? AND kind IN ('claim','compound_claim')"
      )
      .get(wallet) as { t: number };
    const burned = db
      .prepare(
        "SELECT COALESCE(SUM(-amount),0) AS t FROM ledger WHERE wallet = ? AND kind IN ('mint_node','crate_open','compound_upgrade','compound_expedite','node_upgrade')"
      )
      .get(wallet) as { t: number };
    return {
      wallet,
      compoundLevel: user.compound_level,
      maxLevel: nodes.reduce((m, n) => Math.max(m, n.row.level), 0),
      sumLevel: nodes.reduce((s, n) => s + n.row.level, 0),
      nodes: nodes.length,
      productionRate: userRate,
      totalProduced: claimed.t,
      totalBurned: burned.t,
    };
  });
  const key =
    metric === 'total_produced'
      ? 'totalProduced'
      : metric === 'total_burned'
        ? 'totalBurned'
        : 'compoundLevel';
  rows.sort((a, b) => (b[key] as number) - (a[key] as number));
  return rows.slice(0, 100).map((r, i) => ({ rank: i + 1, ...r }));
}

export function treasuryEvents(limit = 100) {
  return (
    getDb()
      .prepare(
        "SELECT id, wallet, kind, amount, meta, created_at FROM ledger ORDER BY created_at DESC LIMIT ?"
      )
      .all(limit) as unknown as Array<{
      id: number;
      wallet: string;
      kind: string;
      amount: number;
      meta: string | null;
      created_at: number;
    }>
  ).map((e) => ({
    id: e.id,
    createdAt: e.created_at,
    eventType: e.kind,
    walletLabel: `${e.wallet.slice(0, 4)}…${e.wallet.slice(-4)}`,
    amount: e.amount,
    assetSymbol: 'BNTY',
    meta: e.meta ? JSON.parse(e.meta) : null,
  }));
}
