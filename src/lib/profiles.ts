import type { UserOperation } from './api-client';
import {
  getPublicServerSupabase,
  getServerSupabase,
  publicSupabaseConfigured,
  supabaseConfigured,
} from './supabase';

export type LeaderboardMetric = 'compound_level' | 'total_produced' | 'total_burned';

/**
 * A read against the profile registry, with a failed read treated as an ABSENT
 * registry rather than an error.
 *
 * Every reader below has a local fallback, because Supabase holds a PROJECTION
 * of state that SQLite already owns — the leaderboard route falls back to
 * `leaderboard()` off the game database, and the profile screens fall back to a
 * locally-stored fund name. None of that fired, because the fallbacks were
 * written to trigger on `null` (registry not configured) and a registry that IS
 * configured but unreachable throws instead.
 *
 * The consequence was out of all proportion to the fault. `/api/leaderboard` is
 * Railway's healthcheck path, so an unreachable Supabase project would not
 * merely degrade the leaderboard — it would fail the healthcheck, restart the
 * container, and take a fully working game offline over a cosmetic ranking. A
 * paused Supabase project does exactly this, and pausing is something Supabase
 * does on its own for inactivity.
 *
 * Degrades on ANY read error, not only on a transport failure. Sorting the two
 * apart means matching on driver error strings, which is a guess that gets
 * stale; and the safe direction is the same either way, because a broken query
 * should not be able to take the site down either. It is logged rather than
 * swallowed so a real query bug still has somewhere to show up.
 *
 * Reads only. Writes (`updateProfileIdentity`, `saveAvatar`) still throw: a
 * player who renames their fund must be told it did not save, not shown a
 * success that never landed.
 */
async function readRegistry<T>(what: string, run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await withDeadline(run(), fallback, what);
  } catch (error) {
    console.error(`[profiles] ${what} unavailable, serving without it`, error);
    return fallback;
  }
}

/**
 * How long a registry read may take before it is abandoned.
 *
 * Not catching the error is only half the job — supabase-js retries internally
 * before it reports a transport failure, measured at about seven seconds
 * against a dead project. Seven seconds is a long time to hold a request open
 * in a single-threaded process where every other player is queued behind it,
 * and it is charged on EVERY read for the whole duration of an outage.
 *
 * So the deadline is on top of the catch, not instead of it. Generous compared
 * to a healthy round trip (tens of milliseconds), short enough that an outage
 * costs a noticeable pause rather than a stall.
 */
const REGISTRY_DEADLINE_MS = 2_500;

function withDeadline<T>(work: Promise<T>, fallback: T, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      console.error(`[profiles] ${what} exceeded ${REGISTRY_DEADLINE_MS}ms, serving without it`);
      resolve(fallback);
    }, REGISTRY_DEADLINE_MS);
    // The abandoned request is left to settle on its own. It holds no lock and
    // its result is discarded; the alternative is threading an AbortSignal
    // through every call site to cancel a request that is already failing.
    work.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); }
    );
  });
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

type ProfileRow = {
  wallet: string;
  display_name: string | null;
  avatar_url?: string | null;
  joined_at: number | string;
  last_seen_at: number | string;
  total_sessions: number;
  compound_level: number;
  node_count: number;
  max_node_level: number;
  sum_node_levels: number;
  production_rate: number;
  total_produced: number;
  total_burned: number;
};

function profileFromRow(row: ProfileRow): GlobalProfile {
  const lastSeenAt = Number(row.last_seen_at);
  return {
    wallet: row.wallet,
    displayName: row.display_name,
    avatarUrl: row.avatar_url ?? null,
    joinedAt: Number(row.joined_at),
    lastSeenAt,
    totalSessions: Number(row.total_sessions),
    compoundLevel: Number(row.compound_level),
    nodeCount: Number(row.node_count),
    maxNodeLevel: Number(row.max_node_level),
    sumNodeLevels: Number(row.sum_node_levels),
    productionRate: Number(row.production_rate),
    totalProduced: Number(row.total_produced),
    totalBurned: Number(row.total_burned),
    online: Date.now() - lastSeenAt < 5 * 60_000,
  };
}

function activityFromRow(row: Record<string, unknown>): ActivityItem {
  return {
    id: Number(row.id),
    wallet: String(row.wallet),
    eventType: String(row.event_type),
    source: row.source as ActivityItem['source'],
    amount: row.amount == null ? null : Number(row.amount),
    assetSymbol: row.asset_symbol == null ? null : String(row.asset_symbol),
    txHash: row.tx_hash == null ? null : String(row.tx_hash),
    metadata: (row.metadata as Record<string, unknown> | null) ?? {},
    createdAt: String(row.created_at),
  };
}

