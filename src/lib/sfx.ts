'use client';

// App-wide sound effects.
//
// Every sound is synthesised with the Web Audio API — no sample files, so there
// is nothing to license, nothing to download, and the whole system adds a few
// KB rather than the hundreds a sound pack would. It shares the trailer's
// approach so every eg-console interaction shares the same compact sonic vocabulary.
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

  /* ---------------------------------------------------------------------
     The world.

     Everything above is UI: a button, a modal, a result. These are things
     that happen to you in a place, and they are mixed lower and duller on
     purpose. A footstep at the volume of a success chime is a footstep you
     will mute the game to escape after ninety seconds of walking.
     -------------------------------------------------------------------- */

  // Axe into wood: a dull thud with the crack riding on top of it.
  chop: (ac) => {
    noise(ac, { dur: 0.09, from: 1800, to: 320, type: 'bandpass', q: 1.2, peak: 0.1 });
    tone(ac, { type: 'triangle', from: 190, to: 110, dur: 0.12, peak: 0.055 });
  },
  // The tree goes over. Longer, and it falls in pitch because it is falling.
  timber: (ac) => {
    noise(ac, { dur: 0.55, from: 900, to: 140, type: 'lowpass', peak: 0.11 });
    tone(ac, { type: 'triangle', from: 150, to: 62, dur: 0.6, peak: 0.06 });
  },
  // Through a doorway. Soft, low, and over quickly — you do this constantly.
  door: (ac) => {
    noise(ac, { dur: 0.2, from: 620, to: 180, type: 'lowpass', peak: 0.07 });
    tone(ac, { type: 'sine', from: 210, to: 300, dur: 0.18, peak: 0.04 });
  },
  // A step. Almost nothing on its own — it is only ever heard in a rhythm.
  step: (ac) => noise(ac, { dur: 0.05, from: 520, to: 190, type: 'lowpass', peak: 0.028 }),
  // Landing a hit on something.
  strike: (ac) => {
    noise(ac, { dur: 0.11, from: 2400, to: 600, type: 'bandpass', q: 0.9, peak: 0.12 });
    tone(ac, { type: 'square', from: 260, to: 150, dur: 0.1, peak: 0.06 });
  },
  // Taking one. Lower than the hit you give, so the two are never confused
  // in a fight — which is the entire job of this pair.
  hurt: (ac) => {
    tone(ac, { type: 'sawtooth', from: 300, to: 90, dur: 0.3, peak: 0.11 });
    noise(ac, { dur: 0.16, from: 400, to: 120, type: 'lowpass', peak: 0.07 });
  },
  // Something went into the pack.
  pickup: (ac) => {
    tone(ac, { type: 'triangle', from: 700, to: 1050, dur: 0.09, peak: 0.07 });
    noise(ac, { dur: 0.06, from: 2600, to: 900, type: 'bandpass', q: 2, peak: 0.05 });
  },
  // Prising material off a salvage node.
  gather: (ac) => {
    noise(ac, { dur: 0.16, from: 1500, to: 380, type: 'bandpass', q: 1.4, peak: 0.09 });
    tone(ac, { type: 'square', from: 320, to: 210, dur: 0.14, peak: 0.045 });
  },
  // A level, a tier, a rung: the one cue allowed to be pleased with itself.
  levelup: (ac) => {
    tone(ac, { type: 'triangle', from: 523, dur: 0.14, peak: 0.09 });
    tone(ac, { type: 'triangle', from: 659, dur: 0.14, peak: 0.085, at: 0.09 });
    tone(ac, { type: 'triangle', from: 784, dur: 0.16, peak: 0.08, at: 0.18 });
    tone(ac, { type: 'sine', from: 1047, dur: 0.35, peak: 0.075, at: 0.27 });
  },
  // Somebody else arrived in the region you are standing in.
  arrive: (ac) => tone(ac, { type: 'sine', from: 480, to: 620, dur: 0.18, peak: 0.045 }),
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
    /*
     * The track follows the toggle, in both directions.
     *
     * Muting has to actually STOP it rather than merely gate new cues: the pad
     * is a set of oscillators that are already running, so a mute that only
     * guards playSfx would silence every click and leave the music playing.
     * Un-muting restarts it only where it belongs — startMenuMusic is a no-op
     * off the menu because nothing there will have asked for it.
     */
    if (next) stopMenuMusic(false);
    else if (wantsMenuMusic) startMenuMusic();
    // A tick on un-mute confirms sound is back; muting is silent by definition.
    if (!next) playSfx('toggle');
  },
}));

// ---------------------------------------------------------------------------
// The menu track
// ---------------------------------------------------------------------------

/**
 * A looping backing track for the menu, synthesised like everything else here.
 *
 * WHY NOT AN MP3. The same three reasons the cues are synthesised, all of which
 * bite harder on music than on a click: there is nothing to license, nothing to
 * download before a first-time visitor hears anything, and nothing to go out of
 * date when the game's tone moves. A two-minute loop is a couple of megabytes
 * that every visitor pays for on a title screen they may leave in four seconds.
 *
 * WHY IT IS NOT A LOOP. It is generative — a drone, a chord that changes every
 * eight bars, and sparse bells placed by a random walk. A recorded loop short
 * enough to ship is short enough to notice, and the moment you notice a loop you
 * start hearing the seam instead of the game. Nothing here repeats exactly.
 *
 * THE TONE is the settlement, not the forest: a minor drone that never resolves,
 * with the bells picking out notes above it. Calm, lit, and slightly wrong —
 * which is the whole of Evergreen before the turn (docs/evergreen-turn.md).
 */

