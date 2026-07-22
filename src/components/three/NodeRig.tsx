'use client';

// Procedural GPU-fab equipment reconstructed from the generated reference set.
// Legacy `oil` / `mine` family keys are intentionally preserved because they
// are protocol identifiers. Players see Wafer Fabs and Cleanrooms everywhere.

import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { RoundedBox, useCursor } from '@react-three/drei';
import { BayStatusLights, Motes, RarityAura } from './Aura';
import { levelTheme, rarityFx, rarityTier, rimColor } from './fx';
import { NODE_SLOTS, RARITIES, rarityHex, type NodeFamily, type Rarity } from '@/lib/rarity';
import { auraHex } from '@/lib/aura';

export interface RigNodeData {
  id: string;
  type: NodeFamily;
  level: number;
  isActive?: boolean;
  components: Array<{ slot: string; rarity: string }>;
}

const PALETTE = {
  shell: '#eff4ef',
  shellShade: '#cfd8d2',
  charcoal: '#18231f',
  charcoalSoft: '#2d3934',
  cobalt: '#1f65dc',
  cobaltDark: '#103584',
  orange: '#ff8a25',
  silicon: '#7e9cff',
};

function asRarity(value: string | undefined): Rarity {
  return RARITIES.includes(value as Rarity) ? (value as Rarity) : 'common';
}

function RoundedPanel({
  size,
  position,
  color,
  radius = 0.16,
  rotation,
  metalness = 0.05,
  roughness = 0.52,
  emissive,
  emissiveIntensity = 0,
}: {
  size: [number, number, number];
  position: [number, number, number];
  color: string;
  radius?: number;
  rotation?: [number, number, number];
  metalness?: number;
  roughness?: number;
  emissive?: string;
  emissiveIntensity?: number;
}) {
  return (
    <RoundedBox args={size} radius={radius} smoothness={3} position={position} rotation={rotation} castShadow receiveShadow>
      <meshPhysicalMaterial
        color={color}
        roughness={roughness}
        metalness={metalness}
        clearcoat={color === PALETTE.shell ? 0.18 : 0.04}
        clearcoatRoughness={0.48}
        emissive={emissive ?? '#000000'}
        emissiveIntensity={emissiveIntensity}
      />
    </RoundedBox>
  );
}

function StatusBeacon({ position, accent }: { position: [number, number, number]; accent: string }) {
  return (
    <group position={position} name="status-beacon" userData={{ socket: 'status-light', contactType: 'socket' }}>
      <mesh castShadow>
        <cylinderGeometry args={[0.16, 0.18, 0.12, 18]} />
        <meshStandardMaterial color={PALETTE.charcoal} roughness={0.42} metalness={0.55} />
      </mesh>
      <mesh position={[0, 0.16, 0]}>
        <cylinderGeometry args={[0.12, 0.12, 0.24, 18]} />
        <meshPhysicalMaterial color={accent} emissive={accent} emissiveIntensity={1.5} roughness={0.2} transmission={0.08} />
      </mesh>
    </group>
  );
}

function Wafer({ position, scale = 1, accent = PALETTE.silicon }: { position: [number, number, number]; scale?: number; accent?: string }) {
  return (
    <group position={position} scale={scale}>
      <mesh castShadow receiveShadow>
        <cylinderGeometry args={[0.44, 0.44, 0.035, 32]} />
        <meshPhysicalMaterial color={accent} roughness={0.18} metalness={0.48} clearcoat={0.8} clearcoatRoughness={0.12} />
      </mesh>
      <mesh position={[0, 0.022, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.31, 0.335, 28]} />
        <meshBasicMaterial color="#b9efff" transparent opacity={0.45} toneMapped={false} />
      </mesh>
    </group>
  );
}

