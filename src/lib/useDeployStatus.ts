'use client';

// Deploy awareness for the client.
//
// Polls /api/status and exposes two things the UI needs during a release:
//
//   deploying   — a deploy window is open, so risky actions must be refused.
//                 A spend sends GPU on-chain BEFORE the server records anything,
//                 so a cutover landing between those two steps costs the player
//                 real tokens and leaves us owing a refund. Refusing to start is
//                 far cheaper than reconciling afterwards.
//
//   stale       — the server is now serving a different build than the one this
//                 tab loaded. The tab reloads itself onto the new version.
//
// Reloading is deferred while an action is in flight: interrupting a settle
// mid-flight is the exact failure this is meant to prevent.

import { create } from 'zustand';

const POLL_MS = 10_000;

interface StatusResponse {
  buildId: string;
  serverTime: number;
  deploy: { until: number; startedAt: number | null } | null;
}

interface DeployState {
  /** Build id this tab loaded against; set on the first successful poll. */
  loadedBuildId: string | null;
  deploying: boolean;
  /** Seconds left in the announced window, or null when none is open. */
  secondsLeft: number | null;
  /** A newer build is serving; this tab is out of date. */
  stale: boolean;
  /** Set by the UI while an action is running, to defer reloads. */
  busy: boolean;
  setBusy: (busy: boolean) => void;
  start: () => void;
  stop: () => void;
}

let timer: ReturnType<typeof setInterval> | null = null;
let ticker: ReturnType<typeof setInterval> | null = null;

export const useDeployStatus = create<DeployState>()((set, get) => ({
  loadedBuildId: null,
  deploying: false,
  secondsLeft: null,
  stale: false,
  busy: false,

  setBusy: (busy) => {
    set({ busy });
    // A reload that was held back while an action ran should happen as soon as
    // that action finishes, rather than waiting for the next poll.
    if (!busy && get().stale) reloadSoon();
  },

  start: () => {
    if (timer) return;

    const poll = async () => {
      try {
        const res = await fetch('/api/status', { cache: 'no-store' });
        if (!res.ok) return; // a cutover briefly 502s; just wait for the next tick
        const data = (await res.json()) as StatusResponse;

        const known = get().loadedBuildId;
        if (known == null) set({ loadedBuildId: data.buildId });

        const stale = known != null && data.buildId !== known && data.buildId !== 'dev';
        const until = data.deploy?.until ?? null;
        set({
          stale,
          deploying: until != null,
          // Derived from the server's clock, so a wrong local clock cannot
          // show a nonsense countdown.
          secondsLeft: until == null ? null : Math.max(0, Math.round((until - data.serverTime) / 1000)),
        });

        if (stale && !get().busy) reloadSoon();
      } catch {
        // Offline or mid-cutover. Keep the last known state and retry.
      }
    };

    void poll();
    timer = setInterval(poll, POLL_MS);
    // Local 1s countdown between polls so the timer moves smoothly.
    ticker = setInterval(() => {
      const left = get().secondsLeft;
      if (left != null && left > 0) set({ secondsLeft: left - 1 });
    }, 1000);
  },

  stop: () => {
    if (timer) clearInterval(timer);
    if (ticker) clearInterval(ticker);
    timer = null;
    ticker = null;
  },
}));

let reloading = false;
function reloadSoon() {
  if (reloading) return;
  reloading = true;
  // A beat so the "updated" banner is actually readable before the page goes.
  setTimeout(() => window.location.reload(), 2500);
}
