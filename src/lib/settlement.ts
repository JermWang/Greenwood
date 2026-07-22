// On-chain settlement via plain ERC-20 transfers — no custom contracts.
//
// SPENDS (mint, upgrade, crate, compound, expedite):
//   1. QUOTE   the server prices the action, records a settlement row, and
//              returns payment instructions (token, treasury address, amount).
//   2. PAY     the operator sends that many OSR to the treasury wallet — an
//              ordinary ERC-20 transfer signed in their own wallet.
//   3. SETTLE  the operator hands back the tx hash. The server reads the
//              receipt, verifies the token's Transfer event really moved the
//              quoted amount from them to the treasury, and only then applies
//              the game-state change.
//
// PAYOUTS (claim): the server sends OSR from the protocol wallet to the player.
// That wallet is a Privy server wallet, so signing happens inside Privy via the
// app secret — no private key is ever stored by this app.
//
// The server picks the price but cannot fabricate the payment: every spend is a
// real token transfer proven by a mined Transfer event, and each tx hash can
// back exactly one settlement.

import { createPublicClient, http, decodeEventLog, parseAbi, encodeFunctionData, erc20Abi, type Hex } from 'viem';
import { getDb } from './db';
import { GameError } from './game';
import { CHAIN, OSR_TOKEN_ADDRESS, isConfiguredAddress } from './config';

export type SettlementAction =
  | 'MintNode'
  | 'UpgradeNode'
  | 'OpenCrate'
  | 'UpgradeCompound'
  | 'ExpediteCompound'
  | 'Claim'
  | 'MarketBuy'
  | 'StakeOpen';

const TRANSFER_ABI = parseAbi([
  'event Transfer(address indexed from, address indexed to, uint256 value)',
]);

const TREASURY = (process.env.NEXT_PUBLIC_OSR_TREASURY_WALLET ?? '').trim();
const TREASURY_WALLET_ID = (process.env.OSR_TREASURY_WALLET_ID ?? '').trim();
const PRIVY_APP_ID = (process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? '').trim();
const PRIVY_APP_SECRET = (process.env.PRIVY_APP_SECRET ?? '').trim();

/** Confirmations required before a spend is credited. */
export const MIN_CONFIRMATIONS = Number(process.env.OSR_MIN_CONFIRMATIONS ?? 2);
/** How long a quote stays payable. Short, so a stale price cannot be settled. */
const QUOTE_TTL_SECONDS = 15 * 60;

export const SETTLEMENT_CONFIGURED =
  isConfiguredAddress(OSR_TOKEN_ADDRESS) &&
  isConfiguredAddress(TREASURY) &&
  TREASURY_WALLET_ID.length > 0 &&
  PRIVY_APP_SECRET.length > 0;

/** Why writes are still off-chain. Surfaced verbatim so the reason is the true one. */
export function settlementBlocker(): string | null {
  if (!isConfiguredAddress(OSR_TOKEN_ADDRESS)) return 'OSR token address is not set yet';
  if (!isConfiguredAddress(TREASURY)) return 'protocol treasury wallet is not set';
  if (!TREASURY_WALLET_ID) return 'protocol wallet id is not configured';
  if (!PRIVY_APP_SECRET) return 'Privy app secret is not configured';
  return null;
}

export function requireSettlement(): void {
  const blocker = settlementBlocker();
  if (blocker) throw new GameError(`On-chain settlement unavailable: ${blocker}`, 503);
}

const chain = {
  id: CHAIN.id,
  name: CHAIN.name,
  nativeCurrency: CHAIN.nativeCurrency,
  rpcUrls: { default: { http: [CHAIN.rpcUrl] } },
} as const;

let clientRef: ReturnType<typeof createPublicClient> | null = null;
function publicClient() {
  if (!clientRef) clientRef = createPublicClient({ chain, transport: http(CHAIN.rpcUrl) });
  return clientRef;
}

// Token decimals are read once from the contract rather than assumed, so a
// non-18-decimal token cannot silently mis-price every action by orders of
// magnitude.
let decimalsRef: number | null = null;
async function tokenDecimals(): Promise<number> {
  if (decimalsRef != null) return decimalsRef;
  try {
    decimalsRef = await publicClient().readContract({
      address: OSR_TOKEN_ADDRESS as Hex,
      abi: erc20Abi,
      functionName: 'decimals',
    });
  } catch {
    decimalsRef = 18;
  }
  return decimalsRef;
}

