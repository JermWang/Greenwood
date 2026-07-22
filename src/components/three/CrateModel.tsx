'use client';

// Procedural supply crate.
//
// Shared supply-pod factory used by inventory, exchange, and reveal sequences so the pod in the
// game is the same object people saw in the video: gunmetal panels recessed
// into a brass frame, hex bolts, a glowing seam under the lid line, and a
// four-petal lid that bursts outward when it opens.
//
// Built in code rather than loaded as a GLB because every rarity needs its own
// colourway — the seam, the glow and the inner key light all take the rarity's
// colour, so one mesh covers all seven tiers instead of seven exported files.

import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { rarityHex, type Rarity } from '@/lib/rarity';

/** Corner offsets shared by the frame, caps and lid petals. */
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
const BW = 0.14;
const LID_PLATE = (BODY / 2) * 0.94;
const LID_H = 0.18;

export interface CrateModelProps {
  rarity?: Rarity;
  /** 0 = shut, 1 = fully burst open. */
  open?: number;
  /** Idle spin + hover. Off for static thumbnails. */
  animate?: boolean;
  scale?: number;
}

export default function CrateModel({
  rarity = 'legendary',
  open = 0,
  animate = true,
  scale = 1,
}: CrateModelProps) {
  const group = useRef<THREE.Group>(null);
  const petals = useRef<Array<THREE.Group | null>>([null, null, null, null]);
  const colour = useMemo(() => new THREE.Color(rarityHex(rarity)), [rarity]);

  // Materials are memoised per rarity: they carry the emissive colour, and
  // rebuilding them every frame would leak GPU resources.
  const mats = useMemo(() => {
    const steel = new THREE.MeshStandardMaterial({ color: 0x3a3b42, metalness: 0.72, roughness: 0.34 });
    const steelDark = new THREE.MeshStandardMaterial({ color: 0x22232a, metalness: 0.6, roughness: 0.56 });
    const brass = new THREE.MeshStandardMaterial({ color: 0xc79a2e, metalness: 0.96, roughness: 0.26 });
    const brassLite = new THREE.MeshStandardMaterial({ color: 0xe1bb50, metalness: 0.96, roughness: 0.22 });
    const seam = new THREE.MeshStandardMaterial({
      color: colour,
      emissive: colour,
      emissiveIntensity: 1.4,
      metalness: 0.4,
      roughness: 0.35,
      toneMapped: false,
    });
    return { steel, steelDark, brass, brassLite, seam };
  }, [colour]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (animate && group.current) {
      group.current.rotation.y = t * 0.35;
      group.current.position.y = Math.sin(t * 1.3) * 0.06;
    }
    // Seam brightens as the crate opens, then the petals fly outward along
    // their corner diagonals — the burst reads as the box coming apart rather
    // than a lid politely lifting.
    mats.seam.emissiveIntensity = 1.4 + open * 5;
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
    <group ref={group} scale={1.15 * scale}>
      {/* body */}
      <mesh castShadow receiveShadow>
        <boxGeometry args={[BODY, HEIGHT, BODY]} />
        <primitive object={mats.steel} attach="material" />
      </mesh>

      {/* recessed dark panels on the four vertical faces */}
      {([[0, HB], [0, -HB], [HB, 0], [-HB, 0]] as Array<[number, number]>).map(([x, z], i) => (
        <mesh
          key={`panel-${i}`}
          position={[
            x ? (x > 0 ? HB - 0.02 : -HB + 0.02) : 0,
            -0.05,
            z ? (z > 0 ? HB - 0.02 : -HB + 0.02) : 0,
          ]}
        >
          <boxGeometry
            args={[x ? 0.05 : BODY * 0.64, HEIGHT * 0.62, z ? 0.05 : BODY * 0.64]}
          />
          <primitive object={mats.steelDark} attach="material" />
        </mesh>
      ))}

      {/* brass frame — four uprights */}
      {CORNERS.map(([x, z], i) => (
        <mesh key={`post-${i}`} position={[x * HB, 0, z * HB]} castShadow>
          <boxGeometry args={[BW, HEIGHT, BW]} />
          <primitive object={mats.brass} attach="material" />
        </mesh>
      ))}

      {/* top and bottom rims */}
      {[-HH, HH].map((y) => (
        <group key={`rim-${y}`}>
          {[HB, -HB].map((z) => (
            <mesh key={`rz-${z}`} position={[0, y, z]} castShadow>
              <boxGeometry args={[BODY + BW, BW, BW]} />
              <primitive object={mats.brass} attach="material" />
            </mesh>
          ))}
          {[HB, -HB].map((x) => (
            <mesh key={`rx-${x}`} position={[x, y, 0]} castShadow>
              <boxGeometry args={[BW, BW, BODY + BW]} />
              <primitive object={mats.brass} attach="material" />
            </mesh>
          ))}
        </group>
      ))}

      {/* corner caps */}
      {[HH, -HH].map((y) =>
        CORNERS.map(([x, z], i) => (
          <mesh key={`cap-${y}-${i}`} position={[x * HB, y, z * HB]} castShadow>
            <boxGeometry args={[BW * 1.7, BW * 1.7, BW * 1.7]} />
            <primitive object={mats.brassLite} attach="material" />
          </mesh>
        ))
      )}

      {/* hex bolts */}
      {([[0, 1], [0, -1], [1, 0], [-1, 0]] as Array<[number, number]>).map(([nx, nz]) =>
        ([[0.66, 0.62], [-0.66, 0.62], [0.66, -0.62], [-0.66, -0.62]] as Array<[number, number]>).map(
          ([a, b], j) => (
            <mesh
              key={`bolt-${nx}-${nz}-${j}`}
              castShadow
              position={nz ? [a, b, nz * (HB + 0.02)] : [nx * (HB + 0.02), b, a]}
              rotation={nz ? [Math.PI / 2, 0, 0] : [0, 0, Math.PI / 2]}
            >
              <cylinderGeometry args={[0.085, 0.085, 0.06, 6]} />
              <primitive object={mats.brassLite} attach="material" />
            </mesh>
          )
        )
      )}

      {/* glowing rarity seam just under the lid line */}
      {(
        [
          [BODY, 0.07, 0, HB],
          [BODY, 0.07, 0, -HB],
          [0.07, BODY, HB, 0],
          [0.07, BODY, -HB, 0],
        ] as Array<[number, number, number, number]>
      ).map(([w, d, x, z], i) => (
        <mesh key={`seam-${i}`} position={[x, HH - 0.06, z]}>
          <boxGeometry args={[w, 0.05, d]} />
          <primitive object={mats.seam} attach="material" />
        </mesh>
      ))}

      {/* four-petal lid */}
      {CORNERS.map(([sx, sz], i) => (
        <group
          key={`petal-${i}`}
          ref={(el) => {
            petals.current[i] = el;
          }}
          position={[(sx * BODY) / 4, HH + LID_H / 2, (sz * BODY) / 4]}
        >
          <mesh castShadow receiveShadow>
            <boxGeometry args={[LID_PLATE, LID_H, LID_PLATE]} />
            <primitive object={mats.steel} attach="material" />
          </mesh>
          <mesh position={[0, LID_H / 2, (sz * LID_PLATE) / 2]} castShadow>
            <boxGeometry args={[LID_PLATE + BW, BW, BW]} />
            <primitive object={mats.brass} attach="material" />
          </mesh>
          <mesh position={[(sx * LID_PLATE) / 2, LID_H / 2, 0]} castShadow>
            <boxGeometry args={[BW, BW, LID_PLATE + BW]} />
            <primitive object={mats.brass} attach="material" />
          </mesh>
          <mesh position={[(sx * LID_PLATE) / 2, LID_H / 2, (sz * LID_PLATE) / 2]} castShadow>
            <boxGeometry args={[BW * 1.7, BW * 1.7, BW * 1.7]} />
            <primitive object={mats.brassLite} attach="material" />
          </mesh>
          <mesh position={[0, LID_H / 2 + 0.005, (-sz * LID_PLATE) / 2 + 0.05]}>
            <boxGeometry args={[LID_PLATE, 0.05, 0.06]} />
            <primitive object={mats.seam} attach="material" />
          </mesh>
        </group>
      ))}

      {/* rarity key light inside, revealed as the lid comes apart */}
      <pointLight color={colour} intensity={2 + open * 26} distance={16} decay={2} />
    </group>
  );
}
