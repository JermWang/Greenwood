'use client';

// Browser half of settlement.
//
// The server quotes an action and returns payment instructions; this module
// sends the operator's GPU to the protocol treasury as a plain ERC-20 transfer
// and hands the tx hash back. Nothing here is trusted — the server verifies the
// Transfer event on-chain before applying anything.
//
// No token approval is needed: the operator transfers directly from their own
// wallet, so this is a single signature rather than approve-then-spend.

import {
  createPublicClient,
  createWalletClient,
  custom,
  erc20Abi,
  formatUnits,
  getAddress,
  type Address,
  type Hex,
} from 'viem';
import { CHAIN, EXPECTED_TOKEN_SYMBOL, OSR_TOKEN_ADDRESS, OSR_TREASURY_ADDRESS, isConfiguredAddress } from './config';
import { requireSettlementProvider, robinhoodChain } from './evm';
import { confirmTransactionPreview } from './tx-safety';

/** Progress states surfaced to the UI so a multi-step action reads clearly. */
export type SettlementStep = 'quoting' | 'preflighting' | 'reviewing' | 'submitting' | 'confirming' | 'settling';
export type StepHandler = (step: SettlementStep) => void;

export interface PaymentRequest {
  action: string;
  /** ERC-20 to send. */
  token: string;
  /** Protocol treasury that must receive it. */
  to: string;
  /** Base units, decimal string. */
  amount: string;
  osrAmount: number;
  decimals: number;
  nonce: string;
  deadline: number;
  chainId: number;
}

export interface ValidatedPayment {
  token: Address;
  treasury: Address;
  amount: bigint;
  displayAmount: string;
}

/**
 * The account and chain are part of the simulated transaction context. If
 * either changes while the in-app review is open, the old prediction no longer
 * describes the wallet request and must not be submitted.
 */
export function validateWalletContext(
  simulatedAccount: Address,
  currentAccount: Address | undefined,
  currentChainId: number
): void {
  if (!currentAccount || getAddress(currentAccount) !== getAddress(simulatedAccount)) {
    throw new Error('Wallet account changed during review; request a fresh transaction preview');
  }
  if (currentChainId !== CHAIN.id) {
    throw new Error('Wallet network changed during review; request a fresh transaction preview');
  }
}

/**
 * Treat every server quote as hostile until it matches the locally configured
 * protocol invariants. This stops a compromised response, proxy, or stale
 * deployment from changing the token, recipient, chain, amount, or deadline
 * that reaches the wallet.
 */
export function validatePaymentRequest(
  payment: PaymentRequest,
  nowSeconds = Math.floor(Date.now() / 1000),
  expectedToken = OSR_TOKEN_ADDRESS,
  expectedTreasury = OSR_TREASURY_ADDRESS
): ValidatedPayment {
  if (!isConfiguredAddress(expectedToken) || !isConfiguredAddress(expectedTreasury)) {
    throw new Error('BNTY settlement addresses are not configured');
  }
  if (payment.chainId !== CHAIN.id) throw new Error(`Payment quote targets unexpected chain ${payment.chainId}`);
  if (!Number.isInteger(payment.deadline) || payment.deadline <= nowSeconds) throw new Error('Payment quote has expired');
  if (payment.deadline > nowSeconds + 16 * 60) throw new Error('Payment quote deadline is unexpectedly long');
  if (!/^[0-9a-fA-F]{32}$/.test(payment.nonce)) throw new Error('Payment quote nonce is malformed');
  if (!Number.isInteger(payment.decimals) || payment.decimals < 0 || payment.decimals > 36) throw new Error('Token decimals are invalid');
  if (!/^\d+$/.test(payment.amount)) throw new Error('Payment amount is malformed');

  const token = getAddress(payment.token);
  const treasury = getAddress(payment.to);
  if (token !== getAddress(expectedToken)) throw new Error('Payment quote changed the BNTY token contract');
  if (treasury !== getAddress(expectedTreasury)) throw new Error('Payment quote changed the protocol treasury');

  const amount = BigInt(payment.amount);
  if (amount <= 0n) throw new Error('Payment amount must be greater than zero');
  const displayAmount = formatUnits(amount, payment.decimals);
  const displayNumber = Number(displayAmount);
  if (!Number.isFinite(payment.osrAmount) || payment.osrAmount <= 0 || !Number.isFinite(displayNumber)) {
    throw new Error('Human-readable payment amount is invalid');
  }
  const tolerance = Math.max(10 ** -Math.min(payment.decimals, 12), Math.abs(payment.osrAmount) * 1e-10);
  if (Math.abs(displayNumber - payment.osrAmount) > tolerance) {
    throw new Error('Payment base units do not match the quoted BNTY amount');
  }
  return { token, treasury, amount, displayAmount };
}

