'use client';

// The things out here that are not you.
//
// Same flat-shaded box language as everything else — a creature that looked like
// it came from a different renderer would break the one trick this whole zone
// runs on, which is that the Deep Forest is the same world as the Machine Room
// with the lights off.
//
// SILHOUETTE IS THE WHOLE JOB. Under moonlight and fog you will see a shape
// before you see any detail, and you need to know from that shape alone whether
// to run. So the two creatures are built to be unmistakable at a glance and at
// distance: a shambler is upright, narrow and slow with its arms out in front; a
// wolf is low, long and wide-stanced. Nothing about their colour distinguishes
// them, because colour is the first thing fog takes.
//
// Animation is derived from state, never commanded — matching Character. A
// shambler sways because it is a shambler; a wolf's gait comes from whether it
// is moving. Nothing on the wire says "play the walk clip".

import { useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

function hide(color: string, rough = 0.95) {
  return <meshStandardMaterial color={color} flatShading roughness={rough} metalness={0.02} />;
}

/**
 * Infected flesh: lit from within.
 *
 * This is a deliberate exception to the rule that the world is lit in ordinary
 * colour and never in brand green (CLAUDE.md). The exception is narrow and it
 * earns itself: under moonlight and fog a shambler was a grey shape among grey
 * shapes, and the ONE thing a player must resolve instantly out here is whether
 * a silhouette is going to bite them.
 *
 * The tone matters. #7dff5c is a sick, biological green — deliberately NOT Robin
 * Neon #ccff00, which in this world means "this equipment still works". A zombie
 * glowing the same colour as a live generator would be the single most confusing
 * thing on the map.
 */
function infected(color: string, intensity = 0.55) {
  return (
    <meshStandardMaterial
      color={color}
      emissive="#7dff5c"
      emissiveIntensity={intensity}
      toneMapped={false}
      flatShading
      roughness={0.95}
    />
  );
}

/** Deterministic per-creature variation, so one spawn always looks like itself. */
function vary(seed: number, salt: number): number {
  const n = Math.sin(seed * 12.9898 + salt * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

export type CreatureState = 'idle' | 'hunting' | 'dead';

/**
 * A shambler.
 *
 * Upright, narrow, arms forward. The forward arms are doing the silhouette work:
 * they are what separates it from a player at fifty units in fog, and they are
 * the reason you can tell one is facing you before you can see its face.
 */
export function Shambler({
  position,
  seed = 0,
  state = 'idle',
  facing = 0,
}: {
  position: [number, number];
  seed?: number;
  state?: CreatureState;
  /** Radians about Y. 0 faces +Z, matching Character. */
  facing?: number;
}) {
  const root = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);

  /**
   * Taller than a player, on purpose.
   *
   * A shambler used to top out around 1.75 units against the player's ~1.55, and
   * at the zoom this game is played at that difference was invisible — the thing
   * you must not walk into looked like another person. Size is the cheapest
   * threat signal there is and it survives fog, which colour does not.
   */
  const height = 1.95 + vary(seed, 1) * 0.3;
  const lean = 0.12 + vary(seed, 2) * 0.1;

  useFrame((s) => {
    if (!root.current) return;
    if (state === 'dead') {
      // Face-down, and stays that way. A corpse that keeps swaying is a bug the
      // player reads as the thing not actually being dead.
      root.current.rotation.set(-Math.PI / 2.1, facing, 0);
      return;
    }
    // Sway, offset per creature so a group never moves as one organism.
    const t = s.clock.elapsedTime * (state === 'hunting' ? 3.4 : 1.3) + seed;
    root.current.rotation.set(lean + Math.sin(t) * 0.06, facing + Math.sin(t * 0.6) * 0.12, 0);
    const reach = state === 'hunting' ? -1.35 : -1.05;
    if (armL.current) armL.current.rotation.x = reach + Math.sin(t) * 0.14;
    if (armR.current) armR.current.rotation.x = reach + Math.sin(t + 1.1) * 0.14;
  });

  const skin = '#7d8a63';
  const cloth = '#3d4136';
  // Brighter when hunting. A shambler that has seen you lights up, which turns
  // the glow from decoration into information you can act on.
  const glow = state === 'dead' ? 0 : state === 'hunting' ? 0.95 : 0.5;

  return (
    <group ref={root} position={[position[0], 0, position[1]]}>
      {/* Legs: stiff, close together. A shambler does not stride. */}
      {[-0.1, 0.1].map((x) => (
        <mesh key={x} position={[x, height * 0.24, 0]} castShadow>
          <boxGeometry args={[0.15, height * 0.48, 0.17]} />
          {hide(cloth)}
        </mesh>
      ))}
      <mesh position={[0, height * 0.66, 0]} castShadow>
        <boxGeometry args={[0.4, height * 0.4, 0.27]} />
        {hide(cloth)}
      </mesh>
      {/* Head, pitched forward — the posture reads even as a two-pixel shape.
          Skin is the lit material: a face is where a player looks first. */}
      <mesh position={[0, height * 0.95, 0.06]} rotation={[0.3, 0, 0]} castShadow>
        <boxGeometry args={[0.28, 0.3, 0.28]} />
        {infected(skin, glow)}
      </mesh>
      {/* Arms out front. Pivot at the shoulder so the reach swings from there. */}
      {[
        [-0.28, armL],
        [0.28, armR],
      ].map(([x, ref]) => (
        <group key={x as number} ref={ref as React.RefObject<THREE.Group>} position={[x as number, height * 0.8, 0]}>
          <mesh position={[0, -0.34, 0]} castShadow>
            <boxGeometry args={[0.13, 0.68, 0.13]} />
            {infected(skin, glow)}
          </mesh>
        </group>
      ))}
      {/* A soft green wash on the ground beneath it. Cheap, and it is what makes
          one readable through fog before its outline resolves. */}
      {state !== 'dead' && (
        <pointLight position={[0, 0.9, 0]} color="#7dff5c" intensity={state === 'hunting' ? 3.2 : 1.4} distance={5} decay={2} />
      )}
    </group>
  );
}

/**
 * A wolf.
 *
 * Low and long, four legs, wide stance. Deliberately nothing like the shambler
 * in outline: at the distance fog lets you see, "tall and thin" versus "low and
 * wide" is the entire read, and it has to survive losing all colour and detail.
 */
export function Wolf({
  position,
  seed = 0,
  state = 'idle',
  facing = 0,
}: {
  position: [number, number];
  seed?: number;
  state?: CreatureState;
  facing?: number;
}) {
  const root = useRef<THREE.Group>(null);
  const legs = useRef<THREE.Group>(null);

  const size = 0.92 + vary(seed, 1) * 0.16;
  const coat = vary(seed, 2) > 0.6 ? '#4a4740' : '#3a3831';

  useFrame((s) => {
    if (!root.current) return;
    if (state === 'dead') {
      root.current.rotation.set(0, facing, Math.PI / 2.2);
      return;
    }
    const t = s.clock.elapsedTime * (state === 'hunting' ? 7 : 2.4) + seed;
    // Body bob only — the legs are static boxes, and a bob at the right rate
    // reads as a gait far better than four swinging sticks at this scale.
    root.current.position.y = Math.abs(Math.sin(t)) * (state === 'hunting' ? 0.07 : 0.02);
    root.current.rotation.set(0, facing, 0);
    if (legs.current) legs.current.rotation.x = Math.sin(t) * (state === 'hunting' ? 0.3 : 0.08);
  });

  return (
    <group ref={root} position={[position[0], 0, position[1]]}>
      <group scale={size}>
        {/* Barrel body, long on Z so it reads as facing somewhere. */}
        <mesh position={[0, 0.42, 0]} castShadow>
          <boxGeometry args={[0.3, 0.28, 0.72]} />
          {hide(coat)}
        </mesh>
        {/* Head forward and low. */}
        <mesh position={[0, 0.44, 0.46]} castShadow>
          <boxGeometry args={[0.22, 0.22, 0.26]} />
          {hide(coat)}
        </mesh>
        {/* Snout — small, but it is what makes the front the front. */}
        <mesh position={[0, 0.4, 0.62]} castShadow>
          <boxGeometry args={[0.12, 0.11, 0.16]} />
          {hide('#2c2a26')}
        </mesh>
        {/* Ears. Two tiny prisms that turn a box into an animal. */}
        {[-0.07, 0.07].map((x) => (
          <mesh key={x} position={[x, 0.58, 0.42]} castShadow>
            <coneGeometry args={[0.05, 0.1, 4]} />
            {hide(coat)}
          </mesh>
        ))}
        <group ref={legs}>
          {[
            [-0.11, 0.24],
            [0.11, 0.24],
            [-0.11, -0.24],
            [0.11, -0.24],
          ].map(([x, z]) => (
            <mesh key={`${x}:${z}`} position={[x, 0.14, z]} castShadow>
              <boxGeometry args={[0.08, 0.28, 0.08]} />
              {hide('#2f2d28')}
            </mesh>
          ))}
        </group>
        {/* Tail, low and straight — raised reads as a dog, not a wolf. */}
        <mesh position={[0, 0.36, -0.46]} rotation={[0.5, 0, 0]} castShadow>
          <boxGeometry args={[0.07, 0.07, 0.32]} />
          {hide(coat)}
        </mesh>
      </group>
    </group>
  );
}