export async function touchGlobalProfile(wallet: string, operation?: UserOperation) {
  if (!supabaseConfigured()) return null;
  const nodes = operation?.nodes ?? [];
  const { data, error } = await getServerSupabase().rpc('touch_profile', {
    p_wallet: wallet.toLowerCase(),
    p_compound_level: operation?.level ?? 1,
    p_node_count: nodes.length,
    p_max_node_level: nodes.reduce((max, node) => Math.max(max, node.level), 0),
    p_sum_node_levels: nodes.reduce((sum, node) => sum + node.level, 0),
    p_production_rate: operation?.productionRate ?? 0,
    p_total_produced: operation?.totalProduced ?? 0,
    p_total_burned: 0,
  });
  if (error) throw new Error(`Supabase profile sync failed: ${error.message}`);
  return profileFromRow(data as ProfileRow);
}

/**
 * Whether the registry answered at all, distinct from whether it holds a row.
 *
 * `null` from getGlobalProfile is ambiguous — it is both "this wallet has no
 * profile yet" and "there is no registry" — and the caller needs to tell those
 * apart, because the first is a normal new player and the second is an outage.
 * Tracked here rather than returned, so the read signatures stay as they were.
 */
const UNREACHABLE = Symbol('registry unreachable');

async function readProfileRow(wallet: string): Promise<GlobalProfile | null | typeof UNREACHABLE> {
  return readRegistry<GlobalProfile | null | typeof UNREACHABLE>(
    'profile read',
    async () => {
      const { data, error } = await getPublicServerSupabase()
        .from('profiles')
        .select('*')
        .eq('wallet', wallet.toLowerCase())
        .maybeSingle();
      if (error) throw new Error(`Supabase profile read failed: ${error.message}`);
      return data ? profileFromRow(data as ProfileRow) : null;
    },
    UNREACHABLE
  );
}

export async function getGlobalProfile(wallet: string): Promise<GlobalProfile | null> {
  if (!publicSupabaseConfigured()) return null;
  const row = await readProfileRow(wallet);
  return row === UNREACHABLE ? null : row;
}

export async function getActivityHistory(wallet: string, limit = 50): Promise<ActivityItem[]> {
  if (!publicSupabaseConfigured()) return [];
  return readRegistry<ActivityItem[]>(
    'activity read',
    async () => {
      const { data, error } = await getPublicServerSupabase()
        .from('activity_history')
        .select('id,wallet,event_type,source,amount,asset_symbol,tx_hash,metadata,created_at')
        .eq('wallet', wallet.toLowerCase())
        .order('created_at', { ascending: false })
        .limit(Math.max(1, Math.min(100, limit)));
      if (error) throw new Error(`Supabase activity read failed: ${error.message}`);
      return (data ?? []).map((row) => activityFromRow(row));
    },
    []
  );
}

export async function recordActivity(
  wallet: string,
  eventType: string,
  details: {
    source?: ActivityItem['source'];
    amount?: number;
    assetSymbol?: string;
    txHash?: string;
    idempotencyKey?: string;
    metadata?: Record<string, unknown>;
  } = {}
) {
  if (!supabaseConfigured()) return;
  await touchGlobalProfile(wallet);
  const { error } = await getServerSupabase().from('activity_history').insert({
    wallet: wallet.toLowerCase(),
    event_type: eventType,
    source: details.source ?? 'app',
    amount: details.amount ?? null,
    asset_symbol: details.assetSymbol ?? null,
    tx_hash: details.txHash ?? null,
    idempotency_key: details.idempotencyKey ?? null,
    metadata: details.metadata ?? {},
  });
  if (error && error.code !== '23505') {
    throw new Error(`Supabase activity write failed: ${error.message}`);
  }
}

export async function globalLeaderboard(metric: LeaderboardMetric) {
  if (!publicSupabaseConfigured()) return null;
  const column =
    metric === 'total_produced'
      ? 'total_produced'
      : metric === 'total_burned'
        ? 'total_burned'
        : 'compound_level';
  // Null on failure, which is the same signal as "not configured" — and the
  // signal the leaderboard route already falls back on, to the local game
  // database. See readRegistry: this route is the Railway healthcheck.
  return readRegistry(
    'leaderboard read',
    async () => {
      const { data, error } = await getPublicServerSupabase()
        .from('profiles')
        .select('*')
        .order(column, { ascending: false })
        .order('last_seen_at', { ascending: false })
        .limit(100);
      if (error) throw new Error(`Supabase leaderboard read failed: ${error.message}`);
      return (data ?? []).map((raw, index) => {
        const row = profileFromRow(raw as ProfileRow);
        return {
          rank: index + 1,
          wallet: row.wallet,
          displayName: row.displayName,
          avatarUrl: row.avatarUrl,
          online: row.online,
          compoundLevel: row.compoundLevel,
          maxLevel: row.maxNodeLevel,
          sumLevel: row.sumNodeLevels,
          nodes: row.nodeCount,
          productionRate: row.productionRate,
          totalProduced: row.totalProduced,
          totalBurned: row.totalBurned,
        };
      });
    },
    null
  );
}

