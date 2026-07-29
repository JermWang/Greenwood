// Server-side enforcement of the deploy window.
//
// A release is announced by opening a deploy-notice window (see the POST handler
// in src/app/api/status/route.ts and scripts/announce-deploy.mjs). The client
// shows a countdown banner and refuses to start actions while it is open, but
// that is advisory — a stale tab, a second client, or a direct API call would
// sail past it. This is the same window read on the server so the refusal is
// real.
//
// The point is to never START something that a cutover could cut in half: a spend
// puts BNTY on-chain before the server records it, so a process dying between
// those two steps costs the operator real tokens. COMPLETING an already-paid
// action is the opposite — it is what rescues those tokens — so settling an
// existing payment is deliberately NOT blocked.

import { getProtocolValue } from './db';
import { GameError } from './game';

const NOTICE_KEY = 'deploy_notice_until';

/** Whether an announced deploy window is currently open. */
export function deployWindowActive(): boolean {
  const until = Number(getProtocolValue(NOTICE_KEY) ?? '0');
  return Number.isFinite(until) && until > Date.now();
}

/**
 * Refuse to start a mutating action while a deploy is rolling out. 503 so the
 * client treats it as a transient "try again shortly", matching the banner.
 */
export function requireNoActiveDeploy(): void {
  if (deployWindowActive()) {
    throw new GameError('Server update in progress — try again in a moment', 503);
  }
}
