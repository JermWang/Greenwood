'use client';

// The Deep Forest.
//
// The turn, rendered. Everything a player has seen up to here is lit like an
// office — neutral daylight, ordinary materials, Robin Neon confined to signage.
// This is the same world with the lights off, and the trick is that NOTHING here
// is stylistically new. Same flat-shaded boxes and cones, same palette, same
// grid. What changed is the sun.
//
// Three rules hold the mood together:
//
//   1. FOG IS THE WALL. There are no room bounds out here and no ceiling. The
//      player stops seeing before they stop walking, which is what makes a
//      finite map feel like an open one and what makes approaching anything a
//      commitment.
//   2. NEON MEANS WORKING. The brand rule said Robin Neon is for branding and
//      status, never for the world. Under moonlight that pays off: the only
//      neon left is on extraction gates and live generators, so the brand
//      colour stops meaning "Greenwood" and starts meaning "this still works".
//      Everything else is lit by failing sodium, which is amber, or by nothing.
//   3. THE SCATTER IS DETERMINISTIC. Every prop position comes from a seeded
//      hash of its own coordinates, so every client renders the identical
//      forest. In a PvP zone that is not a nicety — if two players saw trees in
//      different places, cover would be a lie and a fight would be decided by
//      whose client drew what.
//
// Deliberately NOT built on IsoBoard. That renders one InstancedMesh over every
// tile and recolours all of them in an effect, which is fine over the Machine
// Room's ~825 tiles and a frame hazard over this map's tens of thousands. Here
// the ground is a single plane and the props are scattered over it, which costs
// nothing per tile and is what makes a large outdoor area viable before the
// chunked terrain streamer exists.

import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { ISO } from './palette';
import { gridTexture, hash2 } from './mapkit';
import { GatheringNode } from './OutdoorDressing';
import InstancedForest from './InstancedForest';
import PlaceLabel from './PlaceLabel';
import { salvageNodes, GATES, GENERATORS, EXTENT } from '@/lib/deep-forest-map';

export const FOG_COLOUR = '#111a1f';

/**
 * The moonlit rig.
 *
 * A cold key from high and behind, almost no fill, and a hemisphere light doing
 * the work of a sky that is barely there. The ambient level is deliberately
 * miserable — anything brighter and the forest reads as dusk, which is the
 * Treeline's job, not this one.
 */
function DeepForestLighting() {
  return (
    <>
      <color attach="background" args={[FOG_COLOUR]} />
      {/*
        Fog density is the mood dial and it is easy to overdo. At 0.055 the map
        was genuinely black — atmospheric, unreadable, and unplayable: you could
        not see a tree until you were inside it, which makes cover meaningless
        because nobody can plan around what they cannot see. 0.026 still hides
        the far half of the map and still makes approaching a commitment, while
        leaving the near field legible.
      */}
      <fogExp2 attach="fog" args={[FOG_COLOUR, 0.014]} />
      {/*
        Moon: cold, and brighter than "moonlight" sounds.
        Real moonlight is far dimmer than this — but a scene lit to real
        moonlight levels reads as a bug rather than as night, and the player
        turns their monitor up instead of feeling anything. The colour does the
        work of telling you it is night; the intensity only has to make the
        shapes readable.
      */}
      {/*
        Shadow camera sized to what the fog actually lets you SEE, not to the map.

        It covered ±40 — an 80x80 area — on a 1024 map, which is 12.8 texels per
        world unit, and shadows at that density are mush. Fog makes everything
        past ~22 units invisible anyway, so three quarters of that map was being
        rendered and sampled for geometry nobody can see.
        ±22 on the same 1024 map is 23 texels per unit: a little under twice the
        resolution, for a little over a third of the scene traversed per frame.
        Sharper AND cheaper, which is the good kind of trade.

        `shadow-bias` fights the acne that showing up at higher texel density
        would otherwise introduce on the near-flat ground plane.
      */}
      <directionalLight
        position={[-18, 26, -14]}
        intensity={1.9}
        color="#a8bcd8"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0009}
        shadow-normalBias={0.02}
      >
        <orthographicCamera attach="shadow-camera" args={[-22, 22, 22, -22, 1, 80]} />
      </directionalLight>
      {/* Sky/ground bounce. Blue from above, near-black from below — the ground
          out here reflects almost nothing back. */}
      <hemisphereLight args={['#4a648a', '#131a1e', 0.95]} />
      <ambientLight intensity={0.55} color="#6d87a8" />
    </>
  );
}