/**
 * The profile screen's whole payload, including whether the registry is usable.
 *
 * `configured` means USABLE RIGHT NOW, not "the variables are set". Both callers
 * — /start and /app/profile — treat it as the question "can I save a fund name
 * to the server, or should I keep it in this browser", and a registry that is
 * configured but unreachable answers that question exactly the same way an
 * unconfigured one does.
 *
 * That distinction is load-bearing for a brand-new player. /start blocks on this
 * call before it will let anyone name a fund, so a registry that errored instead
 * of degrading left the very first screen of the game showing "Could not check
 * fund profile" with no way past it — a paused database, and nobody can start.
 *
 * `degraded` carries the difference the UI needs for its wording: never
 * configured is a setup state, configured-but-down is an outage, and telling a
 * player the second is the first sends them looking for a settings page.
 */
export async function profileBundle(wallet: string) {
  const configured = publicSupabaseConfigured();
  if (!configured) return { configured: false, degraded: false, profile: null, history: [] };

  const row = await readProfileRow(wallet);
  if (row === UNREACHABLE) {
    return { configured: false, degraded: true, profile: null, history: [] };
  }
  return {
    configured: true,
    degraded: false,
    profile: row,
    history: row ? await getActivityHistory(wallet) : [],
  };
}

export async function linkPrivyIdentity(identity: {
  userId: string;
  wallet: string;
  walletId: string | null;
  walletClientType: string;
}) {
  if (!supabaseConfigured()) return;
  await touchGlobalProfile(identity.wallet);
  const { error } = await getServerSupabase().from('privy_identities').upsert(
    {
      privy_user_id: identity.userId,
      wallet: identity.wallet.toLowerCase(),
      privy_wallet_id: identity.walletId,
      wallet_client_type: identity.walletClientType,
      last_authenticated_at: new Date().toISOString(),
    },
    { onConflict: 'privy_user_id' }
  );
  if (error) throw new Error(`Supabase Privy identity sync failed: ${error.message}`);
}

/**
 * Player-editable identity fields — the only profile columns a player may
 * write. Everything else on the row is a projection of game state and is
 * owned by the sync path, so this update deliberately cannot touch it.
 *
 * The display name mirrors the DB constraint (2-28 chars) so the caller gets
 * a readable error instead of a check-violation string; the constraint stays
 * as the backstop.
 */
export async function updateProfileIdentity(
  wallet: string,
  fields: { displayName?: string | null; avatarUrl?: string | null }
): Promise<GlobalProfile> {
  if (!supabaseConfigured()) throw new Error('profile database is not configured');

  const patch: Record<string, string | null> = {};
  if (fields.displayName !== undefined) {
    const name = fields.displayName?.trim() || null;
    if (name != null) {
      if (name.length < 2 || name.length > 28) {
        throw new Error('display name must be 2-28 characters');
      }
      // Printable, no control characters; the game renders these everywhere.
      if (!/^[\p{L}\p{N}\p{P}\p{S} ]+$/u.test(name)) {
        throw new Error('display name contains unsupported characters');
      }
    }
    patch.display_name = name;
  }
  if (fields.avatarUrl !== undefined) patch.avatar_url = fields.avatarUrl;
  if (Object.keys(patch).length === 0) throw new Error('nothing to update');

  // The session sync creates the row on first sign-in, so a missing row means
  // the wallet has never authenticated — reject rather than invent a profile.
  const { data, error } = await getServerSupabase()
    .from('profiles')
    .update(patch)
    .eq('wallet', wallet.toLowerCase())
    .select('*')
    .maybeSingle();
  if (error) throw new Error(`profile update failed: ${error.message}`);
  if (!data) throw new Error('profile not found — sign in once before editing it');
  return profileFromRow(data as ProfileRow);
}

/**
 * Store an avatar image and point the profile at it.
 *
 * One object per wallet (`<wallet>.<ext>`, upsert) so re-uploads replace the
 * old file instead of accumulating orphans. The public bucket URL is written
 * to the profile row, which is what every reader actually uses.
 */
export async function saveAvatar(
  wallet: string,
  bytes: Uint8Array,
  contentType: string
): Promise<GlobalProfile> {
  if (!supabaseConfigured()) throw new Error('profile database is not configured');
  const ext = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
  const path = `${wallet.toLowerCase()}.${ext}`;
  const supabase = getServerSupabase();

  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(path, bytes, { contentType, upsert: true });
  if (uploadError) throw new Error(`avatar upload failed: ${uploadError.message}`);

  const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
  // Cache-bust: the path is stable across re-uploads, so browsers would keep
  // showing the old image forever without a version marker.
  const url = `${pub.publicUrl}?v=${Date.now()}`;
  return updateProfileIdentity(wallet, { avatarUrl: url });
}
