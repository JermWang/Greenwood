'use client';

import { create } from 'zustand';
import { api, type UserOperation, type ProtocolOverview } from './api-client';
import { DEV_WALLET } from './dev-mode';
import { DEMO_COOKIE, isDemoWallet } from './demo';

// Polls the game API (operation every 15s, overview every 30s — same cadence
// as the original) and exposes shared state + refresh triggers.

interface OperationState {
  wallet: string | null;
  op: UserOperation | null;
  overview: ProtocolOverview | null;
  loading: boolean;
  error: string | null;
  selectedNodeId: string | null;
  setWallet: (w: string | null) => void;
  selectNode: (id: string | null) => void;
  refresh: () => Promise<void>;
  refreshOverview: () => Promise<void>;
}

let opTimer: ReturnType<typeof setInterval> | null = null;
let ovTimer: ReturnType<typeof setInterval> | null = null;

export const useOperation = create<OperationState>()((set, get) => ({
  wallet: null,
  op: null,
  overview: null,
  loading: false,
  error: null,
  selectedNodeId: null,

  setWallet: (wallet) => {
    if (get().wallet === wallet) return;
    set({ wallet, op: null, selectedNodeId: null });
    if (opTimer) clearInterval(opTimer);
    if (ovTimer) clearInterval(ovTimer);
    if (wallet) {
      const tick = () => get().refresh();
      const tickOv = () => get().refreshOverview();
      setTimeout(tick, 400);
      tickOv();
      opTimer = setInterval(tick, 15_000);
      ovTimer = setInterval(tickOv, 30_000);
    }
  },

  selectNode: (selectedNodeId) => set({ selectedNodeId }),

  refresh: async () => {
    const wallet = get().wallet;
    if (!wallet) return;
    set({ loading: true });
    try {
      const op = await api.operation(wallet);
      set({ op, error: null, loading: false });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'API unreachable';
      // Privy rotates its tokens, so a poll can land in the gap while one is
      // being reissued. That is a sub-second condition, but the poll only runs
      // every 15s — surfacing it immediately would put "sign-in could not be
      // verified" in front of a user whose sign-in is perfectly fine. Give it
      // one quick retry and only report an auth failure that actually persists.
      if (/\b401\b|auth|privy|token|unauthor/i.test(message)) {
        await new Promise((resolve) => setTimeout(resolve, 1200));
        if (get().wallet !== wallet) return;
        try {
          const op = await api.operation(wallet);
          set({ op, error: null, loading: false });
          return;
        } catch {
          /* fall through to reporting the original failure */
        }
      }
      set({ error: message, loading: false });
    }
  },

  refreshOverview: async () => {
    try {
      const overview = await api.overview();
      set({ overview });
    } catch {
      /* keep last */
    }
  },
}));

/**
 * Sign in automatically when the dev wallet bypass is on.
 *
 * Goes through setWallet rather than seeding the wallet in the initialiser,
 * because setWallet is what starts the two polling timers — a seeded value
 * would leave the dashboard holding an address it never fetches anything for,
 * which looks exactly like a hung request.
 *
 * DEV_WALLET is null in every production build and on every deployed
 * environment, so this is a no-op everywhere real.
 */
if (DEV_WALLET) {
  useOperation.getState().setWallet(DEV_WALLET);
}

/**
 * Resume a demo session on load.
 *
 * The cookie is the source of truth for which demo account a browser is, and it
 * is deliberately readable from JS so this can happen without a round trip —
 * otherwise every reload would flash the connect screen before the demo came
 * back, which reads as having been signed out.
 *
 * Runs after the DEV_WALLET branch and only when that did not fire, so a
 * developer with the bypass on does not have it silently replaced by a demo
 * cookie left over from testing the demo.
 */
if (!DEV_WALLET && typeof document !== 'undefined') {
  const cookie = document.cookie
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${DEMO_COOKIE}=`))
    ?.slice(DEMO_COOKIE.length + 1);
  if (cookie && isDemoWallet(cookie)) {
    useOperation.getState().setWallet(cookie.toLowerCase());
  }
}