/** Everything the track owns, so stopping it is one disconnect and not a hunt. */
interface Track {
  bus: GainNode;
  voices: OscillatorNode[];
  timer: ReturnType<typeof setInterval> | null;
}
let track: Track | null = null;
/**
 * Whether the screen currently on top WANTS the track.
 *
 * Held separately from whether it is playing, because those differ while muted:
 * a player who mutes on the title screen and un-mutes there should get the music
 * back, and one who un-mutes three rooms into the forest should not.
 */
let wantsMenuMusic = false;

/**
 * The progression, as semitone offsets from the root.
 *
 * i - VI - III - VII in A minor, the four chords that carry most game menus,
 * chosen because none of them is the dominant: there is no V, so nothing ever
 * pulls back to the root and the music never finishes a sentence. That is the
 * point — a title screen that resolves is a title screen that sounds like it is
 * ending every eight bars.
 */
const ROOT = 55; // A1, in Hz
const CHORDS = [
  [0, 3, 7], // i
  [8, 12, 15], // VI
  [3, 7, 10], // III
  [10, 14, 17], // VII
];
/** Notes the bells may use: the minor pentatonic, which cannot land wrong. */
const BELLS = [12, 15, 19, 22, 24, 27];
const semis = (n: number) => ROOT * Math.pow(2, n / 12);

/** How long a chord holds, in seconds. Slow enough to feel like weather. */
const CHORD_S = 8;

/**
 * Start the menu track. Idempotent, and silent while muted.
 *
 * Safe to call on mount: the browser will not let audio begin before a gesture,
 * and `ensure` already handles resuming a suspended context, so the track simply
 * starts the moment the player first touches anything.
 */
export function startMenuMusic() {
  // Recorded before the mute check, so a player who is muted on arrival and
  // un-mutes without leaving the screen still gets the track.
  wantsMenuMusic = true;
  if (track || muted()) return;
  try {
    const ac = ensure();
    if (!ac || !master) return;

    const bus = ac.createGain();
    // Well under the cues. Music that competes with a click is music that gets
    // muted, and the mute takes the click with it.
    bus.gain.setValueAtTime(0.0001, ac.currentTime);
    bus.gain.exponentialRampToValueAtTime(0.18, ac.currentTime + 4);
    bus.connect(master);

    // A low-pass over the whole thing, so the pad sits behind the interface
    // rather than in front of it.
    const warmth = ac.createBiquadFilter();
    warmth.type = 'lowpass';
    warmth.frequency.value = 1400;
    warmth.Q.value = 0.4;
    warmth.connect(bus);

    const voices: OscillatorNode[] = [];

    /** The drone: two oscillators a few cents apart, which is what makes it move. */
    for (const detune of [-6, 6]) {
      const o = ac.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = ROOT;
      o.detune.value = detune;
      const g = ac.createGain();
      g.gain.value = 0.05;
      o.connect(g);
      g.connect(warmth);
      o.start();
      voices.push(o);
    }

    /** Three pad voices, retuned on each chord rather than restarted. */
    const pad = CHORDS[0].map((n) => {
      const o = ac.createOscillator();
      o.type = 'triangle';
      o.frequency.value = semis(n + 24);
      const g = ac.createGain();
      g.gain.value = 0.035;
      o.connect(g);
      g.connect(warmth);
      o.start();
      voices.push(o);
      return o;
    });

    let bar = 0;
    const step = () => {
      const now = ac.currentTime;
      const chord = CHORDS[bar % CHORDS.length];
      // Glide rather than jump. A chord change you can hear arriving is a chord
      // change that draws attention; over two seconds it is just the weather
      // turning.
      pad.forEach((o, i) => o.frequency.exponentialRampToValueAtTime(semis(chord[i] + 24), now + 2));

      // One or two bells per chord, never on the beat, so nothing implies a
      // tempo the rest of the track does not have.
      const hits = Math.random() < 0.55 ? 2 : 1;
      for (let i = 0; i < hits; i += 1) {
        const at = 0.6 + Math.random() * (CHORD_S - 1.6);
        const note = BELLS[Math.floor(Math.random() * BELLS.length)];
        tone(ac, {
          type: 'sine',
          from: semis(note),
          dur: 2.4,
          peak: 0.03 + Math.random() * 0.02,
          attack: 0.02,
          at,
        });
      }
      bar += 1;
    };

    step();
    const timer = setInterval(step, CHORD_S * 1000);
    track = { bus, voices, timer };
  } catch {
    track = null;
  }
}

/**
 * Stop the track and release everything it holds. Safe to call when not playing.
 *
 * `release` says whether the screen is GIVING UP the music or merely silencing
 * it. Leaving the menu releases it; muting does not, so un-muting on the same
 * screen brings the track back rather than leaving somebody who muted once in
 * silence until they navigate away and come back.
 */
export function stopMenuMusic(release = true) {
  if (release) wantsMenuMusic = false;
  const t = track;
  if (!t) return;
  track = null;
  try {
    if (t.timer) clearInterval(t.timer);
    const ac = ctx;
    if (ac) {
      // Fade before stopping: cutting an oscillator at full amplitude is a click,
      // and a click on the way out of the menu is the last thing anybody hears.
      const end = ac.currentTime + 0.6;
      t.bus.gain.cancelScheduledValues(ac.currentTime);
      t.bus.gain.setValueAtTime(Math.max(0.0001, t.bus.gain.value), ac.currentTime);
      t.bus.gain.exponentialRampToValueAtTime(0.0001, end);
      for (const o of t.voices) o.stop(end + 0.05);
      setTimeout(() => t.bus.disconnect(), 800);
    } else {
      for (const o of t.voices) o.stop();
      t.bus.disconnect();
    }
  } catch {
    /* a track that will not stop cleanly must not throw into a route change */
  }
}

/** True while the menu track is running. */
export function menuMusicPlaying(): boolean {
  return track !== null;
}
