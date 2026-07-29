'use client';

// Click-to-copy contract address for the landing hero, or a placeholder.
//
// Until the token exists this shows "Coming soon" rather than disappearing. The
// slot is a thing people look for on a token site, and an empty header reads as
// "there is no token" instead of "not yet" — the announcement is the point, so
// the space is held deliberately.
//
// What it must NEVER do is hand over an address that is not real. A copy button
// serving the zero address is worse than no button at all: someone pastes it
// into a wallet or a scanner and gets nowhere, with no clue why. So the
// placeholder is not a button, carries no address, and cannot be copied — the
// only path to a clipboard write is a configured address.

import { useCallback, useState } from 'react';
import { Copy, Check } from '@phosphor-icons/react';
import { CHAIN, BNTY_TOKEN_ADDRESS, isConfiguredAddress } from '@/lib/config';

export default function CopyContract() {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(BNTY_TOKEN_ADDRESS);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard can be blocked by permissions or a non-secure context. The
      // address stays selectable on screen, so leave it visible and say nothing
      // rather than flashing a success state that did not happen.
    }
  }, []);

  /*
   * Two separate reasons to withhold an address, one placeholder.
   *
   * Either the token does not exist yet, or it exists and is deliberately kept
   * off the site — a soft launch where the CA is announced separately. Setting
   * NEXT_PUBLIC_OSR_TOKEN turns settlement on; NEXT_PUBLIC_SHOW_CA is what
   * publishes it here, so the two stay independently flippable.
   *
   * A visitor cannot tell those apart and should not have to: both mean "not
   * yet", so both say so.
   */
  const published = isConfiguredAddress(BNTY_TOKEN_ADDRESS) && process.env.NEXT_PUBLIC_SHOW_CA === '1';

  if (!published) {
    return (
      <span
        className="gw-topbar-ca gw-topbar-ca-soon glass-control pointer-events-auto flex items-center gap-2 rounded-full px-4 py-2 font-mono text-[11px] uppercase tracking-[.14em]"
        title={`The BNTY contract address will be published here at launch on ${CHAIN.name}`}
      >
        <span className="gw-topbar-ca-label">CA</span>
        <span>Coming soon</span>
      </span>
    );
  }

  const short = `${BNTY_TOKEN_ADDRESS.slice(0, 6)}…${BNTY_TOKEN_ADDRESS.slice(-4)}`;

  return (
    <button
      type="button"
      onClick={copy}
      title={`Copy the BNTY contract address on ${CHAIN.name}`}
      aria-label={`Copy BNTY contract address ${BNTY_TOKEN_ADDRESS}`}
      className="gw-topbar-ca glass-control pointer-events-auto flex items-center gap-2 rounded-full border-amber-400/30 px-4 py-2 font-mono text-[11px] uppercase tracking-[.14em] text-amber-100/80 transition hover:border-amber-400/60 hover:text-amber-200"
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
