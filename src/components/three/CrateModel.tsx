'use client';

// Procedural supply pod.
//
// Shared crate used by inventory thumbnails and the reveal cinematic, built in
// the fab equipment's visual language so a crate reads as part of the same
// facility: a dark metal plinth, a white clearcoat shell, a cobalt viewing
// window, an orange safety latch and a lime status strip. A four-petal lid
// bursts outward along the corner diagonals when it opens.
//
// Built in code rather than loaded as a GLB because every rarity needs its own
// colourway — the lid seam, the window core, the glow and the inner key light
// all take the rarity's tint, so one component covers all seven tiers.

import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { rarityHex, type Rarity } from '@/lib/rarity';

/** Corner offsets shared by the plinth feet and the lid petals. */
const CORNERS: Array<[number, number]> = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

const BODY = 2.2;
const HEIGHT = 2.0;
const HB = BODY / 2;
const HH = HEIGHT / 2;
const LID_PLATE = (BODY / 2) * 0.96;
const LID_H = 0.2;

export interface CrateModelProps {
  rarity?: Rarity;
  /** 0 = shut, 1 = fully burst open. Values above 1 push the petals further. */
  open?: number;
  /**
   * Seam/core glow, 0..~2, independent of the petal burst. Lets the reveal
   * charge the glow up during the rumble before anything opens. Defaults to
   * `open`, so thumbnails and simple callers get a glow that tracks the lid.
   */
  glow?: number;
  /** Idle spin + hover. Off for static thumbnails and when a parent drives motion. */
  animate?: boolean;
  scale?: number;
}

