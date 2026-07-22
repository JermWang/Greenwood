'use client';

import { create } from 'zustand';
import {
  createPublicClient,
  custom,
  defineChain,
  erc20Abi,
  formatEther,
  formatUnits,
  getAddress,
  type Address,
} from 'viem';
import { CHAIN, OSR_TOKEN_ADDRESS, isConfiguredAddress } from './config';

export interface Eip1193Provider {
  request: (args: { method: string; params?: readonly unknown[] | object }) => Promise<unknown>;
  on?: (event: string, callback: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, callback: (...args: unknown[]) => void) => void;
}

interface Eip6963ProviderInfo {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
}

interface Eip6963ProviderDetail {
  info: Eip6963ProviderInfo;
  provider: Eip1193Provider;
}

export interface WalletOption extends Eip6963ProviderInfo {
  provider: Eip1193Provider;
}

declare global {
  interface WindowEventMap {
    'eip6963:announceProvider': CustomEvent<Eip6963ProviderDetail>;
  }
}

const robinhoodChain = defineChain({
  id: CHAIN.id,
  name: CHAIN.name,
  nativeCurrency: CHAIN.nativeCurrency,
  rpcUrls: { default: { http: [CHAIN.rpcUrl] } },
  blockExplorers: { default: { name: 'Blockscout', url: CHAIN.explorer } },
});

interface EvmState {
  wallets: WalletOption[];
  selectedWalletUuid: string | null;
  address: Address | null;
  chainId: number | null;
  nativeBalance: string | null;
  osrBalance: string | null;
  osrSymbol: string;
  connecting: boolean;
  initialized: boolean;
  error: string | null;
  initialize: () => void;
  connect: (walletUuid?: string) => Promise<Address | null>;
  attachProvider: (
    provider: Eip1193Provider,
    address: string,
    walletUuid?: string
  ) => Promise<Address | null>;
  switchToRobinhood: () => Promise<boolean>;
  refreshBalances: () => Promise<void>;
  disconnect: () => void;
}

const discovered = new Map<string, WalletOption>();
let discoveryBound = false;
let activeProvider: Eip1193Provider | null = null;
let activeAccountsChanged: ((...args: unknown[]) => void) | null = null;
let activeChainChanged: ((...args: unknown[]) => void) | null = null;
let activeDisconnect: ((...args: unknown[]) => void) | null = null;

function walletError(error: unknown): string {
  const value = error as { code?: number; shortMessage?: string; message?: string };
  if (value.code === 4001) return 'Wallet request was rejected';
  return value.shortMessage ?? value.message ?? 'Wallet request failed';
}

async function providerChainId(provider: Eip1193Provider): Promise<number> {
  const chainHex = (await provider.request({ method: 'eth_chainId' })) as string;
  return Number.parseInt(chainHex, 16);
}

async function ensureRobinhoodChain(provider: Eip1193Provider): Promise<void> {
  if ((await providerChainId(provider)) === CHAIN.id) return;
  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: CHAIN.hexId }],
    });
  } catch (error) {
    const code = (error as { code?: number })?.code;
    if (code !== 4902) throw error;
    await provider.request({
      method: 'wallet_addEthereumChain',
      params: [
        {
          chainId: CHAIN.hexId,
          chainName: CHAIN.name,
          rpcUrls: [CHAIN.rpcUrl],
          nativeCurrency: CHAIN.nativeCurrency,
          blockExplorerUrls: [CHAIN.explorer],
        },
      ],
    });
  }
}

async function balances(provider: Eip1193Provider, address: Address) {
  const client = createPublicClient({ chain: robinhoodChain, transport: custom(provider) });
  const native = await client.getBalance({ address });
  let osrBalance: string | null = null;
  let osrSymbol = 'GPU';
  if (isConfiguredAddress(OSR_TOKEN_ADDRESS)) {
    const token = getAddress(OSR_TOKEN_ADDRESS);
    const [amount, decimals, symbol] = await Promise.all([
      client.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [address] }),
      client.readContract({ address: token, abi: erc20Abi, functionName: 'decimals' }),
      client.readContract({ address: token, abi: erc20Abi, functionName: 'symbol' }),
    ]);
    osrBalance = formatUnits(amount, decimals);
    osrSymbol = symbol;
  }
  return { nativeBalance: formatEther(native), osrBalance, osrSymbol };
}

function unbindProvider() {
  if (!activeProvider?.removeListener) return;
  if (activeAccountsChanged) activeProvider.removeListener('accountsChanged', activeAccountsChanged);
  if (activeChainChanged) activeProvider.removeListener('chainChanged', activeChainChanged);
  if (activeDisconnect) activeProvider.removeListener('disconnect', activeDisconnect);
  activeProvider = null;
  activeAccountsChanged = null;
  activeChainChanged = null;
  activeDisconnect = null;
}

function addWallet(option: WalletOption) {
  discovered.set(option.uuid, option);
  useEvmWallet.setState({ wallets: [...discovered.values()], initialized: true });
}

async function restoreWallet(option: WalletOption) {
  try {
    const accounts = (await option.provider.request({ method: 'eth_accounts' })) as string[];
    if (!accounts[0]) return;
    const address = getAddress(accounts[0]);
    const chainId = await providerChainId(option.provider);
    activeProvider = option.provider;
    bindProvider(option.provider);
    useEvmWallet.setState({
      address,
      chainId,
      selectedWalletUuid: option.uuid,
      error: null,
    });
    if (chainId === CHAIN.id) {
      useEvmWallet.setState(await balances(option.provider, address));
    }
  } catch {
    // Silent reconnect is best-effort and must never prompt or block discovery.
  }
}

