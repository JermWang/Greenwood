// Central app config — Robinhood Chain (EVM, Arbitrum Orbit L2).

export const APP_NAME = 'GPU — Graphics Processing Utility';
export const X_URL = 'https://x.com/GPU_RH';

export const CHAIN = {
  id: 4663,
  hexId: '0x1237',
  name: 'Robinhood Chain',
  rpcUrl: process.env.NEXT_PUBLIC_RH_RPC ?? 'https://rpc.mainnet.chain.robinhood.com',
  explorer: 'https://robinhoodchain.blockscout.com',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
} as const;

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

/**
 * The GPU token, once it exists on Flap, and the protocol treasury wallet that
 * receives spends and pays out claims. There are no application contracts —
 * every action is an ordinary ERC-20 transfer between these two, so these are
 * the only two addresses the app needs.
 */
export const OSR_TOKEN_ADDRESS = process.env.NEXT_PUBLIC_OSR_TOKEN ?? ZERO_ADDRESS;
export const OSR_TREASURY_ADDRESS = process.env.NEXT_PUBLIC_OSR_TREASURY_WALLET ?? ZERO_ADDRESS;
/** On-chain identity required before any browser wallet prompt is allowed. */
export const EXPECTED_TOKEN_SYMBOL = process.env.NEXT_PUBLIC_GPU_TOKEN_SYMBOL ?? 'GPU';

export function isConfiguredAddress(value: string): value is `0x${string}` {
  return /^0x[0-9a-fA-F]{40}$/.test(value) && value.toLowerCase() !== ZERO_ADDRESS;
}

/**
 * Whether the token is live. Gates on-chain UI: balances, explorer links, and
 * the "paid in GPU" framing. Before the token exists the game still plays in
 * full against the mirrored balance — this only decides what the UI claims.
 *
 * Deliberately mirrors the server's SETTLEMENT_CONFIGURED so the two cannot
 * disagree about whether transactions are real.
 */
export const TOKEN_LIVE =
  isConfiguredAddress(OSR_TOKEN_ADDRESS) && isConfiguredAddress(OSR_TREASURY_ADDRESS);

export const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? '';
export const PRIVY_CLIENT_ID = process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID ?? '';
export const PRIVY_CONFIGURED = PRIVY_APP_ID.length > 0;
