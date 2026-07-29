// On-chain settlement via plain ERC-20 transfers — no custom contracts.
//
// SPENDS (mint, upgrade, crate, compound, expedite):
//   1. QUOTE   the server prices the action, records a settlement row, and
//              returns payment instructions (token, treasury address, amount).
//   2. PAY     the operator sends that many BNTY to the treasury wallet — an
//              ordinary ERC-20 transfer signed in their own wallet.
//   3. SETTLE  the operator hands back the tx hash. The server reads the
//              receipt, verifies the token's Transfer event really moved the
//              quoted amount from them to the treasury, and only then applies
//              the game-state change.
//
// PAYOUTS (claim): the server sends BNTY from the protocol wallet to the player.
// That wallet is a Privy server wallet, so signing happens inside Privy via the
// app secret — no private key is ever stored by this app.
//
// The server picks the price but cannot fabricate the payment: every spend is a
// real token transfer proven by a mined Transfer event, and each tx hash can
// back exactly one settlement.

import { createPublicClient, createWalletClient, http, decodeEventLog, parseAbi, encodeFunctionData, erc20Abi, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { getDb } from './db';
import { GameError } from './game';
import { requirePayoutsEnabled } from './solvency';
import { CHAIN, BNTY_TOKEN_ADDRESS, isConfiguredAddress } from './config';

export type SettlementAction =
  | 'MintNode'
  | 'UpgradeNode'
  | 'OpenCrate'
  | 'UpgradeCompound'
  | 'ExpediteCompound'
  | 'Claim'
  | 'MarketBuy'
  | 'StakeOpen'
  | 'BuyCosmetic'
  | 'UpgradeCosmetic';

const TRANSFER_ABI = parseAbi([
  'event Transfer(address indexed from, address indexed to, uint256 value)',
]);

const TREASURY = (process.env.NEXT_PUBLIC_OSR_TREASURY_WALLET ?? '').trim();

/**
 * The treasury signing key, replacing the Privy server wallet.
 *
 * This is the one genuine security downgrade in dropping Privy, and it is named
 * plainly so nobody mistakes it for anything else: a private key that can move
 * the whole treasury now lives in the server's environment. A leaked env dump,
 * a bad log line, or a server compromise is a drained treasury.
 *
 * Three things stand in front of that, all below: the per-payout cap
 * (MAX_PAYOUT_BNTY) bounds a single bad call, the payout brake
 * (requirePayoutsEnabled) stops all of them on command, and the key's address
 * MUST equal the published treasury or the module refuses to consider itself
 * configured — a signer that is not the address spends were paid into would pay
 * claims out of the wrong wallet.
 */
const TREASURY_PK = (process.env.OSR_TREASURY_PK ?? '').trim();

/**
 * Largest single payout the treasury will sign, in BNTY.
 *
 * A claim is bounded by what a wallet accrued, so a legitimate one is never
 * huge; a request to send far more than that is a bug or an exploit, and the
 * cap turns "drain the treasury" into "lose one capped payout". Zero disables
 * it, which is the pre-token default where no payout can happen anyway.
 */
const MAX_PAYOUT_BNTY = Number(process.env.OSR_MAX_PAYOUT_BNTY ?? '0');

/** Confirmations required before a spend is credited, or a payout is trusted. */
export const MIN_CONFIRMATIONS = Number(process.env.OSR_MIN_CONFIRMATIONS ?? 2);
/**
 * How long to wait for a payout receipt before handing the decision back.
 *
 * Long enough to cover normal L2 inclusion, short enough that a stuck payout
 * does not hold a request open indefinitely — the process is single-threaded, so
 * a hung await occupies a slot every other player is queuing behind.
 */
const PAYOUT_RECEIPT_TIMEOUT_MS = 60_000;
/** How long a quote stays payable. Short, so a stale price cannot be settled. */
const QUOTE_TTL_SECONDS = 15 * 60;

/** A 32-byte hex private key, with or without the 0x prefix. */
const PK_SHAPE = /^0x?[0-9a-fA-F]{64}$/;

/**
 * The signer's address, or null if the key is missing or malformed.
 *
 * Derived once so `settlementBlocker` can check it matches the published
 * treasury without turning a bad key into a boot crash — a wrong key should
 * disable settlement with a clear reason, not take the whole app down.
 */
function treasurySignerAddress(): string | null {
  if (!PK_SHAPE.test(TREASURY_PK)) return null;
  try {
    const key = (TREASURY_PK.startsWith('0x') ? TREASURY_PK : `0x${TREASURY_PK}`) as Hex;
    return privateKeyToAccount(key).address.toLowerCase();
  } catch {
    return null;
  }
}

export const SETTLEMENT_CONFIGURED =
  isConfiguredAddress(BNTY_TOKEN_ADDRESS) &&
  isConfiguredAddress(TREASURY) &&
  treasurySignerAddress() === TREASURY.toLowerCase();

/** Why writes are still off-chain. Surfaced verbatim so the reason is the true one. */
export function settlementBlocker(): string | null {
  if (!isConfiguredAddress(BNTY_TOKEN_ADDRESS)) return 'BNTY token address is not set yet';
  if (!isConfiguredAddress(TREASURY)) return 'protocol treasury wallet is not set';
  if (!PK_SHAPE.test(TREASURY_PK)) return 'treasury signing key is not configured';
  if (treasurySignerAddress() !== TREASURY.toLowerCase()) {
    return 'treasury signing key does not match the published treasury address';
  }
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
  if (!clientRef) {
    clientRef = createPublicClient({
      chain,
      transport: http(CHAIN.rpcUrl),
      /*
       * NO CACHING, and this is load-bearing rather than a tuning preference.
       *
       * viem defaults cacheTime to the polling interval — 4 seconds — and that
       * cache covers getBlockNumber but NOT getTransactionReceipt. So the
       * confirmation check below read a fresh receipt against a head that could
       * be four seconds stale, and on a chain producing blocks faster than that
       * the head is frequently BEHIND the block the receipt is in.
       *
       * The symptom is a correctly paid operator being told "awaiting
       * confirmations (0/2)" when the payment actually had five. It is
       * retryable, so nobody loses tokens, but the happy path fails on first
       * attempt and the number in the message is a lie.
       *
       * Robinhood Chain produces a block roughly every 0.35s, so the default
       * cache spans about eleven blocks. This was found by running the real
       * settle path against a local chain; it is invisible to a unit test,
       * because a mocked client has no clock.
       */
      cacheTime: 0,
    });
  }
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
      address: BNTY_TOKEN_ADDRESS as Hex,
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
  /** Whole BNTY (not base units). */
  bntyAmount: number;
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
  bntyAmount: number;
  decimals: number;
  nonce: string;
  deadline: number;
  chainId: number;
}

/** Price an action, record it as pending, and return payment instructions. */
export async function quoteSpend(wallet: string, quote: Quote): Promise<PaymentRequest> {
  requireSettlement();
  // A free action must never reach the settlement rail. settleSpend proves a
  // payment by checking a Transfer to the treasury of at least the owed amount,
  // and every transfer clears an owed of zero — so a zero quote turns the whole
  // verification into a formality that a 0-value transfer satisfies.
  if (!Number.isFinite(quote.bntyAmount) || quote.bntyAmount <= 0) {
    throw new GameError('refusing to quote a non-positive amount', 400);
  }
  const decimals = await tokenDecimals();
  const amount = toUnits(quote.bntyAmount, decimals);
  // Guards the same hole from the other side: an amount small enough to round
  // down to zero base units is not payable either.
  if (amount <= 0n) throw new GameError('quoted amount rounds to zero', 400);
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
    token: BNTY_TOKEN_ADDRESS,
    to: TREASURY,
    amount: amount.toString(),
    bntyAmount: quote.bntyAmount,
    decimals,
    nonce,
    deadline,
    chainId: CHAIN.id,
  };
}