function bindProvider(provider: Eip1193Provider) {
  unbindProvider();
  activeProvider = provider;
  if (!provider.on) return;

  activeAccountsChanged = (...args: unknown[]) => {
    const accounts = args[0] as string[];
    if (!accounts[0]) {
      useEvmWallet.getState().disconnect();
      return;
    }
    const address = getAddress(accounts[0]);
    useEvmWallet.setState({ address, error: null });
    void useEvmWallet.getState().refreshBalances();
  };
  activeChainChanged = (...args: unknown[]) => {
    const chainId = Number.parseInt(args[0] as string, 16);
    useEvmWallet.setState({ chainId, nativeBalance: null, osrBalance: null });
    if (chainId === CHAIN.id) void useEvmWallet.getState().refreshBalances();
  };
  activeDisconnect = () => useEvmWallet.getState().disconnect();
  provider.on('accountsChanged', activeAccountsChanged);
  provider.on('chainChanged', activeChainChanged);
  provider.on('disconnect', activeDisconnect);
}

export const useEvmWallet = create<EvmState>()((set, get) => ({
  wallets: [],
  selectedWalletUuid: null,
  address: null,
  chainId: null,
  nativeBalance: null,
  osrBalance: null,
  osrSymbol: 'GPU',
  connecting: false,
  initialized: false,
  error: null,

  initialize: () => {
    if (typeof window === 'undefined' || discoveryBound) return;
    discoveryBound = true;
    const lastRdns = window.localStorage.getItem('gpu:last-wallet-rdns');
    window.addEventListener('eip6963:announceProvider', (event) => {
      const { info, provider } = event.detail;
      if (!info?.uuid || !provider?.request) return;
      const option = { ...info, provider };
      addWallet(option);
      if (lastRdns && info.rdns === lastRdns) void restoreWallet(option);
    });
    window.dispatchEvent(new Event('eip6963:requestProvider'));
    window.setTimeout(() => {
      const legacyProvider = (window as Window & { ethereum?: Eip1193Provider }).ethereum;
      if (legacyProvider && discovered.size === 0) {
        const fallback: WalletOption = {
          uuid: 'legacy-injected',
          name: 'Browser Wallet',
          icon: '',
          rdns: 'injected.wallet',
          provider: legacyProvider,
        };
        addWallet(fallback);
        void restoreWallet(fallback);
      } else {
        set({ initialized: true });
      }
    }, 150);
  },

  connect: async (walletUuid) => {
    const option =
      (walletUuid ? discovered.get(walletUuid) : undefined) ??
      discovered.get(get().selectedWalletUuid ?? '') ??
      [...discovered.values()][0];
    if (!option) {
      set({ error: 'No compatible EVM wallet was detected' });
      return null;
    }
    set({ connecting: true, error: null });
    try {
      const accounts = (await option.provider.request({ method: 'eth_requestAccounts' })) as string[];
      if (!accounts[0]) throw new Error('The wallet did not return an account');
      await ensureRobinhoodChain(option.provider);
      const address = getAddress(accounts[0]);
      const chainId = await providerChainId(option.provider);
      bindProvider(option.provider);
      window.localStorage.setItem('gpu:last-wallet-rdns', option.rdns);
      set({ address, chainId, selectedWalletUuid: option.uuid, connecting: false });
      await get().refreshBalances();
      return address;
    } catch (error) {
      set({ connecting: false, error: walletError(error) });
      return null;
    }
  },

  attachProvider: async (provider, rawAddress, walletUuid = 'privy-embedded') => {
    set({ connecting: true, error: null });
    try {
      await ensureRobinhoodChain(provider);
      const address = getAddress(rawAddress);
      const chainId = await providerChainId(provider);
      bindProvider(provider);
      set({
        address,
        chainId,
        selectedWalletUuid: walletUuid,
        initialized: true,
        connecting: false,
      });
      await get().refreshBalances();
      return address;
    } catch (error) {
      set({ connecting: false, error: walletError(error) });
      return null;
    }
  },

  switchToRobinhood: async () => {
    if (!activeProvider) return false;
    set({ connecting: true, error: null });
    try {
      await ensureRobinhoodChain(activeProvider);
      set({ chainId: await providerChainId(activeProvider), connecting: false });
      await get().refreshBalances();
      return true;
    } catch (error) {
      set({ connecting: false, error: walletError(error) });
      return false;
    }
  },

  refreshBalances: async () => {
    const { address, chainId } = get();
    if (!activeProvider || !address || chainId !== CHAIN.id) return;
    try {
      set(await balances(activeProvider, address));
    } catch (error) {
      set({ error: `Balance refresh failed: ${walletError(error)}` });
    }
  },

  disconnect: () => {
    unbindProvider();
    set({
      address: null,
      chainId: null,
      selectedWalletUuid: null,
      nativeBalance: null,
      osrBalance: null,
      connecting: false,
      error: null,
    });
  },
}));

export function isWrongChain(chainId: number | null): boolean {
  return chainId !== null && chainId !== CHAIN.id;
}

/** The connected EIP-1193 provider, or null when no wallet is attached. */
export function getActiveProvider(): Eip1193Provider | null {
  return activeProvider;
}

/**
 * Provider guaranteed to be connected and on Robinhood Chain, prompting a
 * network switch if needed. Settlement transactions must never be sent to the
 * wrong chain — the voucher's domain separator is chain-bound and would fail
 * there anyway, but the operator would still pay gas to find out.
 */
export async function requireSettlementProvider(): Promise<Eip1193Provider> {
  if (!activeProvider) throw new Error('Connect a wallet first');
  await ensureRobinhoodChain(activeProvider);
  return activeProvider;
}

export { robinhoodChain };

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