function LithographyMachine({ accent, active }: { accent: string; active: boolean }) {
  const wafer = useRef<THREE.Group>(null);
  const lens = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!active) return;
    const t = clock.elapsedTime;
    if (wafer.current) wafer.current.rotation.y = t * 0.5;
    if (lens.current) lens.current.position.y = 1.58 + Math.sin(t * 1.6) * 0.045;
  });

  return (
    <group
      name="lithography-machine"
      position={[-1.55, 0.38, 0.1]}
      rotation={[0, 0.12, 0]}
      userData={{
        sculptId: 'lithography-machine',
        sourceReference: '/assets/fab/lithography-machine-reference.png',
        pivot: 'base',
        collider: { type: 'box', size: [2.75, 2.7, 2.25] },
        destructionGroup: 'lithography-shell',
      }}
    >
      <RoundedPanel size={[2.85, 0.48, 2.25]} position={[0, 0.24, 0]} color={PALETTE.charcoal} radius={0.2} metalness={0.5} roughness={0.38} />
      <RoundedPanel size={[2.68, 2.25, 2.08]} position={[0, 1.5, 0]} color={PALETTE.shell} radius={0.3} />
      <RoundedPanel size={[2.2, 1.48, 0.08]} position={[0, 1.58, 1.055]} color={PALETTE.cobaltDark} radius={0.2} metalness={0.12} roughness={0.25} />
      <RoundedPanel size={[1.9, 1.18, 0.035]} position={[0, 1.58, 1.105]} color={PALETTE.cobalt} radius={0.16} roughness={0.12} emissive={PALETTE.cobalt} emissiveIntensity={active ? 0.32 : 0.06} />
      <group ref={lens} name="lens-head" position={[0, 1.58, 0.83]} userData={{ pivot: 'linear-y', collider: { type: 'box', size: [0.68, 0.7, 0.5] } }}>
        <RoundedPanel size={[0.72, 0.54, 0.52]} position={[0, 0.28, 0]} color={PALETTE.charcoalSoft} radius={0.12} metalness={0.45} roughness={0.32} />
        <mesh position={[0, -0.12, 0]} castShadow>
          <cylinderGeometry args={[0.18, 0.28, 0.46, 24]} />
          <meshStandardMaterial color={PALETTE.charcoal} metalness={0.75} roughness={0.24} />
        </mesh>
        <mesh position={[0, -0.36, 0]}>
          <cylinderGeometry args={[0.11, 0.16, 0.07, 24]} />
          <meshBasicMaterial color={accent} toneMapped={false} />
        </mesh>
      </group>
      <group ref={wafer} name="wafer-stage" position={[0, 0.82, 0.72]} userData={{ pivot: 'rotary-y', socket: 'wafer-stage' }}>
        <Wafer position={[0, 0, 0]} scale={0.78} />
      </group>
      <RoundedPanel size={[0.28, 0.62, 0.16]} position={[1.18, 1.58, 1.12]} color={PALETTE.orange} radius={0.07} roughness={0.3} />
      <RoundedPanel size={[1.45, 0.1, 0.08]} position={[-0.26, 0.55, 1.14]} color={accent} radius={0.045} roughness={0.2} emissive={accent} emissiveIntensity={active ? 0.8 : 0.05} />
      <StatusBeacon position={[0.92, 2.78, 0.22]} accent={accent} />
      <object3D name="wafer-input-socket" position={[1.32, 0.82, 0.82]} />
    </group>
  );
}

