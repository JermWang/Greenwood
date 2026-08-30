'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEV_WALLET } from './dev-mode';
import { carryOverLocal } from './legacy-keys';

const STORE_KEY = 'eg-wallet-store';

// Carried before create(), not inside it: persist() reads storage while the
// store is being built, so a carry-over that ran any later would already have
// lost to an empty rehydration.
carryOverLocal(STORE_KEY);

export type ThemeName = 'sunset' | 'noon' | 'midnight';

interface WalletStore {
  termsAcceptedAt: number | null;
  wallet: string | null;
  onboarded: string[];
  theme: ThemeName;
  acceptTerms: () => void;
  setWallet: (w: string | null) => void;
  isOnboarded: (w: string) => boolean;
  markOnboarded: (w: string) => void;
  setTheme: (t: ThemeName) => void;
}

export const useWalletStore = create<WalletStore>()(
  persist(
    (set, get) => ({
      termsAcceptedAt: null,
      // Signed in as the dev wallet from the first render when the bypass is
      // on, so no screen has to special-case "not connected yet". Null in every
      // build where DEV_WALLET is null, which is every real one.
      wallet: DEV_WALLET,
      onboarded: [],
      theme: 'sunset',
      acceptTerms: () => set({ termsAcceptedAt: Date.now() }),
      setWallet: (wallet) => set({ wallet }),
      isOnboarded: (w) => get().onboarded.includes(w),
      markOnboarded: (w) =>
        set((s) => (s.onboarded.includes(w) ? s : { onboarded: [...s.onboarded, w] })),
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: STORE_KEY,
      /**
       * Rehydration must not undo the dev wallet.
       *
       * The default above only applies to a first-ever visit. Any developer who
       * has run this app before has `wallet: null` sitting in localStorage from
       * a session where they never signed in, and the persisted null would win —
       * so turning the bypass on would appear to do nothing until they cleared
       * site data, which is exactly the kind of thing nobody guesses.
       */
      merge: (persisted, current) => {
        const merged = { ...current, ...(persisted as Partial<WalletStore>) };
        return DEV_WALLET ? { ...merged, wallet: DEV_WALLET } : merged;
      },
    }
  )
);
