import { NextResponse } from 'next/server';
import { TOKEN_LIVE } from '@/lib/config';
import { getDb } from '@/lib/db';
import { writeSnapshot, backupsSupported } from '@/lib/backup';
import { resetGameState, resetTargets } from '@/lib/reset';
import { clearGlobalRegistry } from '@/lib/profiles';
import { publicSupabaseConfigured } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * Wipe all game state and restart the emission clock, for a relaunch.
 *
 * This destroys every player's desks, instruments, allocations, listings,
 * levels and balances and cannot be undone, so it is deliberately awkward to
 * trigger: it needs the admin token AND an exact confirmation phrase in the
 * body. The token alone is not enough, because a wipe fired by accident on a
 * live game is unrecoverable in a way the deploy-notice endpoint's mistakes
 * are not.
 *
 * WHAT gets wiped is no longer decided here. lib/reset reads the schema and
 * empties everything it is not explicitly told to spare, because the list that
 * used to live in this file went stale and left twelve tables standing — see
 * the header there. This route owns the GUARDS; that module owns the wipe.
 */
const CONFIRM = 'WIPE-ALL-GAME-STATE';

export async function POST(request: Request) {
  const secret = (process.env.OSR_ADMIN_TOKEN ?? '').trim();
  if (!secret) {
    return NextResponse.json({ error: 'OSR_ADMIN_TOKEN is not configured' }, { status: 503 });
  }
  if ((request.headers.get('authorization') ?? '') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  /*
   * A dry run, so the irreversible thing can be inspected before it is done.
   *
   * DELIBERATELY ABOVE THE TOKEN GUARD, and that ordering is the point. It
   * reads and changes nothing, and the moment somebody most needs to see what a
   * wipe would take is while planning a relaunch — which is exactly when the
   * game is still live and the guard below is still refusing. A dry run that
   * only works once it is too late to plan is not a dry run.
   *
   * It calls the same resetTargets the wipe calls, rather than describing the
   * behaviour in prose that could drift from it.
   */
  if (body.dryRun === true) {
    const { wipe, keep } = resetTargets(getDb());
    const rows: Record<string, number> = {};
    for (const table of [...wipe, ...keep]) {
      try {
        rows[table] = Number(
          (getDb().prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get() as { n: number }).n
        );
      } catch {
        rows[table] = -1;
      }
    }
    return NextResponse.json({
      dryRun: true,
      /** What the guard below would say if this were the real thing. */
      wouldBeRefused: TOKEN_LIVE && process.env.OSR_ALLOW_RESET !== 'yes-wipe-a-live-game',
      tokenLive: TOKEN_LIVE,
      rows,
      wouldWipe: wipe,
      wouldKeep: keep,
      wouldClearRegistry:
        body.keepRegistry === true ? [] : ['activity_history', 'profiles', 'privy_identities'],
      backupsSupported: backupsSupported(),
    });
  }

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
   *
   * A RELAUNCH IS THE ONE TIME THIS GATE IS IN THE WAY ON PURPOSE. The correct
   * sequence is to unset the old token address FIRST, wipe, then configure the
   * new one -- which passes this gate honestly, because between those two steps
   * the game genuinely holds no real value. Setting the override while the old
   * token is still live means wiping balances that are still redeemable.
   */
  if (TOKEN_LIVE && process.env.OSR_ALLOW_RESET !== 'yes-wipe-a-live-game') {
    return NextResponse.json(
      {
        error:
          'refused: the token is live, so this would wipe a game holding real value. ' +
          'For a relaunch, clear NEXT_PUBLIC_OSR_TOKEN first and wipe before pointing at ' +
          'the new one. Set OSR_ALLOW_RESET=yes-wipe-a-live-game only if wiping a live ' +
          'game is genuinely the intent.',
      },
      { status: 403 }
    );
  }

  if (body.confirm !== CONFIRM) {
    return NextResponse.json(
      { error: `refused: set confirm to "${CONFIRM}" to wipe all game state` },
      { status: 400 }
    );
  }

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

  let report;
  try {
    report = resetGameState(getDb(), Number(body.genesisMs ?? Date.now()));
  } catch (e) {
    console.error('[admin/reset] wipe failed', e);
    return NextResponse.json({ error: 'wipe failed', backup }, { status: 500 });
  }

  /*
   * The registry goes with it, unless asked otherwise.
   *
   * Clearing by default is the same argument as the inverted table list: a wipe
   * that leaves 235 profiles standing produces a fresh world with a populated
   * leaderboard, which is the half-done state this whole change exists to stop.
   *
   * A failure here does NOT fail the request. The game is already wiped by this
   * point and reporting a 500 would suggest otherwise; the operator needs to
   * know the local half succeeded and the remote half needs retrying, so the
   * error is returned as data.
   */
  let registry: Record<string, number> | null = null;
  let registryError: string | null = null;
  if (body.keepRegistry === true) {
    registryError = 'skipped: keepRegistry was set';
  } else if (!publicSupabaseConfigured()) {
    registryError = 'skipped: Supabase is not configured on this server';
  } else {
    try {
      registry = await clearGlobalRegistry();
    } catch (error) {
      registryError = String(error);
      console.error('[admin/reset] registry clear failed', error);
    }
  }

  return NextResponse.json({
    wiped: true,
    before: report.before,
    after: report.after,
    tablesWiped: report.wiped,
    tablesKept: report.kept,
    registry,
    registryError,
    genesisMs: report.genesisMs,
    genesisIso: new Date(report.genesisMs).toISOString(),
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
