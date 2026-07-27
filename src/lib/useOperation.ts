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
/**
 * The dev wallet, for the mount effect to sign in with.
 *
 * This used to call setWallet HERE, at module scope — and that is a store write
 * during hydration, which React can render straight past. The symptom was the
 * Machine Room intermittently falling back to its "Walk the floor first" gate
 * with a dev wallet configured, which reads as the bypass being broken.
 *
 * It is the same bug the demo had, found twice for the same reason: signing
 * somebody in is a MOUNT concern, not an import concern. Both now go through the
 * effect in DemoButton.
 */
export const AUTO_WALLET = DEV_WALLET;

/**
 * The demo account this browser holds a cookie for, if any.
 *
 * A getter rather than a module-level side effect. Resuming used to happen here,
 * at import time, and it did not survive a reload: this module is evaluated
 * during hydration, and a store written before React has mounted is a store
 * React then renders past — the demo cookie was present, the fund was gone, and
 * the connect button was back. A refresh losing the fund somebody has spent ten
 * minutes building is about the worst thing a demo can do.
 *
 * The resume now runs in an effect (see DemoSession in DemoButton), which is
 * ordered against mount rather than against module evaluation.
 */
export function demoWalletFromCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const cookie = document.cookie
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${DEMO_COOKIE}=`))
    ?.slice(DEMO_COOKIE.length + 1);
  return cookie && isDemoWallet(cookie) ? cookie.toLowerCase() : null;
}
