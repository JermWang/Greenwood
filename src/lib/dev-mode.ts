// Local development without a wallet.
//
// Signing in through Privy on every reload is friction that has nothing to do
// with building the game, and most of the game — the floor, the rooms, the
// shop, the desks — has nothing to do with wallets either. This lets a developer
// run the whole app as a fixed local account.
//
// It is a HOLE IN AUTHENTICATION, so it is built to be impossible to leave open
// by accident. Three conditions must all hold:
//
//   1. NEXT_PUBLIC_OSR_DEV_WALLET is set to an address.
//   2. NODE_ENV is not 'production' — a production build can never honour it,
//      whatever the environment says.
//   3. No deployment marker is present. Railway and Vercel both announce
//      themselves, and a dev-mode build pushed to either is a mistake rather
//      than an intention.
//
// The variable is NEXT_PUBLIC_ because both halves need it: the server skips
// Privy verification, and the client needs an address to put in the store. Those
// two must agree, and reading one name in both places is what guarantees they
// do — a server-only flag would leave the UI still asking you to connect.
//
// Turn it on in .env.local:
//
//   NEXT_PUBLIC_OSR_DEV_WALLET=0x7a3b9c1d4e5f60718293a4b5c6d7e8f901234567
//
// and delete the line to get authentication back.
//
// Use an ordinary-looking address, not a memorable one. The first value tried
// here was mostly zeros with "de401" on the end, and the Supabase profile sync
// rejected it as an invalid address — which surfaced as an intermittent 500 on
// /api/user/[wallet]/operation and a dashboard stuck on "synchronizing" with
// nothing in the browser console to explain it.

/** Anything set here means we are running somewhere real. */
function isDeployed(): boolean {
  return Boolean(
    process.env.VERCEL ||
      process.env.RAILWAY_ENVIRONMENT ||
      process.env.RAILWAY_VOLUME_MOUNT_PATH
  );
}

const configured = (process.env.NEXT_PUBLIC_OSR_DEV_WALLET ?? '').trim().toLowerCase();

/**
 * The address every request is treated as, or null when the bypass is off.
 *
 * Validated as an address rather than trusted: a typo'd value would otherwise
 * become a wallet id that half the game accepts and the EVM helpers reject, and
 * the resulting errors would point anywhere but here.
 */
export const DEV_WALLET: string | null =
  configured && /^0x[0-9a-f]{40}$/.test(configured) && process.env.NODE_ENV !== 'production' && !isDeployed()
    ? configured
    : null;

/** True when requests should skip Privy and be attributed to DEV_WALLET. */
export const DEV_WALLET_BYPASS = DEV_WALLET !== null;

/**
 * Why the configured value was refused, for a startup warning.
 *
 * Silence would be worse than either outcome: a developer who set the variable
 * and still sees a login screen needs to know whether it was the format, the
 * build mode, or the environment that rejected it.
 */
export function devWalletRejection(): string | null {
  if (!configured || DEV_WALLET_BYPASS) return null;
  if (!/^0x[0-9a-f]{40}$/.test(configured)) {
    return `NEXT_PUBLIC_OSR_DEV_WALLET is not a 0x-prefixed 40-hex-digit address: ${configured}`;
  }
  if (process.env.NODE_ENV === 'production') {
    return 'NEXT_PUBLIC_OSR_DEV_WALLET is ignored in a production build.';
  }
  return 'NEXT_PUBLIC_OSR_DEV_WALLET is ignored on a deployed environment.';
}