function toUnits(amount: number, decimals: number): bigint {
  // Fixed-precision string, not Number math — 1e18 loses precision otherwise.
  const [whole, frac = ''] = amount.toFixed(decimals).split('.');
  return BigInt(whole + frac.padEnd(decimals, '0').slice(0, decimals));
}

/** 32-byte-safe opaque payload binding a settlement to the exact action priced. */
export function encodeDetail(value: string): Hex {
  const bytes = new TextEncoder().encode(value);
  if (bytes.length > 32) throw new GameError(`detail too long: ${value}`);
  const padded = new Uint8Array(32);
  padded.set(bytes);
  return `0x${Buffer.from(padded).toString('hex')}` as Hex;
}

function randomNonce(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString('hex');
}

export interface Quote {
  action: SettlementAction;
  detail: Hex;
  /** Whole OSR (not base units). */
  osrAmount: number;
}

export interface PaymentRequest {
  action: SettlementAction;
  /** ERC-20 the operator must send. */
  token: string;
  /** Where it must land. */
  to: string;
  /** Base units, as a decimal string. */
  amount: string;
  /** Human amount, for the UI. */
  osrAmount: number;
  decimals: number;
  nonce: string;
  deadline: number;
  chainId: number;
}

/** Price an action, record it as pending, and return payment instructions. */
export async function quoteSpend(wallet: string, quote: Quote): Promise<PaymentRequest> {
  requireSettlement();
  const decimals = await tokenDecimals();
  const amount = toUnits(quote.osrAmount, decimals);
  const nonce = randomNonce();
  const deadline = Math.floor(Date.now() / 1000) + QUOTE_TTL_SECONDS;

  getDb()
    .prepare(
      `INSERT INTO settlements
         (nonce, wallet, action, detail, osr_amount, fee_wei, burn_bps, treasury_bps,
          deadline, status, created_at)
       VALUES (?,?,?,?,?,'0',0,0,?,'issued',?)`
    )
    .run(nonce, wallet, quote.action, quote.detail, amount.toString(), deadline, Date.now());

  return {
    action: quote.action,
    token: OSR_TOKEN_ADDRESS,
    to: TREASURY,
    amount: amount.toString(),
    osrAmount: quote.osrAmount,
    decimals,
    nonce,
    deadline,
    chainId: CHAIN.id,
  };
}

interface SettlementRow {
  nonce: string;
  wallet: string;
  action: string;
  detail: string;
  osr_amount: string;
  status: string;
  tx_hash: string | null;
  applied_result: string | null;
  deadline: number;
}

/**
 * Verify the operator really paid, then apply the game-state change once.
 *
 * Each check closes a way a caller could otherwise lie: wrong token, someone
 * else's transfer, wrong destination, short payment, a reverted or unconfirmed
 * tx, or replaying one payment across several actions.
 */