/**
 * Whether a failure inside apply() can ever succeed on a retry.
 *
 * The distinction decides what happens to an operator's money. A transient
 * failure should leave the settlement retryable so the same payment can be used
 * again. A permanent one — the listing sold, the crate already opened, the node
 * capacity filled — will fail identically forever, so retrying just hides the
 * fact that the treasury is holding tokens the operator got nothing for.
 *
 * Client errors from the game engine are the permanent ones; anything else
 * (a thrown TypeError, a database fault) is treated as transient, because
 * guessing "permanent" wrongly is what strands a payment.
 */
function isTerminalApplyFailure(e: unknown): boolean {
  return e instanceof GameError && [400, 403, 404, 409].includes(e.status);
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
  action: SettlementAction,
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
  // A nonce is only redeemable at the action it was priced for. Without this the
  // stored detail — which every route trusts over the request body — gets handed
  // to a different route's decoder, and the payment verified is the one this row
  // quoted, not the one that route charges. A 250 BNTY node upgrade would settle
  // a 10,000 BNTY crate, since both are just "a nonce with a paid amount".
  if (row.action !== action) throw new GameError('settlement was quoted for a different action', 409);
  if (row.status === 'settled') {
    // Idempotent replay: hand back what was already applied.
    return JSON.parse(row.applied_result ?? 'null') as T;
  }
  if (row.status === 'owed') {
    // Paid for, but the action could not be applied and never will be. Retrying
    // cannot help; the row exists so a human can reconcile it.
    throw new GameError(
      'this payment is recorded as owed to you and will be settled by hand',
      409
    );
  }
  if (row.deadline < Math.floor(Date.now() / 1000)) {
    throw new GameError('quote expired — request a fresh one', 409);
  }

  // Rows quoted before quoteSpend refused non-positive amounts are still in the
  // table, and each is a free action waiting to be settled by a 0-value transfer:
  // the payment loop below accepts any Transfer of at least `owed`. Checked here
  // rather than beside that loop so an unpayable row costs no RPC calls.
  const owed = BigInt(row.osr_amount);
  if (owed <= 0n) throw new GameError('settlement has no payable amount', 409);

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

  // Find an BNTY Transfer in this tx that pays the treasury at least the quote.
  const token = BNTY_TOKEN_ADDRESS.toLowerCase();
  const treasury = TREASURY.toLowerCase();
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
    if (isTerminalApplyFailure(e)) {
      // The action can never succeed, so releasing the claim would strand the
      // payment: every retry fails identically and nothing records that the
      // operator is owed. Two buyers racing one listing is the ordinary case —
      // both pay, one gets the item, and the loser's BNTY is already in the
      // treasury. Mark the row owed so there is something to reconcile against.
      db.prepare(
        `UPDATE settlements SET status = 'owed', applied_result = ?, settled_at = ?
          WHERE nonce = ? AND status = 'settling'`
      ).run(JSON.stringify({ error: String(e) }), Date.now(), nonce);
      throw new GameError(
        `${e instanceof GameError ? e.message : 'that action could no longer be applied'} — ` +
          'your payment is recorded as owed and will be settled by hand.',
        409
      );
    }
    // Transient: release the claim so the operator can retry with the same
    // payment rather than paying twice.
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
// Payouts — signed locally with the treasury key
// ---------------------------------------------------------------------------

/**
 * The wallet client that signs payouts, built lazily from the treasury key.
 *
 * Lazy for the same reason the public client is: the key is read at call time,
 * so a build or a test that never pays out never touches it. The address was
 * already proven to equal the published treasury in SETTLEMENT_CONFIGURED, so
 * by the time this runs the key is known-good.
 */
let walletRef: ReturnType<typeof createWalletClient> | null = null;
function treasuryWallet() {
  if (!walletRef) {
    const key = (TREASURY_PK.startsWith('0x') ? TREASURY_PK : `0x${TREASURY_PK}`) as Hex;
    walletRef = createWalletClient({
      account: privateKeyToAccount(key),
      chain,
      transport: http(CHAIN.rpcUrl),
    });
  }
  return walletRef;
}

/**
 * Send `bntyAmount` BNTY from the protocol wallet to an operator, returning the
 * transaction hash. Used for reward claims.
 */
/**
 * What the claimer is charged for the gas the protocol spends paying them.
 *
 * Operators pay their own gas on spends — they sign those transfers. A payout
 * moves BNTY *out of* the treasury, so only the treasury key can sign it and the
 * claimer cannot be the one to pay the gas directly. Reimbursing in ETH would
 * cost the claimer more gas than the payout it reimburses, and a standing
 * allowance they could pull from would let anyone drain the treasury. So the
 * cost is passed on in BNTY instead: the protocol fronts the ETH and deducts the
 * equivalent from the amount sent.
 *
 * The conversion needs an BNTY/ETH rate, which does not exist until the token
 * trades. While OSR_PER_ETH is unset the protocol absorbs the gas rather than
 * inventing a price — at roughly a cent a claim the 2% claim fee covers it
 * many times over. Set it once BNTY has a market and claimers pay their own way.
 */
const OSR_PER_ETH = Number(process.env.OSR_PER_ETH ?? '0');

export interface PayoutResult {
  hash: string;
  /** BNTY actually sent, after the gas deduction. */
  sentBnty: number;
  /** BNTY withheld to cover gas. Zero when no rate is configured. */
  gasBnty: number;
}

/**
 * Estimate what this payout will cost in gas, priced in BNTY.
 *
 * Estimated rather than measured because the amount to send has to be decided
 * before the transaction exists. A plain ERC-20 transfer is predictable, and
 * the estimate is padded so a small gas rise does not leave the protocol short.
 */
export async function estimatePayoutGasBnty(toWallet: string, bntyAmount: number): Promise<number> {
  if (!(OSR_PER_ETH > 0)) return 0;
  const decimals = await tokenDecimals();
  const data = encodeFunctionData({
    abi: erc20Abi,
    functionName: 'transfer',
    args: [toWallet as Hex, toUnits(bntyAmount, decimals)],
  });
  return estimateGasBnty(BNTY_TOKEN_ADDRESS as Hex, data);
}

async function estimateGasBnty(to: Hex, data: Hex): Promise<number> {
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

export async function payoutBnty(toWallet: string, bntyAmount: number): Promise<PayoutResult> {
  requireSettlement();
  // The brake, checked at the signer itself rather than only at the callers.
  // Every path that moves tokens out of the treasury — a claim, an admin debt
  // retry, anything added later — passes through here, so this is the one place
  // a pause is guaranteed to be honoured.
  requirePayoutsEnabled();
  if (!(bntyAmount > 0)) throw new GameError('payout amount must be positive');

  // The cap. A legitimate claim is bounded by what a wallet accrued, so a payout
  // larger than the cap is a bug or an exploit — refuse it rather than sign it.
  if (MAX_PAYOUT_BNTY > 0 && bntyAmount > MAX_PAYOUT_BNTY) {
    throw new GameError(
      `payout of ${Math.round(bntyAmount).toLocaleString()} BNTY exceeds the per-payout cap; paused for review`,
      403
    );
  }

  const decimals = await tokenDecimals();
  const encode = (value: number) =>
    encodeFunctionData({
      abi: erc20Abi,
      functionName: 'transfer',
      args: [toWallet as Hex, toUnits(value, decimals)],
    });

  const gasBnty = await estimateGasBnty(BNTY_TOKEN_ADDRESS as Hex, encode(bntyAmount));
  const sentBnty = bntyAmount - gasBnty;
  if (!(sentBnty > 0)) {
    throw new GameError(
      'this claim is too small to cover its own network fee — let more rewards accrue first',
      400
    );
  }

  // Signed locally and submitted. sendTransaction returns once the node accepts
  // the tx into the mempool; confirmation is awaited below, exactly as before.
  let hash: string;
  try {
    hash = await treasuryWallet().sendTransaction({
      account: treasuryWallet().account!,
      chain,
      to: BNTY_TOKEN_ADDRESS as Hex,
      data: encode(sentBnty),
      value: 0n,
    });
  } catch (error) {
    throw new GameError(`payout could not be submitted: ${(error as Error).message}`.slice(0, 180), 502);
  }
  if (!hash) throw new GameError('payout did not return a transaction hash', 502);

  // A submitted transaction is not a completed one. Returning here treated a
  // reverted payout as a successful one: the accrual is already consumed, the
  // stake already closed, and recordPayout would write status='settled' for
  // tokens that never left the treasury — indistinguishable afterwards from a
  // payout that worked. An underfunded treasury fails exactly this way, and
  // every spend already waits for confirmations, so payouts should too.
  //
  // A timeout here is not proof of failure: the transaction may still confirm.
  // It is reported as its own case so the caller records the debt for a human to
  // reconcile against the hash rather than assuming either outcome.
  let receipt;
  try {
    receipt = await publicClient().waitForTransactionReceipt({
      hash: hash as Hex,
      confirmations: MIN_CONFIRMATIONS,
      timeout: PAYOUT_RECEIPT_TIMEOUT_MS,
    });
  } catch {
    throw new GameError(
      `payout ${hash} was submitted but not confirmed in time — verify it on-chain before retrying`,
      502
    );
  }
  if (receipt.status !== 'success') {
    throw new GameError(`payout ${hash} reverted on-chain`, 502);
  }

  return { hash, sentBnty, gasBnty };
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
 * Status distinguishes the two: 'settled' means BNTY moved, 'owed' means it did
 * not. Both are terminal — nothing retries an owed row automatically, so they
 * are settled by hand.
 */
export function recordPayout(
  wallet: string,
  bntyAmount: number,
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
      String(bntyAmount),
      settled ? 'settled' : 'owed',
      txHash,
      JSON.stringify(result ?? null),
      Date.now(),
      settled ? Date.now() : null
    );
}