function WaferStackMachine({ accent, active }: { accent: string; active: boolean }) {
  const arm = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!active || !arm.current) return;
    arm.current.rotation.z = -0.18 + Math.sin(clock.elapsedTime * 0.85) * 0.13;
  });
  const shelves = [0.78, 1.38, 1.98];
  return (
    <group
      name="wafer-stack"
      position={[1.75, 0.38, -0.08]}
      rotation={[0, -0.1, 0]}
      userData={{
        sculptId: 'wafer-stack',
        sourceReference: '/assets/fab/wafer-stack-reference.png',
        pivot: 'base',
        collider: { type: 'cylinder', radius: 1.05, height: 2.7 },
        destructionGroup: 'wafer-carousel-shell',
      }}
    >
      <RoundedPanel size={[2.05, 0.44, 1.78]} position={[0, 0.22, 0]} color={PALETTE.charcoal} radius={0.2} metalness={0.48} roughness={0.38} />
      <RoundedPanel size={[2.18, 2.62, 1.9]} position={[0, 1.5, 0]} color={PALETTE.shell} radius={0.38} />
      <RoundedPanel size={[1.7, 2.05, 0.06]} position={[-0.08, 1.48, 0.97]} color={PALETTE.charcoal} radius={0.22} metalness={0.42} roughness={0.34} />
      {shelves.map((y, shelfIndex) => (
        <group key={y} name={`wafer-shelf-${shelfIndex + 1}`} position={[-0.08, y, 0.78]} userData={{ socket: `wafer-shelf-${shelfIndex + 1}` }}>
          <mesh receiveShadow>
            <cylinderGeometry args={[0.72, 0.72, 0.08, 32]} />
            <meshStandardMaterial color={PALETTE.charcoalSoft} metalness={0.55} roughness={0.3} />
          </mesh>
          {[0, 1, 2, 3].map((waferIndex) => (
            <Wafer key={waferIndex} position={[0, 0.075 + waferIndex * 0.04, 0]} scale={0.72} accent={PALETTE.silicon} />
          ))}
          <RoundedPanel size={[0.46, 0.08, 0.05]} position={[0, -0.015, 0.75]} color={accent} radius={0.025} roughness={0.2} emissive={accent} emissiveIntensity={active ? 0.65 : 0.05} />
        </group>
      ))}
      <group ref={arm} name="wafer-gripper-arm" position={[1.08, 2.18, 0.42]} userData={{ pivot: 'hinge-z', socket: 'robot-shoulder' }}>
        <RoundedPanel size={[0.22, 0.92, 0.24]} position={[0, -0.38, 0]} color={PALETTE.orange} radius={0.08} metalness={0.12} roughness={0.34} />
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.18, 0.18, 0.28, 20]} />
          <meshStandardMaterial color={PALETTE.charcoal} metalness={0.65} roughness={0.25} />
        </mesh>
        <group position={[0, -0.86, 0]}>
          <RoundedPanel size={[0.14, 0.36, 0.13]} position={[-0.12, -0.12, 0]} color={PALETTE.charcoal} radius={0.04} />
          <RoundedPanel size={[0.14, 0.36, 0.13]} position={[0.12, -0.12, 0]} color={PALETTE.charcoal} radius={0.04} />
        </group>
      </group>
      <RoundedPanel size={[1.15, 0.11, 0.05]} position={[-0.1, 0.48, 0.98]} color={accent} radius={0.05} roughness={0.2} emissive={accent} emissiveIntensity={active ? 0.75 : 0.05} />
    </group>
  );
}

function DicingSawMachine({ accent, active }: { accent: string; active: boolean }) {
  const blade = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (active && blade.current) blade.current.rotation.z = -clock.elapsedTime * 3.8;
  });
  return (
    <group
      name="dicing-saw"
      position={[-1.5, 0.38, 0.08]}
      rotation={[0, 0.1, 0]}
      userData={{
        sculptId: 'dicing-saw',
        sourceReference: '/assets/fab/dicing-saw-reference.png',
        pivot: 'base',
        collider: { type: 'box', size: [2.8, 2.6, 2.2] },
        destructionGroup: 'dicing-saw-shell',
      }}
    >
      <RoundedPanel size={[2.85, 0.5, 2.2]} position={[0, 0.25, 0]} color={PALETTE.charcoal} radius={0.2} metalness={0.5} roughness={0.36} />
      <RoundedPanel size={[2.68, 2.18, 2.04]} position={[0, 1.48, 0]} color={PALETTE.shell} radius={0.33} />
      <RoundedPanel size={[2.18, 1.46, 0.07]} position={[-0.12, 1.56, 1.05]} color={PALETTE.cobalt} radius={0.22} roughness={0.13} emissive={PALETTE.cobalt} emissiveIntensity={active ? 0.26 : 0.04} />
      <group ref={blade} name="dicing-blade" position={[0.12, 1.7, 1.1]} userData={{ pivot: 'rotary-z', collider: { type: 'cylinder', radius: 0.42, depth: 0.08 } }}>
        <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.4, 0.4, 0.08, 24]} />
          <meshStandardMaterial color="#aab7bd" metalness={0.92} roughness={0.2} />
        </mesh>
        {Array.from({ length: 18 }, (_, i) => {
          const angle = (i / 18) * Math.PI * 2;
          return (
            <mesh key={i} position={[Math.cos(angle) * 0.43, Math.sin(angle) * 0.43, 0]} rotation={[0, 0, angle]} castShadow>
              <boxGeometry args={[0.12, 0.08, 0.07]} />
              <meshStandardMaterial color="#c8d0d2" metalness={0.88} roughness={0.22} />
            </mesh>
          );
        })}
        <mesh position={[0, 0, 0.07]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.1, 0.1, 0.08, 18]} />
          <meshStandardMaterial color={PALETTE.charcoal} metalness={0.7} roughness={0.25} />
        </mesh>
      </group>
      <group name="dicing-wafer-stage" position={[-0.05, 0.86, 0.86]} userData={{ socket: 'wafer-stage', pivot: 'linear-xz' }}>
        <Wafer position={[0, 0, 0]} scale={0.83} />
        <mesh position={[0, -0.08, 0]}>
          <cylinderGeometry args={[0.58, 0.58, 0.1, 28]} />
          <meshStandardMaterial color="#c7d0d1" metalness={0.66} roughness={0.28} />
        </mesh>
      </group>
      <RoundedPanel size={[0.82, 0.95, 0.24]} position={[1.42, 1.05, 0.72]} color={PALETTE.shellShade} radius={0.14} />
      <RoundedPanel size={[0.56, 0.36, 0.03]} position={[1.42, 1.23, 0.85]} color={PALETTE.cobaltDark} radius={0.07} roughness={0.18} />
      <mesh position={[1.28, 0.9, 0.87]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.1, 0.1, 0.05, 20]} />
        <meshPhysicalMaterial color={accent} emissive={accent} emissiveIntensity={active ? 0.7 : 0.05} />
      </mesh>
      <RoundedPanel size={[0.28, 0.45, 0.16]} position={[-0.35, 0.55, 1.14]} color={PALETTE.orange} radius={0.07} />
      <StatusBeacon position={[0.88, 2.7, 0.12]} accent={accent} />
    </group>
  );
}

