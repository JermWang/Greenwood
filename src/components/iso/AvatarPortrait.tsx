'use client';

// What your fund looks like from the outside: the avatar you walk around in,
// standing still, turning slowly.
//
// This is the whole of the dashboard apart from the button, so it renders the
// REAL Character with the REAL lighting rig rather than a drawing of one. A
// portrait that flattered the model would be lying about a purchase — the
// Outfitter sells looks, and the only honest preview of a look is the thing the
// Trading Floor will actually draw.
//
// It follows the iso conventions in the one way that matters here: the camera
// angle is ISO_OFFSET, so the figure is lit and framed exactly as it will be in
// the world. It does NOT use IsoRig, and that is the one deliberate deviation —
// IsoRig exists to pan, zoom and clamp a camera over a BOARD, and there is no
// board here, no tiles to pick and nothing to walk to. What is left of the rig
// on a single centred figure is the fixed camera, which is a Canvas prop.

import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import Character, { lookFor } from './Character';
import { Lighting } from './IsoScene';
import { ISO_OFFSET } from './palette';

/**
 * Module-level, for the same reason every other camera in this codebase is.
 *
 * An inline literal is a new object each render, which makes R3F re-apply the
 * camera — see the note on CAMERA in IsoScene.
 */
const CAMERA = { position: ISO_OFFSET, zoom: 118, near: -400, far: 600 } as const;

/**
 * A stage the size of the figure, so the shadow camera is sized for a person
 * rather than for a room. Nothing receives the shadow here, but the rig is
 * shared with the world and its key light is what gives the flat-shaded faces
 * their separation.
 */
const STAGE = { minX: -2, maxX: 2, minZ: -2, maxZ: 2 };

/** Radians per second. Slow enough that the figure reads as posing, not spinning. */
const SPIN = 0.38;

function Turntable({ children }: { children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y += delta * SPIN;
  });
  /*
   * Dropped so the figure sits in the middle of the frame rather than standing
   * on it. Character is 1.55x oversized on purpose (see the note at its root
   * group), so its head is a long way above the origin its feet occupy, and a
   * camera aimed at the origin frames the ground it is standing on.
   */
  return (
    <group ref={ref} position={[0, -1.15, 0]}>
      {children}
    </group>
  );
}

export default function AvatarPortrait({
  wallet,
  outfit,
  outfitLevel,
}: {
  wallet: string | null;
  /** The avatar cosmetic being worn, if any. */
  outfit: string | null;
  /** How far it has been taken up its refinement track. */
  outfitLevel: number;
}) {
  const look = useMemo(
    () => lookFor({ wallet: wallet ?? 'guest', outfit, outfitLevel, isSelf: true }),
    [wallet, outfit, outfitLevel]
  );

  return (
    <Canvas orthographic camera={CAMERA} dpr={[1, 2]}>
      <Lighting bounds={STAGE} />
      <Turntable>
        {/*
          Standing on the spot. Character derives its animation from motion, so
          a target equal to its spawn is what "idle" means here — there is no
          idle flag to set, and inventing one would be a second animation system
          for the one place that does not need it.
        */}
        <Character look={look} target={{ x: 0, z: 0 }} spawn={{ x: 0, z: 0 }} />
      </Turntable>
    </Canvas>
  );
}