/**
 * Send the quoted GPU to the treasury and return the transaction hash.
 */
export async function submitPayment(
  payment: PaymentRequest,
  onStep?: StepHandler
): Promise<Hex> {
  const provider = await requireSettlementProvider();
  const transport = custom(provider);
  const wallet = createWalletClient({ chain: robinhoodChain, transport });
  const pub = createPublicClient({ chain: robinhoodChain, transport });
  const validated = validatePaymentRequest(payment);

  const [account] = await wallet.getAddresses();
  if (!account) throw new Error('No wallet account available');

  onStep?.('preflighting');
  const [tokenDecimals, tokenSymbol, balance] = await Promise.all([
    pub.readContract({ address: validated.token, abi: erc20Abi, functionName: 'decimals' }),
    pub.readContract({ address: validated.token, abi: erc20Abi, functionName: 'symbol' }),
    pub.readContract({ address: validated.token, abi: erc20Abi, functionName: 'balanceOf', args: [account] }),
  ]);
  if (tokenDecimals !== payment.decimals) throw new Error('BNTY token decimals do not match the payment quote');
  if (tokenSymbol.trim().toUpperCase() !== EXPECTED_TOKEN_SYMBOL.toUpperCase()) {
    throw new Error(`Configured token identifies as ${tokenSymbol}, not ${EXPECTED_TOKEN_SYMBOL}; wallet request blocked`);
  }
  if (balance < validated.amount) throw new Error(`Insufficient ${tokenSymbol} balance for this action`);

  // viem recommends simulation before writeContract. Passing its returned
  // request straight into the wallet ensures the exact simulated calldata is
  // the calldata that gets signed.
  await pub.simulateContract({
    account,
    address: validated.token,
    abi: erc20Abi,
    functionName: 'transfer',
    args: [validated.treasury, validated.amount],
  });

  onStep?.('reviewing');
  const approved = await confirmTransactionPreview({
    action: payment.action,
    network: CHAIN.name,
    chainId: CHAIN.id,
    tokenSymbol,
    amount: validated.displayAmount,
    tokenAddress: validated.token,
    treasuryAddress: validated.treasury,
    nativeValue: '0 ETH',
    method: 'ERC-20 transfer',
    simulationPassed: true,
  });
  if (!approved) throw new Error('Transaction cancelled before opening the wallet');

  // Re-check immediately before opening the wallet. An accountsChanged or
  // chainChanged event can fire while the review sheet is open, invalidating
  // the account-bound prediction above.
  const [currentAccounts, chainHex] = await Promise.all([
    wallet.getAddresses(),
    provider.request({ method: 'eth_chainId' }) as Promise<string>,
  ]);
  validateWalletContext(account, currentAccounts[0], Number.parseInt(chainHex, 16));

  // Simulation freshness matters to wallet prediction. Run it again after the
  // human review and pass this newly simulated request straight to the wallet,
  // so sender, calldata, recipient, amount, and current chain state all align.
  const { request: freshRequest } = await pub.simulateContract({
    account,
    address: validated.token,
    abi: erc20Abi,
    functionName: 'transfer',
    args: [validated.treasury, validated.amount],
  });

  onStep?.('submitting');
  const hash = await wallet.writeContract(freshRequest);

  onStep?.('confirming');
  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new Error('Payment transaction reverted on-chain');
  return hash;
}
