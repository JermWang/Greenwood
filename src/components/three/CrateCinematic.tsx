'use client';

// Crate-opening cinematic. Phase machine mirrors the original deployment
// (intro → rumble → peak → freeze → detonate → decel → reveal for legendary+;
// shorter track for low tiers), using the Blender-exported v2 crate for the
// rolled rarity. The v2 scene is rotated from Z-up into Three.js Y-up.

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Sparkles } from '@react-three/drei';
import { EffectComposer, Bloom, ChromaticAberration, Vignette } from '@react-three/postprocessing';
import { RARITIES, SLOT_LABELS, type Rarity } from '@/lib/rarity';
import SupplyPod from './CrateModel';
import { RARITY_COLOR, rarityTier } from './fx';
import { COMPONENT_RARITIES } from '@/lib/rarity';
import { RARITY_MULT } from '@/lib/economy';
import type { CrateResult } from '@/lib/api-client';

type Phase = 'intro' | 'rumble' | 'peak' | 'freeze' | 'detonate' | 'decel' | 'reveal';

const HIGH_TRACK: Array<[Phase, number]> = [
  ['intro', 520],
  ['rumble', 1180],
  ['peak', 360],
  ['freeze', 220],
  ['detonate', 360],
  ['decel', 1700],
  ['reveal', 1900],
];
const LOW_TRACK: Array<[Phase, number]> = [
  ['intro', 420],
  ['rumble', 760],
  ['detonate', 300],
  ['decel', 900],
  ['reveal', 1500],
];

const PHASE_LABEL: Record<Phase, string> = {
  intro: 'Acquiring crate signal',
  rumble: 'Reading rarity signature',
  peak: 'Pressure threshold reached',
  freeze: 'Seal lock engaged',
  detonate: 'Unsealing payload',
  decel: 'Stabilising component',
  reveal: 'Component secured',
};

// Tiny WebAudio SFX so the cinematic has weight without shipping audio files.
function playTone(freq: number, dur: number, type: OscillatorType = 'sine', gain = 0.08, sweepTo?: number) {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctor();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    if (sweepTo) o.frequency.exponentialRampToValueAtTime(sweepTo, ctx.currentTime + dur);
    g.gain.value = gain;
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + dur);
    o.onended = () => ctx.close();
  } catch {
    /* audio optional */
  }
}

function CrateModel({ rarity, phase, phaseT }: { rarity: Rarity; phase: Phase; phaseT: number }) {
  // The reveal drives the shared procedural supply pod rather than a GLB, so the
  // crate people open is the same fab-styled object as everywhere else. This
  // group carries the suspend/shake/reveal motion; the pod carries the seam glow
  // and the four-petal burst, fed by the glow and open values below.
  const group = useRef<THREE.Group>(null);
  const podOpen = useRef(0);
  const podGlow = useRef(1.8);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;

    // Seam glow ramp: 1.8 (intro) → 5 (rumble) → 6.5 (peak/freeze) → 12 (detonate+),
    // expressed as the pod's glow units (roughly a fifth of the old intensity).
    const seamI =
      phase === 'intro' ? 1.8
      : phase === 'rumble' ? 1.8 + 3.2 * phaseT
      : phase === 'peak' || phase === 'freeze' ? 6.5
      : 12;
    podGlow.current = (seamI * (0.9 + 0.1 * Math.sin(t * 14))) / 5;

    // The crate starts suspended, tightens into a pressure shake, then eases back
    // through the reveal — one readable silhouette for every rarity.
    if (group.current) {
      const introLift = phase === 'intro' ? 0.32 * (1 - easeOutCubic(phaseT)) : 0;
      const revealFloat = phase === 'decel' || phase === 'reveal' ? 0.08 * Math.sin(t * 1.8) : 0;
      let x = 0;
      let y = introLift + revealFloat;
      let z = 0;
      let scale = phase === 'intro' ? 0.92 + 0.08 * easeOutCubic(phaseT) : 1;
      if (phase === 'rumble' || phase === 'peak') {
        const amp = phase === 'peak' ? 0.052 : 0.012 + 0.025 * phaseT;
        x = amp * Math.sin(t * 61);
        y += amp * Math.sin(t * 53);
        z = amp * Math.sin(t * 47);
        scale = 1 + 0.035 * Math.sin(t * 16) * (phase === 'peak' ? 1 : phaseT);
      }
      group.current.position.set(x, y, z);
      group.current.rotation.y =
        phase === 'detonate'
          ? 0.08 * Math.sin(t * 32) * (1 - phaseT)
          : phase === 'decel' || phase === 'reveal'
            ? 0.11 * Math.sin(t * 0.9)
            : 0.05 * Math.sin(t * 0.6);
      group.current.scale.setScalar(scale);
    }

    podOpen.current =
      phase === 'detonate' ? easeOutCubic(phaseT)
      : phase === 'decel' || phase === 'reveal' ? 1 + 0.15 * phaseT
      : 0;
  });

  return (
    <group ref={group}>
      <PodDriver rarity={rarity} openRef={podOpen} glowRef={podGlow} />
    </group>
  );
}

