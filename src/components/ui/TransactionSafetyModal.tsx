'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle, ShieldCheck, X } from '@phosphor-icons/react';
import type { TransactionPreview } from '@/lib/tx-safety';

interface PendingPreview {
  preview: TransactionPreview;
  resolve: (approved: boolean) => void;
}

const short = (address: string) => `${address.slice(0, 8)}…${address.slice(-6)}`;

export default function TransactionSafetyModal() {
  const [pending, setPending] = useState<PendingPreview | null>(null);
  const pendingRef = useRef<PendingPreview | null>(null);

  useEffect(() => {
    const onPreview = (event: WindowEventMap['gpu:transaction-preview']) => {
      pendingRef.current?.resolve(false);
      pendingRef.current = event.detail;
      setPending(event.detail);
    };
    window.addEventListener('gpu:transaction-preview', onPreview);
    return () => {
      window.removeEventListener('gpu:transaction-preview', onPreview);
      pendingRef.current?.resolve(false);
      pendingRef.current = null;
    };
  }, []);

  if (!pending) return null;
  const finish = (approved: boolean) => {
    pending.resolve(approved);
    pendingRef.current = null;
    setPending(null);
  };

  return (
    <div className="gpu-tx-backdrop" role="presentation" onClick={() => finish(false)}>
      <section className="gpu-tx-modal" role="dialog" aria-modal="true" aria-labelledby="gpu-tx-title" onClick={(event) => event.stopPropagation()}>
        <header><span><ShieldCheck size={19} weight="duotone" /> VERIFIED ACTION</span><button onClick={() => finish(false)} aria-label="Cancel transaction"><X size={18} /></button></header>
        <div className="gpu-tx-pass"><CheckCircle size={20} weight="fill" /><span><b>Preflight simulation passed</b><small>The exact call below executed successfully against current chain state.</small></span></div>
        <h2 id="gpu-tx-title">Review before wallet.</h2>
        <p>Your wallet should show the same token, receiver, and amount. Reject it if anything differs.</p>
        <dl>
          <div><dt>Game action</dt><dd>{pending.preview.action}</dd></div>
          <div><dt>You send</dt><dd className="is-amount">{pending.preview.amount} {pending.preview.tokenSymbol}</dd></div>
          <div><dt>Method</dt><dd>{pending.preview.method}</dd></div>
          <div><dt>Native value</dt><dd>{pending.preview.nativeValue}</dd></div>
          <div><dt>Network</dt><dd>{pending.preview.network} · {pending.preview.chainId}</dd></div>
          <div><dt>Token contract</dt><dd title={pending.preview.tokenAddress}>{short(pending.preview.tokenAddress)}</dd></div>
          <div><dt>Protocol treasury</dt><dd title={pending.preview.treasuryAddress}>{short(pending.preview.treasuryAddress)}</dd></div>
        </dl>
        <div className="gpu-tx-no-approval"><b>No approval. No unlimited allowance.</b><span>This is one direct ERC-20 transfer. GPU cannot spend from your wallet later.</span></div>
        <footer><button className="btn-secondary" onClick={() => finish(false)}>Cancel</button><button className="btn-primary" onClick={() => finish(true)}>Continue to wallet</button></footer>
      </section>
    </div>
  );
}