export default function CrateModel({
  rarity = 'legendary',
  open = 0,
  glow,
  animate = true,
  scale = 1,
}: CrateModelProps) {
  const group = useRef<THREE.Group>(null);
  const petals = useRef<Array<THREE.Group | null>>([null, null, null, null]);
  const colour = useMemo(() => new THREE.Color(rarityHex(rarity)), [rarity]);

  // Materials are memoised per rarity: the accent-carrying ones hold the
  // emissive colour, and rebuilding them every frame would leak GPU resources.
  const mats = useMemo(() => {
    const shell = new THREE.MeshPhysicalMaterial({ color: 0xeff3f7, roughness: 0.44, clearcoat: 0.22, clearcoatRoughness: 0.5 });
    const plinth = new THREE.MeshStandardMaterial({ color: 0x202936, metalness: 0.52, roughness: 0.36 });
    const frame = new THREE.MeshStandardMaterial({ color: 0x2a3442, metalness: 0.6, roughness: 0.3 });
    const cobalt = new THREE.MeshPhysicalMaterial({ color: 0x0c3d98, metalness: 0.35, roughness: 0.18, clearcoat: 0.5 });
    const lime = new THREE.MeshBasicMaterial({ color: 0x91f45f, toneMapped: false });
    const orange = new THREE.MeshStandardMaterial({ color: 0xff8a25, emissive: 0xff7916, emissiveIntensity: 0.6, roughness: 0.22 });
    const seam = new THREE.MeshStandardMaterial({
      color: colour,
      emissive: colour,
      emissiveIntensity: 1.4,
      metalness: 0.4,
      roughness: 0.35,
      toneMapped: false,
    });
    const core = new THREE.MeshStandardMaterial({ color: colour, emissive: colour, emissiveIntensity: 0.9, toneMapped: false });
    return { shell, plinth, frame, cobalt, lime, orange, seam, core };
  }, [colour]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (animate && group.current) {
      group.current.rotation.y = t * 0.35;
      group.current.position.y = Math.sin(t * 1.3) * 0.06;
    }
    // Seam and core brighten as the crate opens, then the petals fly outward
    // along their corner diagonals — the burst reads as the pod coming apart
    // rather than a lid politely lifting.
    const g = glow ?? open;
    mats.seam.emissiveIntensity = 1.4 + g * 5;
    mats.core.emissiveIntensity = 0.9 + g * 3;
    petals.current.forEach((petal, i) => {
      if (!petal) return;
      const [sx, sz] = CORNERS[i];
      const dir = new THREE.Vector3(sx, 1.35, sz).normalize();
      const travel = open * 2.6;
      petal.position.set(
        (sx * BODY) / 4 + dir.x * travel,
        HH + LID_H / 2 + dir.y * travel,
        (sz * BODY) / 4 + dir.z * travel
      );
      petal.rotation.set(open * sz * 1.9, open * 1.2, open * -sx * 1.9);
    });
  });

  return (
    <group ref={group} scale={1.05 * scale}>
      {/* Dark metal plinth — the same base the fab machines sit on. */}
      <RoundedBox args={[BODY + 0.24, 0.34, BODY + 0.24]} radius={0.1} smoothness={3} position={[0, -HH - 0.02, 0]} castShadow receiveShadow>
        <primitive object={mats.plinth} attach="material" />
      </RoundedBox>

      {/* White clearcoat body. */}
      <RoundedBox args={[BODY, HEIGHT * 0.86, BODY]} radius={0.3} smoothness={4} position={[0, -0.08, 0]} castShadow receiveShadow>
        <primitive object={mats.shell} attach="material" />
      </RoundedBox>

      {/* Cobalt viewing window on the front, with a rarity-tinted core. */}
      <RoundedBox args={[BODY * 0.62, HEIGHT * 0.44, 0.08]} radius={0.13} smoothness={3} position={[0, -0.02, HB + 0.005]}>
        <primitive object={mats.cobalt} attach="material" />
      </RoundedBox>
      <mesh position={[0, -0.02, HB + 0.03]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.3, 0.3, 0.05, 32]} />
        <primitive object={mats.core} attach="material" />
      </mesh>
      <mesh position={[0, -0.02, HB + 0.04]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.42, 0.03, 12, 40]} />
        <primitive object={mats.seam} attach="material" />
      </mesh>

      {/* Orange safety latch and a lime status strip. */}
      <RoundedBox args={[0.62, 0.2, 0.1]} radius={0.05} smoothness={2} position={[0, -HH * 0.72, HB + 0.02]}>
        <primitive object={mats.orange} attach="material" />
      </RoundedBox>
      <mesh position={[0, HH * 0.5, HB + 0.02]}>
        <boxGeometry args={[BODY * 0.42, 0.08, 0.04]} />
        <primitive object={mats.lime} attach="material" />
      </mesh>

      {/* Dark corner posts, echoing the fab equipment frame. */}
      {CORNERS.map(([x, z], i) => (
        <mesh key={`post-${i}`} position={[x * (HB - 0.06), -0.08, z * (HB - 0.06)]} castShadow>
          <cylinderGeometry args={[0.09, 0.09, HEIGHT * 0.82, 12]} />
          <primitive object={mats.frame} attach="material" />
        </mesh>
      ))}

      {/* Glowing rarity seam along the lid line. */}
      {(
        [
          [BODY, 0.07, 0, HB],
          [BODY, 0.07, 0, -HB],
          [0.07, BODY, HB, 0],
          [0.07, BODY, -HB, 0],
        ] as Array<[number, number, number, number]>
      ).map(([w, d, x, z], i) => (
        <mesh key={`seam-${i}`} position={[x, HH - 0.14, z]}>
          <boxGeometry args={[w, 0.05, d]} />
          <primitive object={mats.seam} attach="material" />
        </mesh>
      ))}

      {/* Four-petal lid — white shell plates with a rarity seam edge. */}
      {CORNERS.map(([sx, sz], i) => (
        <group
          key={`petal-${i}`}
          ref={(el) => {
            petals.current[i] = el;
          }}
          position={[(sx * BODY) / 4, HH + LID_H / 2, (sz * BODY) / 4]}
        >
          <RoundedBox args={[LID_PLATE, LID_H, LID_PLATE]} radius={0.08} smoothness={3} castShadow receiveShadow>
            <primitive object={mats.shell} attach="material" />
          </RoundedBox>
          <mesh position={[0, LID_H / 2 + 0.005, (-sz * LID_PLATE) / 2 + 0.05]}>
            <boxGeometry args={[LID_PLATE, 0.05, 0.06]} />
            <primitive object={mats.seam} attach="material" />
          </mesh>
        </group>
      ))}

      {/* Rarity key light inside, revealed as the lid comes apart. */}
      <pointLight color={colour} intensity={2 + open * 26} distance={16} decay={2} />
    </group>
  );
}