function Chip({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <RoundedPanel size={[0.28, 0.08, 0.24]} position={[0, 0, 0]} color="#101817" radius={0.035} metalness={0.42} roughness={0.32} />
      {[-1, 1].flatMap((side) => [-0.08, 0, 0.08].map((z) => (
        <mesh key={`${side}-${z}`} position={[side * 0.17, -0.01, z]}>
          <boxGeometry args={[0.08, 0.025, 0.02]} />
          <meshStandardMaterial color="#d7dbd8" metalness={0.82} roughness={0.26} />
        </mesh>
      )))}
    </group>
  );
}

function PackagingLineMachine({ accent, active }: { accent: string; active: boolean }) {
  const arm = useRef<THREE.Group>(null);
  const belt = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!active) return;
    const t = clock.elapsedTime;
    if (arm.current) arm.current.rotation.z = -0.35 + Math.sin(t * 1.2) * 0.22;
    if (belt.current) belt.current.position.x = ((t * 0.22) % 0.48) - 0.24;
  });
  return (
    <group
      name="packaging-line"
      position={[1.45, 0.38, 0]}
      rotation={[0, -0.08, 0]}
      userData={{
        sculptId: 'packaging-line',
        sourceReference: '/assets/fab/packaging-line-reference.png',
        pivot: 'base',
        collider: { type: 'compound-box', size: [3.25, 2.55, 2.2] },
        destructionGroup: 'packaging-line-shell',
      }}
    >
      <RoundedPanel size={[2.1, 0.48, 2.0]} position={[0, 0.24, 0]} color={PALETTE.charcoal} radius={0.2} metalness={0.48} roughness={0.36} />
      <RoundedPanel size={[2.18, 2.16, 1.96]} position={[0, 1.42, 0]} color={PALETTE.shell} radius={0.32} />
      <RoundedPanel size={[1.72, 1.34, 0.06]} position={[0, 1.55, 1.0]} color={PALETTE.cobalt} radius={0.2} roughness={0.14} emissive={PALETTE.cobalt} emissiveIntensity={active ? 0.25 : 0.04} />
      {[-1, 1].map((side) => (
        <group key={side} name={side < 0 ? 'input-conveyor' : 'output-conveyor'} position={[side * 1.36, 0.68, 0.22]} userData={{ pivot: 'fixed', socket: side < 0 ? 'chip-input' : 'chip-output' }}>
          <RoundedPanel size={[1.28, 0.34, 0.8]} position={[0, 0, 0]} color={PALETTE.shellShade} radius={0.13} />
          <RoundedPanel size={[1.1, 0.09, 0.62]} position={[0, 0.22, 0]} color={PALETTE.charcoalSoft} radius={0.04} metalness={0.55} roughness={0.32} />
          {Array.from({ length: 6 }, (_, i) => (
            <mesh key={i} position={[-0.44 + i * 0.18, 0.28, 0]}>
              <boxGeometry args={[0.025, 0.025, 0.57]} />
              <meshStandardMaterial color="#56625e" metalness={0.55} roughness={0.32} />
            </mesh>
          ))}
          <group ref={side > 0 ? belt : undefined}>
            <Chip position={[side * -0.18, 0.34, 0]} />
            {side > 0 && <Chip position={[0.28, 0.34, 0]} />}
          </group>
        </group>
      ))}
      <group ref={arm} name="pick-place-arm" position={[0, 2.05, 0.82]} userData={{ pivot: 'hinge-z', socket: 'robot-shoulder' }}>
        <RoundedPanel size={[0.24, 0.82, 0.25]} position={[-0.15, -0.35, 0]} color={PALETTE.orange} radius={0.08} metalness={0.14} roughness={0.32} rotation={[0, 0, -0.38]} />
        <RoundedPanel size={[0.22, 0.68, 0.23]} position={[-0.43, -0.82, 0]} color={PALETTE.orange} radius={0.075} metalness={0.14} roughness={0.32} rotation={[0, 0, 0.5]} />
        <mesh position={[-0.58, -1.13, 0]}>
          <cylinderGeometry args={[0.12, 0.12, 0.12, 18]} />
          <meshStandardMaterial color={PALETTE.charcoal} metalness={0.65} roughness={0.27} />
        </mesh>
      </group>
      <RoundedPanel size={[1.2, 0.11, 0.05]} position={[0, 0.55, 1.04]} color={accent} radius={0.05} roughness={0.2} emissive={accent} emissiveIntensity={active ? 0.75 : 0.05} />
      <RoundedPanel size={[0.2, 0.32, 0.1]} position={[0.88, 1.22, 1.08]} color={PALETTE.orange} radius={0.05} />
    </group>
  );
}

