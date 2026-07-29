import { describe, expect, test } from 'vitest';
import {
  validatePaymentRequest,
  validateWalletContext,
  type PaymentRequest,
} from './settlement-client';

const TOKEN = '0x1111111111111111111111111111111111111111';
const TREASURY = '0x2222222222222222222222222222222222222222';
const NOW = 1_800_000_000;

const payment = (overrides: Partial<PaymentRequest> = {}): PaymentRequest => ({
  action: 'MintNode',
  token: TOKEN,
  to: TREASURY,
  amount: '1250000',
  bntyAmount: 1.25,
  decimals: 6,
  nonce: '00112233445566778899aabbccddeeff',
  deadline: NOW + 900,
  chainId: 4663,
  ...overrides,
});

describe('payment quote safety', () => {
  test('accepts an exact chain-bound direct transfer quote', () => {
    expect(validatePaymentRequest(payment(), NOW, TOKEN, TREASURY)).toMatchObject({
      amount: 1_250_000n,
      displayAmount: '1.25',
    });
  });

  test('rejects a changed token or treasury', () => {
    expect(() => validatePaymentRequest(payment({ token: TREASURY }), NOW, TOKEN, TREASURY)).toThrow(/token contract/i);
    expect(() => validatePaymentRequest(payment({ to: TOKEN }), NOW, TOKEN, TREASURY)).toThrow(/treasury/i);
  });

  test('rejects wrong-chain and expired quotes', () => {
    expect(() => validatePaymentRequest(payment({ chainId: 1 }), NOW, TOKEN, TREASURY)).toThrow(/unexpected chain/i);
    expect(() => validatePaymentRequest(payment({ deadline: NOW }), NOW, TOKEN, TREASURY)).toThrow(/expired/i);
  });

  test('rejects a display amount that does not match calldata base units', () => {
    expect(() => validatePaymentRequest(payment({ bntyAmount: 12.5 }), NOW, TOKEN, TREASURY)).toThrow(/base units/i);
  });
});

describe('wallet prediction context', () => {
  test('accepts the same account on the expected chain', () => {
    expect(() => validateWalletContext(TOKEN, TOKEN, 4663)).not.toThrow();
  });

  test('rejects an account changed while the preview is open', () => {
    expect(() => validateWalletContext(TOKEN, TREASURY, 4663)).toThrow(/account changed/i);
  });

  test('rejects a chain changed while the preview is open', () => {
    expect(() => validateWalletContext(TOKEN, TOKEN, 1)).toThrow(/network changed/i);
  });
});
