'use client';

// Wallet connect + sign-in for injected EVM wallets (MetaMask, Rabby, Robinhood
// Wallet, any EIP-6963 provider). A connected, signed-in provider is the only
// accepted identity; generated guest addresses are intentionally unsupported.
//
// Two steps, deliberately separate. CONNECTING exposes the address and lets the
// UI show balances — it grants nothing on the server. SIGNING IN produces a
// session by signing a server nonce, and only then does the game bind to the
// wallet. A wallet can be connected without a session (cookie expired, first
// visit), which is why "Sign in" is its own control rather than folded into
// connect.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useEvmWallet, isWrongChain, shortAddress } from '@/lib/evm';
import { useWalletStore } from '@/lib/store';
import { useOperation } from '@/lib/useOperation';
import { CHAIN, TOKEN_LIVE } from '@/lib/config';
import { signInWithWallet } from '@/lib/sign-in';
import { api } from '@/lib/api-client';

function displayBalance(value: string | null, digits = 5): string {
  if (value == null) return '—';
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toLocaleString(undefined, { maximumFractionDigits: digits }) : value;
}

export default function WalletButton() {
  const {
    wallets,
    address,
    chainId,
    nativeBalance,
    bntyBalance,
    bntySymbol,
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
  const [signedIn, setSignedIn] = useState(false);
  const [signing, setSigning] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => initialize(), [initialize]);

  /**
   * Bind the game to a signed-in wallet, and only a signed-in one.
   *
   * setOpWallet starts the authenticated polling, so calling it before there is
   * a session would fire a burst of 401s. It runs from exactly two places: the
   * mount check below when a live cookie already exists, and the sign-in handler
   * once a fresh session is created.
   */
  const bind = useCallback(
    (wallet: string) => {
      setSignedIn(true);
      setStoreWallet(wallet);
      setOpWallet(wallet);
    },
    [setStoreWallet, setOpWallet]
  );

  /**
   * Restore a session on load without prompting.
   *
   * The cookie outlives the page, so a returning player is already signed in and
   * must not be asked to sign again. personal_sign also wants a user gesture, so
   * a mount-time prompt is the wrong thing anyway — if there is no live session,
   * the player clicks Sign in.
   */
  useEffect(() => {
    let live = true;
    void api
      .session()
      .then((s) => {
        if (live && s.authenticated && s.wallet) bind(s.wallet);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [bind]);

  const doSignIn = useCallback(
    async (addr: string) => {
      setSigning(true);
      setSignError(null);
      try {
        const wallet = await signInWithWallet(addr);
        bind(wallet);
        setOpen(false);
      } catch (e) {
        setSignError(e instanceof Error ? e.message : 'Sign-in failed');
      } finally {
        setSigning(false);
      }
    },
    [bind]
  );

  useEffect(() => {
    const onDocumentPointer = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocumentPointer);
    return () => document.removeEventListener('mousedown', onDocumentPointer);
  }, []);

  const signOut = useCallback(() => {
    void api.logout().catch(() => {});
    disconnect();
    setSignedIn(false);
    setStoreWallet(null);
    setOpWallet(null);
  }, [disconnect, setStoreWallet, setOpWallet]);

  // Connected but not signed in: the wallet is attached (balances work) but the
  // game is not bound to it yet. One control, one job.
  if (address && !signedIn) {
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
          <button className="btn-primary !py-1.5 text-sm" onClick={() => void doSignIn(address)} disabled={signing}>
            {signing ? 'Check your wallet…' : 'Sign in'}
          </button>
        )}
        <button
          className="rounded border border-steel-500/60 bg-ink-800 px-3 py-1.5 font-mono text-xs text-steel-200 hover:border-lime-400"
          onClick={signOut}
          title="Disconnect"
        >
          {shortAddress(address)}
        </button>
        {signError && <span className="text-[11px] text-red-400">{signError}</span>}
      </div>
    );
  }

  if (address && signedIn) {
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
          <span className="hidden rounded border border-lime-500/30 bg-lime-500/10 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-lime-300 sm:block">
            RH Mainnet
          </span>
        )}
        <button
          className="rounded border border-steel-500/60 bg-ink-800 px-3 py-1.5 font-mono text-xs text-steel-200 hover:border-lime-400"
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
                  {TOKEN_LIVE ? `${displayBalance(bntyBalance, 3)} ${bntySymbol}` : 'Not live yet'}
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
                signOut();
              }}
            >
              Sign out
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
                // Connect and sign are one gesture from the player's side: they
                // clicked their wallet, so the signature prompt that follows is
                // expected rather than a surprise.
                if (connected) await doSignIn(connected);
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
              <span className="ml-auto font-mono text-[9px] uppercase text-lime-400">Detected</span>
            </button>
          ))}
          {initialized && wallets.length === 0 && (
            <div className="px-3 py-3 text-xs leading-relaxed text-steel-400">
              No injected EVM wallet was detected. Install MetaMask, Rabby, or Robinhood Wallet,
              then reload this page.
            </div>
          )}
          {!initialized && <div className="px-3 py-3 text-xs text-steel-400">Detecting wallets…</div>}
          {(error || signError) && <p className="px-3 py-2 text-[11px] text-red-400">{error ?? signError}</p>}
          <div className="mt-1 border-t border-ink-600 px-3 py-2 text-[10px] leading-relaxed text-steel-500">
            Signing in is a free signature — it proves you own the wallet and never moves funds or
            approves a transaction. Evergreen never receives your private key.
          </div>
        </div>
      )}
    </div>
  );
}
