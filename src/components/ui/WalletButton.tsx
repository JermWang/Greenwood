'use client';

// EIP-6963 wallet selector for MetaMask, Rabby, Robinhood Wallet, and other
// injected EVM wallets. A connected provider is the only accepted identity;
// generated guest addresses are intentionally unsupported.

import { useEffect, useRef, useState } from 'react';
import { useEvmWallet, isWrongChain, shortAddress } from '@/lib/evm';
import { useWalletStore } from '@/lib/store';
import { useOperation } from '@/lib/useOperation';
import { CHAIN, TOKEN_LIVE } from '@/lib/config';
import { PRIVY_CONFIGURED } from '@/lib/config';
import PrivyWalletButton from './PrivyWalletButton';

function displayBalance(value: string | null, digits = 5): string {
  if (value == null) return '—';
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toLocaleString(undefined, { maximumFractionDigits: digits }) : value;
}

export default function WalletButton() {
  return PRIVY_CONFIGURED ? <PrivyWalletButton /> : <InjectedWalletButton />;
}

function InjectedWalletButton() {
  const {
    wallets,
    address,
    chainId,
    nativeBalance,
    osrBalance,
    osrSymbol,
    connecting,
    initialized,
    error,
    initialize,
    connect,
    switchToRobinhood,
    refreshBalances,
    disconnect,
  } = useEvmWallet();
  const setStoreWallet = useWalletStore((state) => state.setWallet);
  const setOpWallet = useOperation((state) => state.setWallet);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => initialize(), [initialize]);

  useEffect(() => {
    if (address) {
      setStoreWallet(address);
      setOpWallet(address);
    } else if (initialized) {
      // Clear legacy generated guest addresses from persisted state.
      setStoreWallet(null);
      setOpWallet(null);
    }
  }, [address, initialized, setStoreWallet, setOpWallet]);

  useEffect(() => {
    const onDocumentPointer = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocumentPointer);
    return () => document.removeEventListener('mousedown', onDocumentPointer);
  }, []);

  if (address) {
    const wrongChain = isWrongChain(chainId);
    return (
      <div className="relative flex items-center gap-2" ref={menuRef}>
        {wrongChain ? (
          <button
            className="rounded border border-red-500/60 bg-red-500/10 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-red-300"
            onClick={() => void switchToRobinhood()}
            disabled={connecting}
          >
            Switch network
          </button>
        ) : (
          <span className="hidden rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-emerald-300 sm:block">
            RH Mainnet
          </span>
        )}
        <button
          className="rounded border border-steel-500/60 bg-ink-800 px-3 py-1.5 font-mono text-xs text-steel-200 hover:border-amber-500"
          onClick={() => setOpen((current) => !current)}
        >
          {shortAddress(address)}
        </button>
        {open && (
          <div className="absolute right-0 top-full z-50 mt-1 w-64 rounded border border-ink-600 bg-ink-800 p-2 shadow-xl">
            <div className="rounded border border-ink-600 bg-ink-900/60 p-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-steel-400">ETH balance</span>
                <span className="font-mono text-white">{displayBalance(nativeBalance)} ETH</span>
              </div>
              <div className="mt-1.5 flex items-center justify-between text-xs">
                <span className="text-steel-400">Token balance</span>
                <span className="font-mono text-white">
                  {TOKEN_LIVE ? `${displayBalance(osrBalance, 3)} ${osrSymbol}` : 'Not live yet'}
                </span>
              </div>
            </div>
            {error && <p className="px-2 py-2 text-[11px] text-red-400">{error}</p>}
            <button
              className="mt-1 w-full rounded px-3 py-2 text-left text-xs text-steel-300 hover:bg-ink-700"
              onClick={() => void refreshBalances()}
              disabled={wrongChain}
            >
              Refresh balances
            </button>
            <a
              className="block w-full rounded px-3 py-2 text-left text-xs text-steel-300 hover:bg-ink-700"
              href={`${CHAIN.explorer}/address/${address}`}
              target="_blank"
              rel="noreferrer"
            >
              View on Blockscout ↗
            </a>
            <button
              className="w-full rounded px-3 py-2 text-left text-xs text-steel-300 hover:bg-ink-700"
              onClick={() => {
                setOpen(false);
                disconnect();
                setStoreWallet(null);
                setOpWallet(null);
              }}
            >
              Disconnect
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative" ref={menuRef}>
      <button className="btn-primary !py-1.5 text-sm" onClick={() => setOpen((current) => !current)} disabled={connecting}>
        {connecting ? 'Connecting…' : 'Connect Wallet'}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-72 rounded border border-ink-600 bg-ink-800 p-1.5 shadow-xl">
          <div className="px-2 pb-1.5 pt-1 font-mono text-[10px] uppercase tracking-widest text-steel-500">
            {CHAIN.name} · chain {CHAIN.id}
          </div>
          {wallets.map((wallet) => (
            <button
              key={wallet.uuid}
              className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm text-steel-200 hover:bg-ink-700"
              onClick={async () => {
                const connected = await connect(wallet.uuid);
                if (connected) setOpen(false);
              }}
            >
              {wallet.icon ? (
                // Wallet icons are announced by the installed EIP-6963 provider.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={wallet.icon} alt="" className="h-6 w-6 rounded" />
              ) : (
                <span className="grid h-6 w-6 place-items-center rounded bg-ink-700">◇</span>
              )}
              <span className="min-w-0 truncate">{wallet.name}</span>
              <span className="ml-auto font-mono text-[9px] uppercase text-emerald-400">Detected</span>
            </button>
          ))}
          {initialized && wallets.length === 0 && (
            <div className="px-3 py-3 text-xs leading-relaxed text-steel-400">
              No injected EVM wallet was detected. Install MetaMask, Rabby, or Robinhood Wallet,
              then reload this page.
            </div>
          )}
          {!initialized && <div className="px-3 py-3 text-xs text-steel-400">Detecting wallets…</div>}
          {error && <p className="px-3 py-2 text-[11px] text-red-400">{error}</p>}
          <div className="mt-1 border-t border-ink-600 px-3 py-2 text-[10px] leading-relaxed text-steel-500">
            Wallet signatures stay in your extension. Greenwood never receives your private key.
          </div>
        </div>
      )}
    </div>
  );
}
