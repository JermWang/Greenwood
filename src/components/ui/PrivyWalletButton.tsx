'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useIdentityToken, usePrivy, useWallets } from '@privy-io/react-auth';
import { api } from '@/lib/api-client';
import { CHAIN, TOKEN_LIVE } from '@/lib/config';
import { type Eip1193Provider, shortAddress, useEvmWallet } from '@/lib/evm';
import { useWalletStore } from '@/lib/store';
import { useOperation } from '@/lib/useOperation';

function displayBalance(value: string | null, digits = 5) {
  if (value == null) return '—';
  const numeric = Number(value);
  return Number.isFinite(numeric)
    ? numeric.toLocaleString(undefined, { maximumFractionDigits: digits })
    : value;
}

export default function PrivyWalletButton() {
  const { ready, authenticated, user, login, logout, linkWallet } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();
  const { identityToken } = useIdentityToken();
  const attachProvider = useEvmWallet((state) => state.attachProvider);
  const disconnectProvider = useEvmWallet((state) => state.disconnect);
  const nativeBalance = useEvmWallet((state) => state.nativeBalance);
  const osrBalance = useEvmWallet((state) => state.osrBalance);
  const osrSymbol = useEvmWallet((state) => state.osrSymbol);
  const walletError = useEvmWallet((state) => state.error);
  const setStoreWallet = useWalletStore((state) => state.setWallet);
  const setOperationWallet = useOperation((state) => state.setWallet);
  const [open, setOpen] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const synced = useRef<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const managedWallet = useMemo(
    () =>
      wallets.find(
        (wallet) =>
          wallet.walletClientType === 'privy' || wallet.walletClientType === 'privy-v2'
      ) ?? wallets[0],
    [wallets]
  );

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  useEffect(() => {
    if (!ready || !walletsReady || !authenticated || !managedWallet) return;
    let cancelled = false;
    void (async () => {
      try {
        await managedWallet.switchChain(CHAIN.id);
        const provider = await managedWallet.getEthereumProvider();
        const address = await attachProvider(
          provider as unknown as Eip1193Provider,
          managedWallet.address,
          `privy:${managedWallet.walletClientType}`
        );
        if (cancelled || !address) return;
        // Both stores wait for the identity token, not just the operation one.
        // Privy issues it asynchronously and every authenticated route requires
        // it, so publishing the wallet earlier makes whichever page is mounted
        // fire its opening request against a session the server will reject.
        // The command screen recovered on its next poll; Inventory, Ops and
        // Profile fetch once on mount and showed "Privy authentication
        // required" until a manual reload. This effect re-runs when the token
        // lands, and both setters no-op on an unchanged wallet.
        if (!identityToken) return;
        setStoreWallet(address);
        setOperationWallet(address);
      } catch (error) {
        if (!cancelled) {
          setSyncError(error instanceof Error ? error.message : 'Privy wallet initialization failed');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    ready,
    walletsReady,
    authenticated,
    managedWallet,
    identityToken,
    attachProvider,
    setStoreWallet,
    setOperationWallet,
  ]);

  useEffect(() => {
    if (!authenticated || !identityToken || !managedWallet) return;
    const key = `${user?.id ?? ''}:${managedWallet.address.toLowerCase()}`;
    if (synced.current === key) return;
    synced.current = key;
    void api.privySession(managedWallet.address).catch((error) => {
      synced.current = null;
      setSyncError(error instanceof Error ? error.message : 'Privy session sync failed');
    });
  }, [authenticated, identityToken, managedWallet, user?.id]);

  if (!ready || (authenticated && !walletsReady)) {
    return <button className="btn-primary text-xs" disabled>Syncing operator…</button>;
  }

  if (!authenticated) {
    return (
      <button className="btn-primary text-xs" onClick={() => login()}>
        Initialize operator
      </button>
    );
  }

  if (!managedWallet) {
    return <button className="btn-primary text-xs" disabled>Opening uplink…</button>;
  }

  // Wallet is the only login route, so the account is normally the operator's
  // own. Only label it as embedded when it genuinely is one.
  const isEmbedded =
    managedWallet.walletClientType === 'privy' || managedWallet.walletClientType === 'privy-v2';

  return (
    <div className="relative flex items-center gap-2" ref={menuRef}>
      <button
        className="fab-operator-button"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="fab-operator-avatar">{managedWallet.address.slice(2, 4).toUpperCase()}</span>
        <span className="hidden text-left sm:block">
          <span className="block text-[8px] uppercase tracking-[.18em] text-sky-100/40">Operator linked</span>
          <span className="mt-0.5 block font-mono text-[10px] text-white">{shortAddress(managedWallet.address)}</span>
        </span>
      </button>
      {open && (
        <div className="fab-account-menu">
          <div className="fab-account-balance">
            <p className="truncate text-xs text-steel-300">
              {shortAddress(managedWallet.address)}
            </p>
            <p className="mt-1 font-mono text-[8px] uppercase tracking-[.16em] text-lime-300">
              {isEmbedded ? 'Managed operator key' : 'Self-custodied operator key'} · mainnet
            </p>
            <div className="mt-3 flex items-center justify-between text-xs">
              <span className="text-steel-400">ETH balance</span>
              <span className="font-mono text-white">{displayBalance(nativeBalance)} ETH</span>
            </div>
            <div className="mt-1.5 flex items-center justify-between text-xs">
              <span className="text-steel-400">Token balance</span>
              <span className="font-mono text-white">
                {TOKEN_LIVE
                  ? `${displayBalance(osrBalance, 3)} ${osrSymbol}`
                  : 'Not live yet'}
              </span>
            </div>
          </div>
          {(syncError || walletError) && (
            <p className="px-2 py-2 text-[11px] text-red-400">{syncError || walletError}</p>
          )}
          <button
            className="fab-account-action mt-1"
            onClick={() => void navigator.clipboard.writeText(managedWallet.address)}
          >
            Copy operator address
          </button>
          <button
            className="fab-account-action"
            onClick={() => linkWallet()}
          >
            Link MetaMask / Robinhood Wallet
          </button>
          <a
            className="fab-account-action block"
            href={`${CHAIN.explorer}/address/${managedWallet.address}`}
            target="_blank"
            rel="noreferrer"
          >
            Inspect on Blockscout ↗
          </a>
          <button
            className="fab-account-action text-rose-300"
            onClick={() => {
              setOpen(false);
              synced.current = null;
              disconnectProvider();
              setStoreWallet(null);
              setOperationWallet(null);
              void logout();
            }}
          >
            Sign out
          </button>
          <p className="mt-1 border-t border-white/10 px-3 py-2 text-[9px] leading-relaxed text-sky-100/35">
            GPU never stores raw private keys. Privy secures wallet key material and session recovery.
          </p>
        </div>
      )}
    </div>
  );
}
