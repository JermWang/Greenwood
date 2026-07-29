import { NextResponse } from 'next/server';
import { TOKEN_LIVE } from '@/lib/config';
import { getDb, setProtocolValue } from '@/lib/db';
import { writeSnapshot, backupsSupported } from '@/lib/backup';

export const dynamic = 'force-dynamic';

/**
 * Wipe all game state and restart the emission clock. Used to clear test data
 * before a real launch.
 *
 * This destroys every player's nodes, components, crates, listings and balances
 * and cannot be undone, so it is deliberately awkward to trigger: it needs the
 * admin token AND an exact confirmation phrase in the body. The token alone is
 * not enough, because a wipe fired by accident on a live game is unrecoverable
 * in a way the deploy-notice endpoint's mistakes are not.
 *
 * genesisMs is rewritten rather than deleted. The halving curve is measured
 * from it, so a reset that left the old value would launch the game already
 * part-way down the emission schedule — day one would pay out at a rate meant
 * for a network weeks old.
 */
const CONFIRM = 'WIPE-ALL-GAME-STATE';

/** Every table holding player or protocol state. Order avoids FK complaints. */
const TABLES = [
  'listings',
  'crates',
  'components',
  'nodes',
  'floor_layouts',
  'stakes',
  'ledger',
  'settlements',
  'idempotency',
  'users',
] as const;

/** Protocol counters that must return to zero alongside the tables. */
const COUNTERS = ['burned', 'reserve', 'treasury', 'emitted', 'solRevenue'] as const;

export async function POST(request: Request) {
  /*
   * Unreachable once real money is involved.
   *
   * This wipes every balance, and it was guarded by a shared bearer token and a
   * confirmation phrase -- fine for clearing test data, not remotely enough for
   * a route that can zero every operator's holdings on a live game. A leaked
   * token, a copied curl command out of a chat log, or a staging script pointed
   * at the wrong host all end the same way, and there is no undo.
   *
   * So it is gated on the TOKEN being unconfigured rather than on an
   * environment name: the intent is 'this game has no real money in it yet',
   * and NEXT_PUBLIC_OSR_TOKEN being set is exactly that condition. Explicitly
   * overridable, because there is one legitimate use -- clearing test data off
   * a configured testnet -- and a rule with no escape hatch gets worked around
   * in a worse way.
   */
  if (TOKEN_LIVE && process.env.OSR_ALLOW_RESET !== 'yes-wipe-a-live-game') {
    return NextResponse.json(
      {
        error:
          'refused: the token is live, so this would wipe a game holding real value. ' +
          'Set OSR_ALLOW_RESET=yes-wipe-a-live-game if that is genuinely the intent.',
      },
      { status: 403 }
    );
  }

  const secret = (process.env.OSR_ADMIN_TOKEN ?? '').trim();
  if (!secret) {
    return NextResponse.json({ error: 'OSR_ADMIN_TOKEN is not configured' }, { status: 503 });
  }
  if ((request.headers.get('authorization') ?? '') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if (body.confirm !== CONFIRM) {
    return NextResponse.json(
      { error: `refused: set confirm to "${CONFIRM}" to wipe all game state` },
      { status: 400 }
    );
  }

  const db = getDb();
  const before: Record<string, number> = {};
  const after: Record<string, number> = {};
  const count = (t: string) => {
    try {
      return Number((db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n);
    } catch {
      return -1; // table absent on an older schema
    }
  };

  for (const t of TABLES) before[t] = count(t);

  /*
   * Snapshot first. This is the single most predictable moment in the app's
   * life at which somebody will wish they had a backup, and it costs one
   * VACUUM INTO against a database that is about to be emptied anyway.
   *
   * A failure here ABORTS the wipe rather than being swallowed the way
   * maybeSnapshot swallows its own errors. The tradeoff runs the other way for
   * an irreversible destructive action: refusing to wipe is recoverable,
   * wiping without a backup is not.
   */
  let backup: string | null = null;
  if (backupsSupported()) {
    try {
      backup = writeSnapshot().file;
    } catch (error) {
      return NextResponse.json(
        { error: `refused: could not take a pre-wipe snapshot (${String(error)})` },
        { status: 500 }
      );
    }
  }

  db.exec('BEGIN IMMEDIATE');
  try {
    for (const t of TABLES) {
      try {
        db.exec(`DELETE FROM ${t}`);
      } catch {
        /* table absent — nothing to clear */
      }
    }
    // Reclaim the autoincrement sequences so a fresh game starts at id 1
    // rather than continuing the test run's numbering.
    try {
      db.exec('DELETE FROM sqlite_sequence');
    } catch {
      /* no sequence table if nothing ever autoincremented */
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    console.error('[admin/reset] wipe failed', e);
    return NextResponse.json({ error: 'wipe failed' }, { status: 500 });
  }

  for (const c of COUNTERS) setProtocolValue(c, '0');
  // Clear per-day crate budgets so the first real day starts with a full one.
  try {
    db.exec("DELETE FROM protocol WHERE key LIKE 'crates_found_day_%'");
  } catch {
    /* nothing recorded yet */
  }

  const genesisMs = Number(body.genesisMs ?? Date.now());
  setProtocolValue('genesisMs', String(genesisMs));

  for (const t of TABLES) after[t] = count(t);

  return NextResponse.json({
    wiped: true,
    before,
    after,
    genesisMs,
    genesisIso: new Date(genesisMs).toISOString(),
    /**
     * The snapshot taken immediately before the wipe.
     *
     * Returned rather than merely logged, because the moment somebody needs
     * this filename is the moment they have just realised they should not have
     * run this, and hunting for it through logs is time spent badly.
     */
    backup,
  });
}