function SupportModules({ family, accents, active }: { family: NodeFamily; accents: string[]; active: boolean }) {
  if (family === 'oil') {
    return (
      <group name="fab-support-modules">
        <group position={[0, 0.35, -1.85]} name="etch-and-power-bus">
          {[-1.15, -0.38, 0.38, 1.15].map((x, i) => (
            <group key={x} position={[x, 0, 0]}>
              <RoundedPanel size={[0.58, 0.9, 0.58]} position={[0, 0.45, 0]} color={i % 2 ? PALETTE.shellShade : PALETTE.shell} radius={0.12} />
              <RoundedPanel size={[0.36, 0.12, 0.04]} position={[0, 0.58, 0.31]} color={accents[(i + 2) % accents.length]} radius={0.035} emissive={accents[(i + 2) % accents.length]} emissiveIntensity={active ? 0.4 : 0.03} />
            </group>
          ))}
        </group>
      </group>
    );
  }
  return (
    <group name="cleanroom-support-modules" position={[0, 0.34, -1.82]}>
      {[-1.1, 0, 1.1].map((x, i) => (
        <group key={x} position={[x, 0, 0]} name={i === 1 ? 'cooling-array' : 'test-handler'}>
          <RoundedPanel size={[0.82, 0.88, 0.7]} position={[0, 0.44, 0]} color={PALETTE.shell} radius={0.14} />
          {[0.2, 0.42, 0.64].map((y) => (
            <RoundedPanel key={y} size={[0.48, 0.08, 0.04]} position={[0, y, 0.37]} color={i === 1 ? PALETTE.cobalt : PALETTE.charcoalSoft} radius={0.025} />
          ))}
          <mesh position={[0.26, 0.76, 0.38]}>
            <sphereGeometry args={[0.07, 16, 10]} />
            <meshBasicMaterial color={accents[(i + 2) % accents.length]} toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function FacilityPlatform({ family, accent }: { family: NodeFamily; accent: string }) {
  return (
    <group name={`${family}-facility-platform`}>
      <RoundedPanel size={[7.8, 0.28, 5.6]} position={[0, 0.14, 0]} color="#d9e4de" radius={0.28} roughness={0.7} />
      <RoundedPanel size={[7.28, 0.12, 5.08]} position={[0, 0.34, 0]} color="#f7faf7" radius={0.22} roughness={0.58} />
      {([-1, 1] as const).map((side) => <mesh key={`platform-x-${side}`} position={[side * 3.36, 0.43, 0]}><boxGeometry args={[0.1, 0.12, 3.8]} /><meshBasicMaterial color={accent} transparent opacity={0.72} toneMapped={false} /></mesh>)}
      {([-1, 1] as const).map((side) => <mesh key={`platform-z-${side}`} position={[0, 0.43, side * 2.23]}><boxGeometry args={[5.5, 0.12, 0.1]} /><meshBasicMaterial color={accent} transparent opacity={0.72} toneMapped={false} /></mesh>)}
      {[-3.2, 3.2].flatMap((x) => [-2.15, 2.15].map((z) => (
        <mesh key={`${x}-${z}`} position={[x, 0.34, z]} receiveShadow>
          <cylinderGeometry args={[0.18, 0.22, 0.1, 20]} />
          <meshStandardMaterial color={PALETTE.orange} roughness={0.38} metalness={0.15} />
        </mesh>
      )))}
    </group>
  );
}

export function NodeRig({
  node,
  targetSize = 6,
  onClick,
}: {
  node: RigNodeData;
  targetSize?: number;
  onClick?: (id: string) => void;
}) {
  const family: NodeFamily = node.type === 'mine' ? 'mine' : 'oil';
  const root = useRef<THREE.Group>(null);
  const interaction = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);
  useCursor(hovered && Boolean(onClick));
  const slots = NODE_SLOTS[family];
  const rarities = slots.map((slot) => asRarity(node.components.find((component) => component.slot === slot)?.rarity));
  const accents = rarities.map(rarityHex);
  const topTier = rarities.reduce((top, rarity) => Math.max(top, rarityTier(rarity)), 0);
  const topRarity = RARITIES[topTier];
  const level = node.level ?? 1;
  const active = node.isActive ?? true;
  const auraColor = auraHex(level);
  const theme = levelTheme(level);
  const scale = (targetSize / 8) * theme.scale;
  const moteCount = topTier >= 6 ? 58 : topTier >= 5 ? 38 : topTier >= 4 ? 20 : 0;
  const runtime = useMemo(
    () => ({
      family: family === 'oil' ? 'wafer-fab' : 'cleanroom',
      pivots: family === 'oil' ? ['lithography-machine', 'lens-head', 'wafer-stage', 'wafer-stack', 'wafer-gripper-arm'] : ['dicing-saw', 'dicing-blade', 'dicing-wafer-stage', 'packaging-line', 'pick-place-arm'],
      sockets: family === 'oil' ? ['wafer-input-socket', 'wafer-shelf-1', 'wafer-shelf-2', 'wafer-shelf-3'] : ['wafer-stage', 'chip-input', 'chip-output', 'robot-shoulder'],
      colliders: ['facility-platform', 'primary-machine-a', 'primary-machine-b'],
      destructionGroups: family === 'oil' ? ['lithography-shell', 'wafer-carousel-shell'] : ['dicing-saw-shell', 'packaging-line-shell'],
    }),
    [family]
  );

  useEffect(() => {
    if (root.current) root.current.userData.sculptRuntime = runtime;
  }, [runtime]);

  useFrame((_, delta) => {
    if (!interaction.current) return;
    const target = hovered && onClick ? 1.018 : 1;
    const next = THREE.MathUtils.damp(interaction.current.scale.x, target, 10, delta);
    interaction.current.scale.setScalar(next);
  });

  return (
    <group
      ref={interaction}
      onPointerOver={onClick ? () => setHovered(true) : undefined}
      onPointerOut={onClick ? () => setHovered(false) : undefined}
      onClick={
        onClick
          ? (event) => {
              event.stopPropagation();
              onClick(node.id);
            }
          : undefined
      }
    >
      <group ref={root} name={`${family === 'oil' ? 'wafer-fab' : 'cleanroom'}-${node.id}`} scale={scale}>
        <FacilityPlatform family={family} accent={accents[0]} />
        {family === 'oil' ? (
          <>
            <LithographyMachine accent={accents[0]} active={active} />
            <WaferStackMachine accent={accents[1]} active={active} />
          </>
        ) : (
          <>
            <DicingSawMachine accent={accents[0]} active={active} />
            <PackagingLineMachine accent={accents[1]} active={active} />
          </>
        )}
        <SupportModules family={family} accents={accents} active={active} />
      </group>
      <BayStatusLights color={auraColor} radius={targetSize * 0.74} opacity={0.72} />
      <group scale={targetSize / 4.8}>
        <RarityAura components={node.components} isActive={active} />
      </group>
      {active && moteCount > 0 && (
        <Motes color={rimColor(topRarity)} count={moteCount} area={[1.15 * targetSize, 0.9 * targetSize, 1.15 * targetSize]} size={0.3 * targetSize} speed={0.2} />
      )}
      {active && topTier >= 2 && (
        <pointLight color={rarityHex(topRarity)} intensity={0.22 * rarityFx(topRarity).light} distance={1.4 * targetSize} decay={2} position={[0, 0.5 * targetSize, 0]} />
      )}
    </group>
  );
}