export async function settleSpend<T>(
  wallet: string,
  nonce: string,
  txHash: string,
  apply: (row: SettlementRow) => T
): Promise<T> {
  requireSettlement();
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) throw new GameError('invalid transaction hash');

  const db = getDb();
  const row = db.prepare('SELECT * FROM settlements WHERE nonce = ?').get(nonce) as
    | unknown as SettlementRow | undefined;

  if (!row) throw new GameError('unknown settlement nonce', 404);
  if (row.wallet !== wallet) throw new GameError('settlement belongs to another wallet', 403);
  if (row.status === 'settled') {
    // Idempotent replay: hand back what was already applied.
    return JSON.parse(row.applied_result ?? 'null') as T;
  }
  if (row.deadline < Math.floor(Date.now() / 1000)) {
    throw new GameError('quote expired — request a fresh one', 409);
  }

  // viem THROWS TransactionReceiptNotFoundError when the tx is not yet visible
  // to this RPC node. The client already waited for the receipt before calling
  // settle, so this is propagation lag between RPC nodes, not a real failure —
  // make it the same retryable 425 as the confirmations path, or the client
  // (which only retries on "awaiting confirmations") gives up and the operator
  // is charged on-chain for an action that never applied.
  let receipt: Awaited<ReturnType<ReturnType<typeof publicClient>['getTransactionReceipt']>> | null;
  try {
    receipt = await publicClient().getTransactionReceipt({ hash: txHash as Hex });
  } catch {
    throw new GameError('awaiting confirmations (receipt not yet visible)', 425);
  }
  if (!receipt) throw new GameError('awaiting confirmations (receipt not yet visible)', 425);
  if (receipt.status !== 'success') throw new GameError('transaction reverted on-chain', 400);

  const head = await publicClient().getBlockNumber();
  const confirmations = head >= receipt.blockNumber ? head - receipt.blockNumber + 1n : 0n;
  if (confirmations < BigInt(MIN_CONFIRMATIONS)) {
    throw new GameError(`awaiting confirmations (${confirmations}/${MIN_CONFIRMATIONS})`, 425);
  }

  // Find an OSR Transfer in this tx that pays the treasury at least the quote.
  const token = OSR_TOKEN_ADDRESS.toLowerCase();
  const treasury = TREASURY.toLowerCase();
  const owed = BigInt(row.osr_amount);
  let paid = false;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== token) continue;
    try {
      const decoded = decodeEventLog({ abi: TRANSFER_ABI, data: log.data, topics: log.topics });
      const args = decoded.args as unknown as { from: string; to: string; value: bigint };
      if (args.to.toLowerCase() !== treasury) continue;
      if (args.from.toLowerCase() !== wallet.toLowerCase()) continue;
      if (args.value < owed) continue;
      paid = true;
      break;
    } catch {
      // Not a Transfer log; keep scanning.
    }
  }
  if (!paid) {
    throw new GameError('transaction does not contain a matching payment to the treasury', 400);
  }

  // Claim the row BEFORE applying anything.
  //
  // The two awaits above are interleave points: concurrent settles for one nonce
  // can each read status 'issued' at the top and then both reach this line. If
  // the guard ran only after apply(), every one of them would already have
  // mutated game state by the time the losers got their 409 — one payment, N
  // applications. A single conditional UPDATE is what makes exactly one caller
  // the winner, and it has to happen first.
  let claimed;
  try {
    claimed = db
      .prepare(
        `UPDATE settlements SET status = 'settling', tx_hash = ?
          WHERE nonce = ? AND status = 'issued'`
      )
      .run(txHash, nonce);
  } catch {
    // The partial unique index on tx_hash rejects a second settlement backed by
    // the same transaction, which is the replay this check exists to stop.
    throw new GameError('that transaction has already paid for another action', 409);
  }
  if (claimed.changes === 0) {
    const current = db
      .prepare('SELECT status, applied_result FROM settlements WHERE nonce = ?')
      .get(nonce) as { status: string; applied_result: string | null } | undefined;
    if (current?.status === 'settled') return JSON.parse(current.applied_result ?? 'null') as T;
    throw new GameError('this settlement is already being applied', 409);
  }

  let result: T;
  try {
    result = apply(row);
  } catch (e) {
    // Release the claim. The operator has already paid on-chain, so a transient
    // failure must leave the settlement retryable rather than stranded.
    db.prepare(
      `UPDATE settlements SET status = 'issued', tx_hash = NULL
        WHERE nonce = ? AND status = 'settling'`
    ).run(nonce);
    throw e;
  }

  db.prepare(
    `UPDATE settlements SET status = 'settled', applied_result = ?, settled_at = ?
      WHERE nonce = ?`
  ).run(JSON.stringify(result ?? null), Date.now(), nonce);

  return result;
}

// ---------------------------------------------------------------------------
// Payouts — signed by the Privy server wallet, no local private key
// ---------------------------------------------------------------------------

async function privyWalletRpc(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const auth = Buffer.from(`${PRIVY_APP_ID}:${PRIVY_APP_SECRET}`).toString('base64');
  const res = await fetch(`https://api.privy.io/v1/wallets/${TREASURY_WALLET_ID}/rpc`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'privy-app-id': PRIVY_APP_ID,
      Authorization: `Basic ${auth}`,
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new GameError(`payout wallet error: ${JSON.stringify(json).slice(0, 180)}`, 502);
  }
  return json;
}

/**
 * Send `osrAmount` OSR from the protocol wallet to an operator, returning the
 * transaction hash. Used for reward claims.
 */
/**
 * What the claimer is charged for the gas the protocol spends paying them.
 *
 * Operators pay their own gas on spends — they sign those transfers. A payout
 * moves OSR *out of* the treasury, so only the treasury key can sign it and the
 * claimer cannot be the one to pay the gas directly. Reimbursing in ETH would
 * cost the claimer more gas than the payout it reimburses, and a standing
 * allowance they could pull from would let anyone drain the treasury. So the
 * cost is passed on in OSR instead: the protocol fronts the ETH and deducts the
 * equivalent from the amount sent.
 *
 * The conversion needs an OSR/ETH rate, which does not exist until the token
 * trades. While OSR_PER_ETH is unset the protocol absorbs the gas rather than
 * inventing a price — at roughly a cent a claim the 2% claim fee covers it
 * many times over. Set it once OSR has a market and claimers pay their own way.
 */
