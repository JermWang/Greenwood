'use client';

// Click-to-copy contract address for the landing hero.
//
// Renders nothing until the token address is actually configured. A copy button
// that hands someone the zero address is worse than no button — they would
// paste it into a wallet or a scanner and get nowhere, with no clue why.

import { useCallback, useState } from 'react';
import { Copy, Check } from '@phosphor-icons/react';
import { CHAIN, OSR_TOKEN_ADDRESS, isConfiguredAddress } from '@/lib/config';

export default function CopyContract() {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(OSR_TOKEN_ADDRESS);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard can be blocked by permissions or a non-secure context. The
      // address stays selectable on screen, so leave it visible and say nothing
      // rather than flashing a success state that did not happen.
    }
  }, []);

  if (!isConfiguredAddress(OSR_TOKEN_ADDRESS)) return null;

  const short = `${OSR_TOKEN_ADDRESS.slice(0, 6)}…${OSR_TOKEN_ADDRESS.slice(-4)}`;

  return (
    <button
      type="button"
      onClick={copy}
      title={`Copy the GPU contract address on ${CHAIN.name}`}
      aria-label={`Copy GPU contract address ${OSR_TOKEN_ADDRESS}`}
      className="gpu-topbar-ca glass-control pointer-events-auto flex items-center gap-2 rounded-full border-amber-400/30 px-4 py-2 font-mono text-[11px] uppercase tracking-[.14em] text-amber-100/80 transition hover:border-amber-400/60 hover:text-amber-200"
    >
      <span className="text-amber-100/55">CA</span>
      {/* The truncated address is shown so it can be eyeballed against a
          scanner before pasting; the full value is what gets copied. */}
      <span className="tracking-normal">{short}</span>
      {copied ? (
        <>
          <Check size={13} weight="bold" aria-hidden className="text-green-400" />
          <span className="text-green-400">Copied</span>
        </>
      ) : (
        <Copy size={13} weight="bold" aria-hidden />
      )}
    </button>
  );
}