/**
 * Ground: a plane, with the tile grid drawn on it.
 *
 * The plane was bare, which made the Deep Forest the one place in the game that
 * did not read as tile-based — everything else stands on a visible grid, and
 * losing it out here made distance impossible to judge and the zone look like a
 * different game.
 *
 * One repeat per tile, so a grid square IS a tile — the same cell the map, the
 * collision check and the pathfinder all use. A decorative grid at some other
 * scale would actively mislead about how far a step goes. The texture itself and
 * the three traps in building it are documented on gridTexture in mapkit.
 */
function Ground({ extent }: { extent: number }) {
  const span = extent * 2 + 1;
  const texture = useMemo(() => gridTexture('#3a4634', 'rgba(180, 202, 168, 0.34)', span), [span]);

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
      <planeGeometry args={[span, span]} />
      {/* White, because `map` is MULTIPLIED by `color`. The earth tone is baked
          into the texture — see mapkit. */}
      <meshStandardMaterial map={texture} color="#ffffff" roughness={1} metalness={0} />
    </mesh>
  );
}

/**
 * An abandoned generator: the thing worth coming out here for.
 *
 * Dead ones are the salvage. A live one is the rarest sight in the zone and the
 * only place besides your own gear where neon appears, which is why finding one
 * reads as significant without any text saying so.
 */
function AbandonedGenerator({
  position,
  seed = 0,
  live = false,
}: {
  position: [number, number];
  seed?: number;
  live?: boolean;
}) {
  const spin = Math.floor(hash2(seed, 1) * 4) * (Math.PI / 2);
  return (
    <group position={[position[0], 0, position[1]]} rotation={[0, spin, 0]}>
      {/* Concrete pad, cracked and half-swallowed. */}
      <mesh position={[0, 0.04, 0]} receiveShadow>
        <boxGeometry args={[3.4, 0.08, 2.6]} />
        <meshStandardMaterial color="#3d4038" flatShading roughness={0.98} />
      </mesh>
      {/* Housing. */}
      <mesh position={[0, 0.75, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.2, 1.4, 1.5]} />
        <meshStandardMaterial color={live ? '#3f4438' : '#4a463c'} flatShading roughness={0.9} metalness={0.15} />
      </mesh>
      {/* Exhaust stack, leaning if dead. */}
      <mesh position={[0.85, 1.9, -0.4]} rotation={[0, 0, live ? 0 : 0.22]} castShadow>
        <cylinderGeometry args={[0.14, 0.18, 1.5, 6]} />
        <meshStandardMaterial color="#544f45" flatShading roughness={0.95} />
      </mesh>
      {/* Control panel. Neon and alive, or dark and stripped. */}
      <mesh position={[0, 0.85, 0.78]}>
        <boxGeometry args={[0.8, 0.5, 0.06]} />
        {live ? (
          <meshStandardMaterial
            color={ISO.accent}
            emissive={ISO.accent}
            emissiveIntensity={1.6}
            toneMapped={false}
            flatShading
          />
        ) : (
          <meshStandardMaterial color="#22241f" flatShading roughness={1} />
        )}
      </mesh>
      {live && <pointLight position={[0, 1.1, 1.4]} color={ISO.accent} intensity={5} distance={9} decay={2} />}
    </group>
  );
}

/**
 * An extraction gate: the only way out with what you are carrying.
 *
 * Lit in neon and visible through fog on purpose. A hidden exit would make the
 * zone a maze, and the tension this place runs on is not "can I find the door" —
 * it is "can I reach the door I can already see".
 */
