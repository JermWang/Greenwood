'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
      wallet: null,
      onboarded: [],
      theme: 'sunset',
      acceptTerms: () => set({ termsAcceptedAt: Date.now() }),
      setWallet: (wallet) => set({ wallet }),
      isOnboarded: (w) => get().onboarded.includes(w),
      markOnboarded: (w) =>
        set((s) => (s.onboarded.includes(w) ? s : { onboarded: [...s.onboarded, w] })),
      setTheme: (theme) => set({ theme }),
    }),
    { name: 'gpu-wallet-store' }
  )
);