const OSR_PER_ETH = Number(process.env.OSR_PER_ETH ?? '0');

export interface PayoutResult {
  hash: string;
  /** OSR actually sent, after the gas deduction. */
  sentOsr: number;
  /** OSR withheld to cover gas. Zero when no rate is configured. */
  gasOsr: number;
}

/**
 * Estimate what this payout will cost in gas, priced in OSR.
 *
 * Estimated rather than measured because the amount to send has to be decided
 * before the transaction exists. A plain ERC-20 transfer is predictable, and
 * the estimate is padded so a small gas rise does not leave the protocol short.
 */
export async function estimatePayoutGasOsr(toWallet: string, osrAmount: number): Promise<number> {
  if (!(OSR_PER_ETH > 0)) return 0;
  const decimals = await tokenDecimals();
  const data = encodeFunctionData({
    abi: erc20Abi,
    functionName: 'transfer',
    args: [toWallet as Hex, toUnits(osrAmount, decimals)],
  });
  return estimateGasOsr(OSR_TOKEN_ADDRESS as Hex, data);
}

async function estimateGasOsr(to: Hex, data: Hex): Promise<number> {
  if (!(OSR_PER_ETH > 0)) return 0;
  try {
    const [gas, gasPrice] = await Promise.all([
      publicClient().estimateGas({ account: TREASURY as Hex, to, data }),
      publicClient().getGasPrice(),
    ]);
    const weiCost = (gas * gasPrice * 125n) / 100n; // 25% headroom
    return (Number(weiCost) / 1e18) * OSR_PER_ETH;
  } catch (e) {
    // A failed estimate must not block the claim; absorbing a cent of gas is
    // strictly better than refusing to pay someone what they earned.
    console.error('[payout] gas estimate failed, absorbing gas cost', e);
    return 0;
  }
}

export async function payoutOsr(toWallet: string, osrAmount: number): Promise<PayoutResult> {
  requireSettlement();
  if (!(osrAmount > 0)) throw new GameError('payout amount must be positive');

  const decimals = await tokenDecimals();
  const encode = (value: number) =>
    encodeFunctionData({
      abi: erc20Abi,
      functionName: 'transfer',
      args: [toWallet as Hex, toUnits(value, decimals)],
    });

  const gasOsr = await estimateGasOsr(OSR_TOKEN_ADDRESS as Hex, encode(osrAmount));
  const sentOsr = osrAmount - gasOsr;
  if (!(sentOsr > 0)) {
    throw new GameError(
      'this claim is too small to cover its own network fee — let more rewards accrue first',
      400
    );
  }

  const json = await privyWalletRpc({
    method: 'eth_sendTransaction',
    caip2: `eip155:${CHAIN.id}`,
    params: { transaction: { to: OSR_TOKEN_ADDRESS, data: encode(sentOsr), value: '0x0' } },
  });

  const payload = (json.data ?? json) as Record<string, unknown>;
  const hash = (payload.hash ?? payload.transaction_hash ?? payload.transactionHash) as string | undefined;
  if (!hash) throw new GameError('payout did not return a transaction hash', 502);
  return { hash, sentOsr, gasOsr };
}

/**
 * Record a payout so it is auditable alongside spends.
 *
 * `txHash` is null when the transfer did not go through. The accrual has already
 * been consumed by then, so the row is the only record that the protocol owes
 * this wallet — it must always be writable. Null rather than a placeholder
 * string because the unique index on tx_hash is partial (`WHERE tx_hash IS NOT
 * NULL`): a literal like 'PENDING' inserts once and then collides on every
 * later failure, which is exactly when the debt most needs recording.
 *
 * Status distinguishes the two: 'settled' means OSR moved, 'owed' means it did
 * not. Both are terminal — nothing retries an owed row automatically, so they
 * are settled by hand.
 */
export function recordPayout(
  wallet: string,
  osrAmount: number,
  txHash: string | null,
  result: unknown
) {
  const settled = txHash != null;
  getDb()
    .prepare(
      `INSERT INTO settlements
         (nonce, wallet, action, detail, osr_amount, fee_wei, burn_bps, treasury_bps,
          deadline, status, tx_hash, applied_result, created_at, settled_at)
       VALUES (?,?,'Claim','claim',?, '0',0,0,0,?,?,?,?,?)`
    )
    .run(
      randomNonce(),
      wallet,
      String(osrAmount),
      settled ? 'settled' : 'owed',
      txHash,
      JSON.stringify(result ?? null),
      Date.now(),
      settled ? Date.now() : null
    );
}