/**
 * Bridges the phase refs into the shared pod. The pod reads open/glow from props,
 * so this re-renders it only when the driven values change enough to matter,
 * while the parent group is transformed every frame for free.
 */
function PodDriver({
  rarity,
  openRef,
  glowRef,
}: {
  rarity: Rarity;
  openRef: React.MutableRefObject<number>;
  glowRef: React.MutableRefObject<number>;
}) {
  const [state, setState] = useState({ open: 0, glow: 1.8 / 5 });
  useFrame(() => {
    const open = openRef.current;
    const glow = glowRef.current;
    if (Math.abs(open - state.open) > 0.005 || Math.abs(glow - state.glow) > 0.02) {
      setState({ open, glow });
    }
  });
  return <SupplyPod rarity={rarity} open={state.open} glow={state.glow} animate={false} scale={1.1} />;
}

function easeOutCubic(x: number) {
  return 1 - Math.pow(1 - x, 3);
}

function CinematicCamera({ phase, phaseT }: { phase: Phase; phaseT: number }) {
  const { camera } = useThree();
  useFrame(({ clock }) => {
    const cam = camera as THREE.PerspectiveCamera;
    // Dolly-zoom: fov 50 → 34 during rumble, back to 44 on reveal.
    let fov = 50;
    const pos = new THREE.Vector3(0, 2.4, 9.5);
    if (phase === 'rumble' || phase === 'peak' || phase === 'freeze') {
      const k = phase === 'rumble' ? phaseT : 1;
      fov = 50 - 16 * k;
      pos.lerp(new THREE.Vector3(0, 1.55, 5.1), k);
    } else if (phase === 'detonate') {
      fov = 34 + 4 * phaseT;
      pos.set(0, 1.55, 5.1);
      const s = 0.12 * (1 - phaseT);
      pos.x += s * Math.sin(clock.elapsedTime * 90);
      pos.y += s * Math.sin(clock.elapsedTime * 77);
    } else if (phase === 'decel' || phase === 'reveal') {
      fov = 34 + 10 * Math.min(1, phaseT * 1.5);
      pos.set(0, 1.8, 5.6 + phaseT);
    }
    cam.fov += (fov - cam.fov) * 0.15;
    cam.position.lerp(pos, 0.12);
    cam.lookAt(0, 0.8, 0);
    cam.updateProjectionMatrix();
  });
  return null;
}

function CrateStage({ color, phase, phaseT, tier }: { color: string; phase: Phase; phaseT: number; tier: number }) {
  const rings = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (!rings.current) return;
    const charge = phase === 'rumble' || phase === 'peak' || phase === 'freeze';
    const opened = phase === 'detonate' || phase === 'decel' || phase === 'reveal';
    rings.current.rotation.z = clock.elapsedTime * (charge ? 1.5 : 0.35);
    const scale = opened ? 1.05 + 0.42 * Math.min(1, phaseT) : charge ? 0.96 + 0.06 * Math.sin(clock.elapsedTime * 10) : 1;
    rings.current.scale.setScalar(scale);
  });

  const intensity = phase === 'detonate' ? 3.5 + tier * 0.55 : phase === 'decel' || phase === 'reveal' ? 1.5 + tier * 0.2 : 0.25 + tier * 0.12;
  return (
    <group ref={rings} position={[0, 0.15, -0.15]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[2.55, 0.018, 8, 96]} />
        <meshBasicMaterial color={color} transparent opacity={0.18 + tier * 0.035} toneMapped={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, Math.PI / 4]}>
        <torusGeometry args={[3.35, 0.012, 8, 96]} />
        <meshBasicMaterial color={color} transparent opacity={0.1 + tier * 0.02} toneMapped={false} />
      </mesh>
      <pointLight position={[0, 1.1, 1.8]} color={color} intensity={intensity} distance={12} decay={2} />
    </group>
  );
}

const TICKER = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'divine'] as const;

