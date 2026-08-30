// Central app config — Robinhood Chain (EVM, Arbitrum Orbit L2).

export const APP_NAME = 'Evergreen — Real-World Yield';
export const X_URL = 'https://x.com/evergreen_rh';
/**
 * The same account as an @handle, for the Twitter card tags in app/layout.
 *
 * Derived here rather than written out twice. The two were separate literals
 * and were already inconsistent — the link went one place and the share card
 * credited another — which is invisible until somebody posts the game and the
 * card attributes it to an account that does not exist.
 */
export const X_HANDLE = `@${X_URL.split('/').pop()}`;

/**
 * Which network this build talks to. Mainnet unless told otherwise.
 *
 * The id used to be a hardcoded 4663 while only the RPC came from the
 * environment, which meant the app could not be pointed at anything but
 * mainnet — and therefore that the entire settlement stack had no way of being
 * exercised short of real money. That is a bad property for the one subsystem
 * that moves tokens.
 *
 * The id and the RPC must move TOGETHER. Every wallet prompt goes through
 * switchChain(CHAIN.id), so an id that disagrees with the RPC has an operator
 * signing a transfer for one network while the server verifies it on another.
 * Hence one variable, not two: NEXT_PUBLIC_RH_NETWORK picks a whole entry from
 * the table below, and a network nobody named is mainnet.
 *
 * Robinhood Chain testnet is chain 46630 (0xb626).
 */
const NETWORKS = {
  mainnet: {
    id: 4663,
    hexId: '0x1237',
    name: 'Robinhood Chain',
    defaultRpc: 'https://rpc.mainnet.chain.robinhood.com',
    explorer: 'https://robinhoodchain.blockscout.com',
  },
  testnet: {
    id: 46630,
    hexId: '0xb626',
    name: 'Robinhood Chain Testnet',
    defaultRpc: 'https://rpc.testnet.chain.robinhood.com',
    explorer: 'https://robinhoodchain.blockscout.com',
  },
} as const;

export type NetworkName = keyof typeof NETWORKS;

/**
 * Unrecognised names fall back to mainnet rather than throwing.
 *
 * The failure this avoids is a typo in a production environment variable
 * taking the whole app down on boot. Mainnet is also the only value that is
 * never a surprise: a build that quietly ran on testnet would settle real
 * spends against valueless tokens, which is far worse than one that ignored a
 * misspelled override.
 */
const SELECTED: NetworkName =
  (process.env.NEXT_PUBLIC_RH_NETWORK ?? '').trim().toLowerCase() === 'testnet' ? 'testnet' : 'mainnet';

const NETWORK = NETWORKS[SELECTED];

export const CHAIN = {
  id: NETWORK.id,
  hexId: NETWORK.hexId,
  name: NETWORK.name,
  /** An explicit RPC still wins, so a private or local node can be pointed at. */
  rpcUrl: process.env.NEXT_PUBLIC_RH_RPC ?? NETWORK.defaultRpc,
  explorer: NETWORK.explorer,
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
} as const;

/** True on anything that is not Robinhood Chain mainnet. */
export const IS_MAINNET = SELECTED === 'mainnet';

/**
 * A network's raw entry, so the table can be checked rather than trusted.
 *
 * CHAIN only ever exposes the SELECTED network, which means a wrong id on the
 * entry that is not selected would sit there undetected until the day someone
 * switched to it — and the first symptom would be operators signing for the
 * wrong chain. This is what lets a test read both.
 */
export function networkEntry(name: NetworkName) {
  return NETWORKS[name];
}

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

/**
 * The GREEN token, once it exists on Flap, and the protocol treasury wallet that
 * receives spends and pays out claims. There are no application contracts —
 * every action is an ordinary ERC-20 transfer between these two, so these are
 * the only two addresses the app needs.
 */
export const GREEN_TOKEN_ADDRESS = process.env.NEXT_PUBLIC_OSR_TOKEN ?? ZERO_ADDRESS;
export const GREEN_TREASURY_ADDRESS = process.env.NEXT_PUBLIC_OSR_TREASURY_WALLET ?? ZERO_ADDRESS;
/**
 * On-chain identity required before any browser wallet prompt is allowed.
 *
 * STILL 'BNTY', AND THAT IS NOT A MISSED RENAME. The ticker the game shows is
 * GREEN, but this value is not branding — settlement-client reads symbol() off
 * the deployed contract and refuses to build a transfer if the two disagree.
 * The token at NEXT_PUBLIC_OSR_TOKEN reports symbol "BNTY" and name
 * "Greenwood", both immutable, so pointing this at GREEN would not rename
 * anything: it would block every on-chain transaction in the game.
 *
 * It moves when a new token is deployed, in lockstep with the address, and not
 * before. Same reasoning that keeps the OSR_* env vars and osr_* columns where
 * they are (CLAUDE.md) — a name that something outside this codebase already
 * agreed to is not ours to change unilaterally.
 */
export const EXPECTED_TOKEN_SYMBOL = process.env.NEXT_PUBLIC_GPU_TOKEN_SYMBOL ?? 'BNTY';

export function isConfiguredAddress(value: string): value is `0x${string}` {
  return /^0x[0-9a-fA-F]{40}$/.test(value) && value.toLowerCase() !== ZERO_ADDRESS;
}

/**
 * Whether the token is live. Gates on-chain UI: balances, explorer links, and
 * the "paid in GREEN" framing. Before the token exists the game still plays in
 * full against the mirrored balance — this only decides what the UI claims.
 *
 * Deliberately mirrors the server's SETTLEMENT_CONFIGURED so the two cannot
 * disagree about whether transactions are real.
 */
export const TOKEN_LIVE =
  isConfiguredAddress(GREEN_TOKEN_ADDRESS) && isConfiguredAddress(GREEN_TREASURY_ADDRESS);

