// Spending crafted parts on things that are not crafted.
//
// Deliberately its own module rather than living in lib/craft, and the reason is
// structural: game.ts needs to charge a desk in frames, lib/craft reaches
// lib/expedition for pack contents, and lib/expedition reaches back toward the
// game. Putting the spend here — where the only imports are the database and the
// error type — keeps that cycle from existing at all.
//
// It reads pack_contents directly for the same reason. A material is a stack
// like any other and the allowlist that matters (CARRIABLE) governs what may be
// PUT there; taking something out to spend it needs no such permission.

import { getDb } from './db';
import { GameError } from './errors';

/** How many of a crafted part this wallet is carrying. */
export function materialsHeld(wallet: string, ref: string): number {
  const row = getDb()
    .prepare(
      `SELECT COALESCE(SUM(quantity), 0) AS total FROM pack_contents
         WHERE wallet = ? AND ref = ? AND quantity > 0`
    )
    .get(wallet, ref) as unknown as { total: number } | undefined;
  return Number(row?.total ?? 0);
}

/**
 * Take `count` of a material, or refuse without taking any.
 *
 * The UPDATE is conditional on the quantity still being there, which is what
 * makes two requests arriving together safe: exactly one of them can win, and
 * the other is told to try again rather than both succeeding against the same
 * stack. Same guard the tree claim and the craft spend already use.
 *
 * `label` is the player-facing name, because "you need 2 more Desk Frames" is a
 * sentence somebody can act on and "insufficient desk-frame" is not.
 */
export function spendMaterial(wallet: string, ref: string, count: number, label: string): void {
  if (count <= 0) return;

  const have = materialsHeld(wallet, ref);
  if (have < count) {
    throw new GameError(
      `You need ${count} ${label}${count === 1 ? '' : 's'} for this — you have ${have}. Craft ${count - have} more at a bench.`,
      400
    );
  }

  const spent = getDb()
    .prepare(
      `UPDATE pack_contents SET quantity = quantity - ?
         WHERE wallet = ? AND ref = ? AND quantity >= ?`
    )
    .run(count, wallet, ref, count);

  if (Number(spent.changes) === 0) {
    throw new GameError('Your materials changed while that was in flight — try again.', 409);
  }
}