export default function CrateCinematic({
  result,
  onClose,
  onOpenAnother,
}: {
  result: CrateResult;
  onClose: () => void;
  onOpenAnother?: () => void;
}) {
  const rarity = (RARITIES.includes(result.rarity as Rarity) ? result.rarity : 'common') as Rarity;
  const tier = rarityTier(rarity);
  const track = tier >= 4 ? HIGH_TRACK : LOW_TRACK;

  const [phaseIdx, setPhaseIdx] = useState(0);
  const [phaseT, setPhaseT] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [phase, dur] = track[Math.min(phaseIdx, track.length - 1)];
  const done = phaseIdx >= track.length - 1 && phaseT >= 1;
  const showCard = phase === 'reveal' || done;
  const progressMs = track.slice(0, phaseIdx).reduce((total, [, duration]) => total + duration, 0) + phaseT * dur;
  const totalMs = track.reduce((total, [, duration]) => total + duration, 0);
  const progress = Math.min(1, progressMs / totalMs);
  const skipToReveal = useCallback(() => {
    setPhaseIdx(track.length - 1);
    setPhaseT(1);
  }, [track.length]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduceMotion(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (reduceMotion) skipToReveal();
  }, [reduceMotion, skipToReveal]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !showCard) skipToReveal();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showCard, skipToReveal]);

  useEffect(() => {
    if (reduceMotion) return;
    if (phaseIdx >= track.length - 1 && phaseT >= 1) return;
    let raf: number;
    const started = performance.now();
    const tick = () => {
      const t = Math.min(1, (performance.now() - started) / dur);
      setPhaseT(t);
      if (t >= 1 && phaseIdx < track.length - 1) {
        setPhaseIdx((i) => i + 1);
      } else {
        raf = requestAnimationFrame(tick);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phaseIdx, dur, reduceMotion, track.length]);

  // SFX cues per phase entry.
  useEffect(() => {
    if (phase === 'intro') playTone(140, 0.4, 'sine', 0.05);
    if (phase === 'rumble') playTone(52, dur / 1000, 'sawtooth', 0.05, 110);
    if (phase === 'peak') playTone(220, 0.35, 'triangle', 0.07, 440);
    if (phase === 'detonate') {
      playTone(70, 0.5, 'square', 0.11, 36);
      playTone(880, 0.6, 'sine', 0.05, 1760);
    }
    if (phase === 'reveal') playTone(660, 0.8, 'sine', 0.05, 990);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Slot-machine rarity ticker during rumble.
  const tickerRarity =
    phase === 'intro' || phase === 'rumble'
      ? TICKER[Math.floor((phaseT * 14 + phaseIdx * 3) % TICKER.length)]
      : rarity;

  const color = RARITY_COLOR[rarity];
  const label = COMPONENT_RARITIES[rarity].label;
  return (
    <div
      className="crate-cinematic fixed inset-0 z-[70] isolate overflow-hidden bg-[#030405]"
      role="dialog"
      aria-modal="true"
      aria-label="Supply crate opening"
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-80"
        style={{ background: `radial-gradient(circle at 50% 48%, ${color}2c 0%, transparent 27%), radial-gradient(circle at 50% 110%, ${color}15 0%, transparent 52%), linear-gradient(180deg, #090b10 0%, #030405 80%)` }}
      />
      <Canvas
        dpr={[1, 1.75]}
        camera={{ position: [0, 2.4, 9.5], fov: 50 }}
        gl={{ toneMapping: THREE.ACESFilmicToneMapping }}
      >
        <color attach="background" args={['#05060a']} />
        <fog attach="fog" args={['#05060a', 9, 22]} />
        <ambientLight intensity={0.22} />
        <directionalLight position={[4, 8, 6]} intensity={1.9} color="#ffd9a0" />
        <pointLight position={[-4, 2, 2]} color="#79e0b0" intensity={1.1} distance={15} decay={2} />
        <pointLight position={[0, 2.5, 0]} color={color} intensity={phase === 'detonate' || showCard ? 17 : 3.5} distance={16} decay={2} />
        <Suspense fallback={null}>
          <CrateModel rarity={rarity} phase={phase} phaseT={phaseT} />
          <CrateStage color={color} phase={phase} phaseT={phaseT} tier={tier} />
          {(phase === 'rumble' || phase === 'peak') && (
            <Sparkles count={tier >= 4 ? 42 : 22} scale={[3.2, 2.1, 3.2]} size={1.35} speed={0.34} color={color} position={[0, 1.1, 0]} />
          )}
          {(phase === 'detonate' || phase === 'decel' || showCard) && (
            <Sparkles count={tier >= 4 ? 210 : 92} scale={[6.5, 4.5, 6.5]} size={3.2} speed={1.35} color={color} position={[0, 1.5, 0]} />
          )}
        </Suspense>
        <CinematicCamera phase={phase} phaseT={phaseT} />
        <mesh position={[0, -0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[8, 48]} />
          <meshStandardMaterial color="#0c0f16" roughness={0.9} />
        </mesh>
        <EffectComposer>
          <Bloom intensity={1.7} luminanceThreshold={0.9} mipmapBlur radius={0.9} />
          <ChromaticAberration offset={new THREE.Vector2(0.0018, 0.0018)} radialModulation={false} modulationOffset={0} />
          <Vignette offset={0.25} darkness={0.55} />
        </EffectComposer>
      </Canvas>

      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 mx-auto flex max-w-5xl items-start justify-between px-4 pt-5 sm:px-8 sm:pt-8">
        <div className="crate-status-panel w-[min(22rem,calc(100vw-7rem))]" style={{ '--crate-accent': color } as CSSProperties}>
          <div className="flex items-center justify-between gap-4 font-mono text-[9px] uppercase tracking-[0.22em] text-steel-400">
            <span>Supply crate // live unseal</span>
            <span style={{ color }}>{Math.round(progress * 100)}%</span>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
            <div className="crate-progress h-full rounded-full" style={{ width: `${Math.max(3, progress * 100)}%`, backgroundColor: color }} />
          </div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-white/85">{PHASE_LABEL[phase]}</span>
            {!showCard && (
              <span className="font-mono text-[9px] uppercase tracking-[0.14em]" style={{ color: RARITY_COLOR[tickerRarity as Rarity] }}>
                {COMPONENT_RARITIES[tickerRarity as Rarity].label} signal
              </span>
            )}
          </div>
        </div>
        {!showCard && (
          <button className="crate-skip pointer-events-auto" type="button" onClick={skipToReveal}>
            Skip <span aria-hidden="true">Esc</span>
          </button>
        )}
      </div>

      {result.pityTriggered && (
        <div className="pointer-events-none absolute inset-x-0 top-[8.5rem] z-10 flex justify-center px-4">
          <div className="crate-guarantee" style={{ borderColor: color, color }}>
            {result.pityTriggered === 'divine'
              ? 'Divine guarantee triggered'
              : result.pityTriggered === 'mythic'
                ? 'Mythic+ guarantee triggered'
                : 'Legendary+ guarantee triggered'}
          </div>
        </div>
      )}

      {showCard && (
        <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-center px-4 pb-6 sm:pb-10">
          <div
            className="crate-reward-card panel w-full max-w-[25rem] overflow-hidden border-2 p-0 text-center"
            style={{ borderColor: color, boxShadow: `0 0 0 1px ${color}40 inset, 0 20px 80px -28px ${color}dd` }}
            role="status"
            aria-live="assertive"
          >
            <div className="crate-reward-band" style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }} />
            <div className="p-5 sm:p-6">
              <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-steel-400">Component acquired</div>
              <div className="mt-2 font-mono text-sm font-bold uppercase tracking-[0.38em]" style={{ color }}>
                {label}
              </div>
              <div className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                {SLOT_LABELS[result.slot] ?? result.slot}
              </div>
              <div className="mt-5 grid grid-cols-3 divide-x divide-white/10 rounded-xl border border-white/10 bg-black/20 py-3">
                <div>
                  <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-steel-500">Rarity</div>
                  <div className="mt-1 text-xs font-semibold" style={{ color }}>{label}</div>
                </div>
                <div>
                  <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-steel-500">Power</div>
                  <div className="mt-1 text-xs font-semibold text-white">{RARITY_MULT[rarity].toLocaleString()}x</div>
                </div>
                <div>
                  <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-steel-500">Storage</div>
                  <div className="mt-1 text-xs font-semibold text-emerald-300">Inventory</div>
                </div>
              </div>
              {result.isUpgrade && result.previousRarity && (
                <div className="mt-3 rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-200">
                  Upgrade over {COMPONENT_RARITIES[result.previousRarity as Rarity]?.label ?? result.previousRarity}
                </div>
              )}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            {onOpenAnother && (
              <button className="btn-primary" type="button" onClick={onOpenAnother}>
                Open another crate
              </button>
            )}
            <button className="btn-secondary" type="button" onClick={onClose}>
              Back to command
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

// The crate is procedural now — nothing to preload.
