'use client';

// App-wide sound effects.
//
// Every sound is synthesised with the Web Audio API — no sample files, so there
// is nothing to license, nothing to download, and the whole system adds a few
// KB rather than the hundreds a sound pack would. It shares the trailer's
// approach so every fab-console interaction shares the same compact sonic vocabulary.
//
// Two rules the browser forces on us, both handled here:
//   - Audio cannot start before a user gesture, so the context is created lazily
//     on the first play and resumed on the first pointer/key event.
//   - Nothing should ever throw into the UI over a sound, so every call is
//     wrapped and failures are swallowed. A muted or unsupported browser simply
//     makes no noise.
//
// Mute state persists in localStorage, so a player who turns sound off stays off
// across visits.

import { create } from 'zustand';

const STORAGE_KEY = 'osr:muted';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

function muted(): boolean {
  return useSfx.getState().muted;
}

/** Lazily build the audio graph; returns null if audio is unavailable. */
function ensure(): AudioContext | null {
  if (ctx) {
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
    return ctx;
  }
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.5; // everything sits well under full scale
    // A gentle compressor keeps stacked sounds from clipping.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.ratio.value = 6;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;
    master.connect(comp);
    comp.connect(ctx.destination);
    return ctx;
  } catch {
    ctx = null;
    return null;
  }
}

/** A single enveloped oscillator — the building block for most cues. */
function tone(
  ac: AudioContext,
  opts: {
    type?: OscillatorType;
    from: number;
    to?: number;
    dur: number;
    peak?: number;
    at?: number; // start offset from now
    attack?: number;
  }
) {
  const t0 = ac.currentTime + (opts.at ?? 0);
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = opts.type ?? 'sine';
  o.frequency.setValueAtTime(opts.from, t0);
  if (opts.to != null) o.frequency.exponentialRampToValueAtTime(Math.max(1, opts.to), t0 + opts.dur);
  const peak = opts.peak ?? 0.14;
  const atk = opts.attack ?? 0.004;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + atk);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
  o.connect(g);
  g.connect(master!);
  o.start(t0);
  o.stop(t0 + opts.dur + 0.02);
}

/** Short filtered-noise burst — used for mechanical / percussive cues. */
function noise(
  ac: AudioContext,
  opts: { dur: number; peak?: number; type?: BiquadFilterType; from: number; to?: number; q?: number; at?: number }
) {
  const t0 = ac.currentTime + (opts.at ?? 0);
  const n = Math.max(1, Math.floor(ac.sampleRate * opts.dur));
  const buf = ac.createBuffer(1, n, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < n; i += 1) data[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buf;
  const flt = ac.createBiquadFilter();
  flt.type = opts.type ?? 'bandpass';
  flt.frequency.setValueAtTime(opts.from, t0);
  if (opts.to != null) flt.frequency.exponentialRampToValueAtTime(Math.max(20, opts.to), t0 + opts.dur);
  if (opts.q != null) flt.Q.value = opts.q;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(opts.peak ?? 0.12, t0 + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
  src.connect(flt);
  flt.connect(g);
  g.connect(master!);
  src.start(t0);
  src.stop(t0 + opts.dur + 0.02);
}

/** The named cues. Each is deliberately short and quiet — UI sound that draws
 *  attention to itself becomes noise fast. */
const CUES: Record<string, (ac: AudioContext) => void> = {
  // Generic press — the tick heard on any button or link across the site.
  tap: (ac) => tone(ac, { type: 'triangle', from: 420, to: 300, dur: 0.05, peak: 0.05 }),
  // Selecting a node or list item — a touch brighter than a tap.
  select: (ac) => tone(ac, { type: 'triangle', from: 620, to: 720, dur: 0.06, peak: 0.06 }),
  // Tabs, switches, lighting presets.
  toggle: (ac) => tone(ac, { type: 'square', from: 380, to: 520, dur: 0.05, peak: 0.045 }),
  // Modal / panel opening and closing.
  open: (ac) => tone(ac, { type: 'sine', from: 300, to: 660, dur: 0.14, peak: 0.06 }),
  close: (ac) => tone(ac, { type: 'sine', from: 560, to: 260, dur: 0.12, peak: 0.055 }),
  // A successful action — a bright rising third.
  success: (ac) => {
    tone(ac, { type: 'sine', from: 660, dur: 0.16, peak: 0.1 });
    tone(ac, { type: 'sine', from: 990, dur: 0.22, peak: 0.09, at: 0.08 });
  },
  // A failed action — a short low buzz, unmistakably "no".
  error: (ac) => {
    tone(ac, { type: 'sawtooth', from: 220, to: 150, dur: 0.22, peak: 0.08 });
    tone(ac, { type: 'square', from: 165, to: 120, dur: 0.24, peak: 0.05 });
  },
  // Deploying a rig — a mechanical thunk with a little metal in it.
  deploy: (ac) => {
    noise(ac, { dur: 0.12, from: 900, to: 200, type: 'lowpass', peak: 0.14 });
    tone(ac, { type: 'square', from: 140, to: 90, dur: 0.16, peak: 0.09 });
  },
  // Claiming rewards — a bright coin-shimmer, three quick notes up.
  claim: (ac) => {
    tone(ac, { type: 'triangle', from: 880, dur: 0.09, peak: 0.09 });
    tone(ac, { type: 'triangle', from: 1170, dur: 0.09, peak: 0.085, at: 0.06 });
    tone(ac, { type: 'triangle', from: 1560, dur: 0.14, peak: 0.08, at: 0.12 });
  },
  // A crate was mined — a soft two-note chime that says "come look".
  notify: (ac) => {
    tone(ac, { type: 'sine', from: 740, dur: 0.16, peak: 0.08 });
    tone(ac, { type: 'sine', from: 1110, dur: 0.24, peak: 0.075, at: 0.11 });
  },
};

export type SfxName = keyof typeof CUES;

/** Play a named cue. Silent when muted or when audio is unavailable. */
export function playSfx(name: SfxName) {
  if (muted()) return;
  try {
    const ac = ensure();
    if (!ac || !master) return;
    CUES[name]?.(ac);
  } catch {
    /* never let a sound break the UI */
  }
}

interface SfxState {
  muted: boolean;
  toggleMuted: () => void;
}

/** Mute preference, persisted so it survives reloads. */
export const useSfx = create<SfxState>((set, get) => ({
  muted: typeof window !== 'undefined' && window.localStorage.getItem(STORAGE_KEY) === '1',
  toggleMuted: () => {
    const next = !get().muted;
    set({ muted: next });
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
    } catch {
      /* private mode — the toggle still works for this session */
    }
    // A tick on un-mute confirms sound is back; muting is silent by definition.
    if (!next) playSfx('toggle');
  },
}));
