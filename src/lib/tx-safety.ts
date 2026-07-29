'use client';

export interface TransactionPreview {
  action: string;
  network: string;
  chainId: number;
  tokenSymbol: string;
  amount: string;
  tokenAddress: string;
  treasuryAddress: string;
  nativeValue: string;
  method: 'ERC-20 transfer';
  simulationPassed: true;
}

interface TransactionPreviewRequest {
  preview: TransactionPreview;
  resolve: (approved: boolean) => void;
}

declare global {
  interface WindowEventMap {
    'greenwood:transaction-preview': CustomEvent<TransactionPreviewRequest>;
  }
}

export function confirmTransactionPreview(preview: TransactionPreview): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  return new Promise((resolve) => {
    window.dispatchEvent(new CustomEvent('greenwood:transaction-preview', { detail: { preview, resolve } }));
  });
}