export function ExtractionGate({
  position,
  rotation = 0,
  label,
}: {
  position: [number, number];
  rotation?: number;
  /** Sits on the lintel. A gate is a place, so its name belongs on the gate. */
  label?: string;
}) {
  const glow = useRef<THREE.Mesh>(null);
  // Slow pulse, so a gate reads as live from across a clearing without needing
  // a label. Sine on elapsed time rather than a per-frame accumulator, so every
  // client pulses in phase — two players should see the same gate doing the
  // same thing at the same moment.
  useFrame((state) => {
    const m = glow.current?.material as THREE.MeshStandardMaterial | undefined;
    if (m) m.emissiveIntensity = 1.5 + Math.sin(state.clock.elapsedTime * 1.6) * 0.6;
  });
  return (
    <group position={[position[0], 0, position[1]]} rotation={[0, rotation, 0]}>
      {[-1.6, 1.6].map((x) => (
        <mesh key={x} position={[x, 1.7, 0]} castShadow>
          <boxGeometry args={[0.22, 3.4, 0.22]} />
          <meshStandardMaterial color={ISO.steelDark} flatShading roughness={0.5} metalness={0.6} />
        </mesh>
      ))}
      <mesh position={[0, 3.5, 0]} castShadow>
        <boxGeometry args={[3.6, 0.26, 0.26]} />
        <meshStandardMaterial color={ISO.steelDark} flatShading roughness={0.5} metalness={0.6} />
      </mesh>
      <mesh ref={glow} position={[0, 3.5, 0.16]}>
        <boxGeometry args={[3.2, 0.1, 0.05]} />
        <meshStandardMaterial
          color={ISO.accent}
          emissive={ISO.accent}
          emissiveIntensity={1.8}
          toneMapped={false}
          flatShading
        />
      </mesh>
      {/* Ground wash, so the gate is findable when the frame itself is fogged. */}
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[3.2, 16]} />
        <meshBasicMaterial color={ISO.accent} transparent opacity={0.13} toneMapped={false} />
      </mesh>
      {/* Grid-aligned, not a billboard. A gate is a place, and its sign should
          look installed on the structure rather than pasted on the screen. */}
      {label && <PlaceLabel position={[0, 4.3, 0]}>{label}</PlaceLabel>}
      <pointLight position={[0, 3, 0]} color={ISO.accent} intensity={7} distance={14} decay={2} />
    </group>
  );
}

// NOTE: the scatter that used to live here has moved to lib/deep-forest-map.
// It generated the forest inside this component, which meant the terrain only
// existed in the browser — every client agreed with every other client, but the
// SERVER could not see a single tree, so it could not validate a step, a line of
// sight, or a claim to be standing next to a loot pile. One definition, imported
// by both halves, is the only arrangement where they cannot drift.

export interface DeepForestProps {
  /** Half-width to draw. Defaults to the map's own EXTENT. */
  extent?: number;
  /** Tiles whose tree is currently a stump, so the forest can leave a hole. */
  felled?: Set<string>;
}

/**
 * The scene contents. Mounted inside a Canvas by the page.
 *
 * `extent` defaults well below the 220-tile design target in REGIONS. That
 * figure is what the zone should eventually be and needs the chunked terrain
 * streamer to reach; this renders the whole map at once, so it is sized to what
 * one draw can carry. Growing it is a number change once streaming exists.
 */
export default function DeepForestScene({ extent = EXTENT, felled }: DeepForestProps) {
  // Everything drawn here comes from lib/deep-forest-map, which the server also
  // reads. Nothing about the world is decided in this file.
  const nodes = useMemo(() => salvageNodes(), []);

  return (
    <>
      <DeepForestLighting />
      <Ground extent={extent} />

      <InstancedForest felled={felled} />

      {nodes.map((n) => (
        <GatheringNode key={n.id} position={[n.x, n.z]} kind={n.kind} seed={n.seed} />
      ))}

      {GENERATORS.map((g) => (
        <AbandonedGenerator key={g.seed} position={[g.x, g.z]} seed={g.seed} live={g.live} />
      ))}

      {GATES.map((g) => (
        <ExtractionGate key={g.name} position={[g.x, g.z]} rotation={g.rotation} label={g.name} />
      ))}
    </>
  );
}
