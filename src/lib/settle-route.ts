// Route helper for the quote / pay / settle flow.
//
// Each priced action route is the same shape:
//
//   POST { wallet, ...params }       -> 200 { settled:false, payment }  (quote)
//   POST { wallet, nonce, txHash }   -> 200 { settled:true,  result }   (settle)
//
// Between the two the operator sends the quoted BNTY to the treasury wallet as a
// plain ERC-20 transfer. Critically, the settle phase reads its parameters back
// out of the stored settlement row's `detail`, never from the request body —
// the body is attacker-controlled, the stored row is what was actually priced.

import { NextResponse } from 'next/server';
import { GameError, type SpendOpts } from './game';
import { requireAuthenticatedWallet } from './api-util';
import { requireNoActiveDeploy } from './deploy-guard';
import {
  SETTLEMENT_CONFIGURED,
  encodeDetail,
  quoteSpend,
  settleSpend,
  type Quote,
  type SettlementAction,
} from './settlement';

/** Decode the 32-byte detail payload back into its string form. */
export function decodeDetail(detail: string): string {
  const hex = detail.startsWith('0x') ? detail.slice(2) : detail;
  const bytes = Buffer.from(hex, 'hex');
  const end = bytes.indexOf(0);
  return bytes.subarray(0, end === -1 ? bytes.length : end).toString('utf8');
}

export interface SettlementRouteSpec<P> {
  action: SettlementAction;
  /** Validate the request body into action parameters. Throws GameError. */
  parse: (body: Record<string, unknown>, wallet: string) => P;
  /** Stable string encoding of the parameters, stored in `detail` (<= 32 bytes). */
  encode: (params: P) => string;
  /** Rebuild parameters from `detail` during the settle phase. */
  decode: (detail: string) => P;
  /** Price the action from current off-chain state. */
  price: (wallet: string, params: P) => Omit<Quote, 'action' | 'detail'>;
  /**
   * Apply the game-state change.
   *
   * `opts` carries settledOnChain, which must reflect how the action was
   * actually paid for. Hardcoding it would either debit an operator who already
   * paid in ERC-20, or hand out free actions when there is no chain payment at
   * all — both silent, both expensive.
   */
  apply: (wallet: string, params: P, opts: SpendOpts) => unknown;
}

export async function handleSettlementRoute<P>(
  request: Request,
  spec: SettlementRouteSpec<P>
): Promise<NextResponse> {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const wallet = await requireAuthenticatedWallet(request, body.wallet);

    // Until the token address and protocol wallet are configured there is
    // nothing on-chain to pay, so the action runs straight through the engine
    // and the mirrored balance is the ledger of record. Setting them flips the
    // same action to quote -> ERC-20 transfer -> receipt verification. No other
    // code has to change to make that switch.
    if (!SETTLEMENT_CONFIGURED) {
      // Pre-token this both prices and applies in one call, so it is a "start"
      // and must wait out a deploy window like any other.
      requireNoActiveDeploy();
      const params = spec.parse(body, wallet);
      return NextResponse.json({ settled: true, result: spec.apply(wallet, params, {}) });
    }

    const nonce = typeof body.nonce === 'string' ? body.nonce : null;
    const txHash = typeof body.txHash === 'string' ? body.txHash : null;

    // Phase 2 — settle: verify the operator's payment landed, then apply.
    // Deliberately allowed during a deploy window: the operator has already paid
    // on-chain, so completing is what rescues their tokens, not what risks them.
    if (nonce && txHash) {
      const result = await settleSpend(wallet, spec.action, nonce, txHash, (row) =>
        spec.apply(wallet, spec.decode(decodeDetail(row.detail)), { settledOnChain: true })
      );
      return NextResponse.json({ settled: true, result });
    }
    if (nonce || txHash) {
      throw new GameError('both nonce and txHash are required to settle', 400);
    }

    // Phase 1 — quote: hands back payment instructions the operator is about to
    // act on, so refuse to open one while a cutover is imminent.
    requireNoActiveDeploy();
    const params = spec.parse(body, wallet);
    const priced = spec.price(wallet, params);
    const payment = await quoteSpend(wallet, {
      ...priced,
      action: spec.action,
      detail: encodeDetail(spec.encode(params)),
    });
    return NextResponse.json({ settled: false, payment });
  } catch (e) {
    if (e instanceof GameError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error('[settlement]', e);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}

export function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new GameError(`${field} is required`, 400);
  }
  return value;
}

export function requireNodeId(value: unknown): number {
  const id = typeof value === 'string' ? Number(value) : value;
  if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) {
    throw new GameError('valid nodeId is required', 400);
  }
  return id;
}
