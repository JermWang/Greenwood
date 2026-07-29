// Wallet authentication by signature, replacing Privy.
//
// The only thing the server needs to know is "does this caller control this
// address", and an address can answer that itself: the server issues a nonce,
// the wallet signs a message containing it, and the signature is checked
// against the claimed address. No third party sits in the middle, and there is
// no account to be linked to, expire, or be rate-limited by someone else.
//
// WHY A NONCE AND NOT JUST A SIGNATURE. A bare "sign this fixed string" is
// replayable forever: anyone who ever sees the signature — a proxy log, a
// browser extension, a shared screenshot — can authenticate as that wallet
// until the end of time. The nonce makes each signature good exactly once, and
// it is consumed on use rather than merely checked, so two racing requests
// cannot both spend it.
//
// WHY THE MESSAGE NAMES THE DOMAIN AND CHAIN. Without them the same signature
// authenticates on any site that asks for the same text — a phishing page can
// collect a signature "for Greenwood" and replay it here. The wallet shows the
// user what they are signing, so the domain has to be in the text they see.
//
// SESSIONS LIVE IN SQLITE, not in a signed cookie, for the reason CLAUDE.md
// already records about module state: a stateless token cannot be revoked, and
// the one thing an operator needs during an incident is the ability to end a
// session that is doing damage. A row can be deleted.

import { getDb } from './db';
import { GameError } from './errors';

// Re-exported so server code can keep importing it from here, while the actual
// definition lives in an import-free module the client can also use without
// pulling node:sqlite into the browser bundle.
export { signInMessage } from './siwe-message';

/** How long a session lasts before the wallet has to sign again. */
export const SESSION_TTL_MS = Number(process.env.OSR_SESSION_TTL_MS ?? 7 * 24 * 3600 * 1000);

/** How long an unused nonce stays valid. Short: it is used within seconds. */
export const NONCE_TTL_MS = 10 * 60 * 1000;

export const SESSION_COOKIE = 'gw_session';

function ensureTables() {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS auth_nonces (
      nonce TEXT PRIMARY KEY,
      wallet TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS auth_sessions (
      token TEXT PRIMARY KEY,
      wallet TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      last_seen INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_auth_sessions_wallet ON auth_sessions(wallet);
  `);
}

/**
 * 32 bytes of CSPRNG, hex.
 *
 * Math.random is not acceptable for either of these values: a guessable nonce
 * lets an attacker pre-collect a signature, and a guessable session token IS
 * the session.
 */
function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Issue a nonce for a wallet to sign. */
export function issueNonce(wallet: string): string {
  ensureTables();
  const nonce = randomToken();
  const now = Date.now();
  const db = getDb();
  db.prepare('INSERT INTO auth_nonces (nonce, wallet, created_at) VALUES (?,?,?)').run(
    nonce,
    wallet.toLowerCase(),
    now
  );
  // Opportunistic cleanup; nonces are tiny but there is one per sign-in attempt.
  db.prepare('DELETE FROM auth_nonces WHERE created_at < ?').run(now - NONCE_TTL_MS);
  return nonce;
}

/**
 * Spend a nonce. Returns false if it was never issued, already used, or stale.
 *
 * The DELETE is the check: it reports how many rows it removed, so whichever
 * concurrent request deletes the row wins and the loser sees zero. Reading then
 * deleting would let two requests both pass on the same nonce.
 */
export function consumeNonce(wallet: string, nonce: string): boolean {
  ensureTables();
  const result = getDb()
    .prepare('DELETE FROM auth_nonces WHERE nonce = ? AND wallet = ? AND created_at >= ?')
    .run(nonce, wallet.toLowerCase(), Date.now() - NONCE_TTL_MS);
  return Number(result.changes ?? 0) > 0;
}

export function createSession(wallet: string): { token: string; expiresAt: number } {
  ensureTables();
  const token = randomToken();
  const now = Date.now();
  const expiresAt = now + SESSION_TTL_MS;
  getDb()
    .prepare('INSERT INTO auth_sessions (token, wallet, created_at, expires_at, last_seen) VALUES (?,?,?,?,?)')
    .run(token, wallet.toLowerCase(), now, expiresAt, now);
  return { token, expiresAt };
}

/**
 * The wallet behind a session token, or null.
 *
 * Expired rows are deleted on sight rather than merely ignored, so an abandoned
 * session stops being a row that could be resurrected by a clock change.
 */
export function walletForSession(token: string | null | undefined): string | null {
  if (!token) return null;
  ensureTables();
  const db = getDb();
  const row = db.prepare('SELECT wallet, expires_at FROM auth_sessions WHERE token = ?').get(token) as
    | { wallet: string; expires_at: number }
    | undefined;
  if (!row) return null;
  if (row.expires_at <= Date.now()) {
    db.prepare('DELETE FROM auth_sessions WHERE token = ?').run(token);
    return null;
  }
  db.prepare('UPDATE auth_sessions SET last_seen = ? WHERE token = ?').run(Date.now(), token);
  return row.wallet;
}

export function endSession(token: string | null | undefined): void {
  if (!token) return;
  ensureTables();
  getDb().prepare('DELETE FROM auth_sessions WHERE token = ?').run(token);
}

/** Revoke every session for a wallet. The incident-response lever. */
export function endAllSessions(wallet: string): number {
  ensureTables();
  const result = getDb().prepare('DELETE FROM auth_sessions WHERE wallet = ?').run(wallet.toLowerCase());
  return Number(result.changes ?? 0);
}

/** Read the session cookie off a request. */
export function sessionCookie(request: Request): string | null {
  const raw = request.headers.get('cookie');
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith(`${SESSION_COOKIE}=`)) return trimmed.slice(SESSION_COOKIE.length + 1);
  }
  return null;
}

/**
 * Resolve the caller's wallet from their session, and check it is the one they
 * claim to be acting as.
 *
 * The comparison is the entire point. Without it a valid session for wallet A
 * could drive wallet B's fund simply by putting B in the request body — which
 * is exactly the failure the Privy version's linked-account check existed to
 * prevent, and the easiest one to leave out when replacing it.
 */
export function requireSessionWallet(request: Request, claimed: string): string {
  const wallet = walletForSession(sessionCookie(request));
  if (!wallet) throw new GameError('Sign in with your wallet to continue.', 401);
  if (wallet !== claimed.toLowerCase()) {
    throw new GameError('That session belongs to a different wallet.', 403);
  }
  return wallet;
}
