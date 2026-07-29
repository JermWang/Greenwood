import { NextResponse } from 'next/server';
import { backupsSupported, listSnapshots, verifySnapshot, writeSnapshot, lastSnapshotAt, SNAPSHOT_INTERVAL_MS } from '@/lib/backup';

export const dynamic = 'force-dynamic';

/**
 * Snapshots, on demand.
 *
 * The opportunistic path in lib/backup hangs off real activity, which is the
 * right default and the wrong thing to rely on at the two moments you most want
 * a backup: immediately before a migration, and immediately before a deploy. So
 * this exists to force one, and to let an external scheduler take over if the
 * game is quiet enough that activity-driven snapshots stop happening.
 *
 * Same bearer token as the other admin routes. That is thin for something this
 * important and is called out in the launch notes; it is at least not weaker
 * than what guards the wipe endpoint.
 */
function authorised(request: Request): NextResponse | null {
  const secret = (process.env.OSR_ADMIN_TOKEN ?? '').trim();
  if (!secret) return NextResponse.json({ error: 'OSR_ADMIN_TOKEN is not configured' }, { status: 503 });
  if ((request.headers.get('authorization') ?? '') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return null;
}

/**
 * What backups exist, and whether the newest one is actually restorable.
 *
 * The newest is re-verified on every read rather than trusted from when it was
 * written, because the interesting failure is bit-rot or a half-full volume
 * AFTER the fact. A list that only reports filenames answers "did a backup
 * run", which is not the question anybody is asking when they open this.
 */
export async function GET(request: Request) {
  const denied = authorised(request);
  if (denied) return denied;

  if (!backupsSupported()) {
    return NextResponse.json({ supported: false, reason: 'this host has no durable data directory' });
  }

  const snapshots = listSnapshots();
  const newest = snapshots[0] ?? null;
  const age = lastSnapshotAt() ? Date.now() - lastSnapshotAt() : null;

  return NextResponse.json({
    supported: true,
    count: snapshots.length,
    lastSnapshotAt: lastSnapshotAt() || null,
    ageMs: age,
    /** True when the newest snapshot is older than the interval promises. */
    overdue: age == null || age > SNAPSHOT_INTERVAL_MS,
    newest: newest && { file: newest.file, bytes: newest.bytes, takenAt: newest.takenAt, ...verifySnapshot(newest.path) },
    snapshots: snapshots.map((s) => ({ file: s.file, bytes: s.bytes, takenAt: s.takenAt })),
  });
}

/** Force one now. Verified before it is kept — see writeSnapshot. */
export async function POST(request: Request) {
  const denied = authorised(request);
  if (denied) return denied;

  if (!backupsSupported()) {
    return NextResponse.json({ error: 'this host has no durable data directory' }, { status: 503 });
  }

  try {
    const snapshot = writeSnapshot();
    return NextResponse.json({ ok: true, snapshot: { file: snapshot.file, bytes: snapshot.bytes, takenAt: snapshot.takenAt } });
  } catch (error) {
    // Loud on this route, unlike maybeSnapshot: somebody asked for a backup and
    // has to be told they did not get one.
    console.error('[admin/backup]', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
