'use client';

// The GPU campus: a bright modular fab floor with cleanroom bays, service
// gantries, and procedural equipment. Protocol family IDs remain `oil` and
// `mine`; the presentation layer treats them as Wafer Fab and Cleanroom.

import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import SafeEnvironment from './SafeEnvironment';
import { concrete, epoxyFloor, paintedPanel } from './surfaces';
import { NodeRig, type RigNodeData } from './NodeRig';

export type LightingPreset = 'sunset' | 'dusk' | 'neutral' | 'night';

export const LIGHTING_PRESETS: Record<
  LightingPreset,
  {
    key: [number, number, number];
    keyColor: string;
    keyIntensity: number;
    fill: number;
    sky: string;
    fog: string;
    envIntensity: number;
    label: string;
  }
> = {
  sunset: { key: [28, 34, 18], keyColor: '#effff3', keyIntensity: 2.3, fill: 0.62, sky: '#dff0e7', fog: '#d8ebe0', envIntensity: 0.65, label: 'Shift A' },
  dusk: { key: [22, 22, -22], keyColor: '#b8d5ff', keyIntensity: 1.6, fill: 0.44, sky: '#182c37', fog: '#263c43', envIntensity: 0.4, label: 'Shift B' },
  neutral: { key: [18, 42, 22], keyColor: '#ffffff', keyIntensity: 2.6, fill: 0.68, sky: '#eaf4ef', fog: '#dfece6', envIntensity: 0.8, label: 'Inspection' },
  night: { key: [-18, 20, -28], keyColor: '#7ea5ff', keyIntensity: 0.9, fill: 0.28, sky: '#071411', fog: '#10241e', envIntensity: 0.24, label: 'Night Shift' },
};

/** Two production wings per row, with deterministic offsets for expansion. */
export function nodePosition(index: number, family: 'oil' | 'mine', seed: number): [number, number, number] {
  const side = family === 'oil' ? -1 : 1;
  const row = Math.floor(index / 2);
  const inner = index % 2;
  const x = side * (5.3 + inner * 9.8);
  const z = -3 + row * 10.4 + ((seed % 5) - 2) * 0.12;
  return [x, 0, z];
}

/** Hero campus used only on the public landing page. */
export const SHOWROOM_NODES: RigNodeData[] = [
  {
    id: 'showroom-fab',
    type: 'oil',
    level: 7,
    isActive: true,
    components: [
      { slot: 'derrick', rarity: 'legendary' },
      { slot: 'pump_jack', rarity: 'epic' },
      { slot: 'pipeline', rarity: 'legendary' },
      { slot: 'flare_stack', rarity: 'rare' },
    ],
  },
  {
    id: 'showroom-cleanroom',
    type: 'mine',
    level: 7,
    isActive: true,
    components: [
      { slot: 'drill_bit', rarity: 'legendary' },
      { slot: 'ore_cart', rarity: 'epic' },
      { slot: 'rail_track', rarity: 'legendary' },
      { slot: 'elevator', rarity: 'rare' },
    ],
  },
];

function FloorMark({ position, color, rotation = 0 }: { position: [number, number, number]; color: string; rotation?: number }) {
  return (
    <mesh position={position} rotation={[-Math.PI / 2, 0, rotation]} receiveShadow>
      <planeGeometry args={[4.8, 0.16]} />
      <meshBasicMaterial color={color} transparent opacity={0.74} toneMapped={false} />
    </mesh>
  );
}

function CleanroomFloor({ preset }: { preset: LightingPreset }) {
  const dark = preset === 'night' || preset === 'dusk';
  // The apron is coarse poured concrete; the inner bay is poured epoxy. Giving
  // them different roughness maps is what separates them visually at a glance,
  // rather than relying on the two flat greys being noticeably different.
  const apron = useMemo(() => concrete(26), []);
  const bay = useMemo(() => epoxyFloor(22), []);
  return (
    <group>
      <mesh position={[0, -0.2, 6]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[116, 92]} />
        <meshStandardMaterial
          color={dark ? '#14221d' : '#dce7e1'}
          roughness={0.84}
          metalness={0.03}
          normalMap={apron.normalMap}
          normalScale={apron.normalScale}
          roughnessMap={apron.roughnessMap}
        />
      </mesh>
      <mesh position={[0, -0.16, 6]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[104, 80]} />
        <meshStandardMaterial
          color={dark ? '#1b2c25' : '#edf3ef'}
          roughness={0.7}
          metalness={0.05}
          normalMap={bay.normalMap}
          normalScale={bay.normalScale}
          roughnessMap={bay.roughnessMap}
        />
      </mesh>
      <gridHelper
        args={[104, 52, dark ? '#355449' : '#b5c7be', dark ? '#263e35' : '#d0ddd6']}
        position={[0, -0.12, 6]}
        userData={{ role: 'floor-panel-seams' }}
      />
      <mesh position={[-8.8, -0.105, 6]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[16.2, 72]} />
        <meshBasicMaterial color="#7ae86b" transparent opacity={dark ? 0.035 : 0.055} />
      </mesh>
      <mesh position={[8.8, -0.104, 6]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[16.2, 72]} />
        <meshBasicMaterial color="#3d78ee" transparent opacity={dark ? 0.035 : 0.05} />
      </mesh>
      {Array.from({ length: 7 }, (_, i) => (
        <group key={i}>
          <FloorMark position={[-8.8, -0.09, -25 + i * 10]} color="#75d967" />
          <FloorMark position={[8.8, -0.09, -25 + i * 10]} color="#3e77e8" />
        </group>
      ))}
    </group>
  );
}

function WaferMonument() {
  const wafer = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (wafer.current) wafer.current.rotation.y = clock.elapsedTime * 0.18;
  });
  return (
    <group position={[0, 1.4, -18.5]} name="wafer-monument">
      <RoundedBox args={[6.2, 0.55, 2.2]} radius={0.2} smoothness={3} position={[0, -0.86, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#18231f" metalness={0.6} roughness={0.32} />
      </RoundedBox>
      <mesh ref={wafer} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[1.75, 1.75, 0.16, 48]} />
        <meshPhysicalMaterial color="#526dff" metalness={0.62} roughness={0.18} clearcoat={0.8} clearcoatRoughness={0.12} />
      </mesh>
      <mesh position={[0, 0, 0.11]} rotation={[0, 0, 0]}>
        <ringGeometry args={[1.18, 1.27, 44]} />
        <meshBasicMaterial color="#a8f678" transparent opacity={0.75} toneMapped={false} />
      </mesh>
    </group>
  );
}

function UtilityCable({ x, side }: { x: number; side: -1 | 1 }) {
  const path = useMemo(
    () => new THREE.CatmullRomCurve3([
      new THREE.Vector3(x, 0.08, 1.23),
      new THREE.Vector3(x, -0.32, 1.42),
      new THREE.Vector3(x + side * 0.04, -0.78, 1.13),
    ]),
    [side, x]
  );
  return (
    <mesh castShadow userData={{ attachment: 'embedded', parentSocket: side < 0 ? 'left-utility-bank' : 'right-utility-bank', gapTolerance: 0.01 }}>
      <tubeGeometry args={[path, 12, 0.075, 10, false]} />
      <meshStandardMaterial color="#222b35" metalness={0.34} roughness={0.5} />
    </mesh>
  );
}

/** Image-to-procedural reconstruction: EUV utility core reference. */
export function EUVUtilityCore({ review = false }: { review?: boolean } = {}) {
  const chamber = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (chamber.current) chamber.current.rotation.z = clock.elapsedTime * 0.12;
  });
  return (
    <group
      name="euv-utility-core"
      position={review ? [0, 0.12, 0] : [-5.4, 0.12, -17.7]}
      rotation={[0, 0.08, 0]}
      scale={0.92}
      userData={{
        sculptId: 'euv-utility-core',
        sourceReference: '/assets/fab/euv-utility-core-reference.png',
        pivot: 'base',
        collider: { type: 'compound-box', size: [5.8, 3.6, 2.9] },
        destructionGroups: ['central-chamber', 'left-utility-bank', 'right-utility-bank'],
        sockets: ['euv-beam-output', 'left-utility-bank', 'right-utility-bank', 'service-beacon'],
      }}
    >
      <RoundedBox args={[5.9, 0.42, 2.85]} radius={0.2} smoothness={3} position={[0, 0.21, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#202936" metalness={0.52} roughness={0.36} />
      </RoundedBox>
      <group name="central-chamber" position={[0, 1.62, 0]} userData={{ pivot: 'center', socket: 'euv-beam-output' }}>
        <mesh castShadow>
          <cylinderGeometry args={[1.42, 1.42, 2.12, 36]} />
          <meshPhysicalMaterial color="#eff3f7" roughness={0.44} clearcoat={0.2} clearcoatRoughness={0.5} />
        </mesh>
        <group ref={chamber} position={[0, 0, 1.52]}>
          <mesh castShadow>
            <torusGeometry args={[0.78, 0.24, 16, 40]} />
            <meshPhysicalMaterial color="#f3f6f8" roughness={0.38} clearcoat={0.28} />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.06]}>
            <cylinderGeometry args={[0.68, 0.68, 0.14, 36]} />
            <meshPhysicalMaterial color="#1978ee" emissive="#0b69ff" emissiveIntensity={0.75} roughness={0.12} metalness={0.2} />
          </mesh>
          <mesh position={[0, 0, 0.17]}>
            <torusGeometry args={[0.47, 0.075, 12, 32]} />
            <meshStandardMaterial color="#0c3d98" metalness={0.52} roughness={0.2} />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.22]}>
            <cylinderGeometry args={[0.22, 0.22, 0.24, 24]} />
            <meshPhysicalMaterial color="#6de6ff" emissive="#22bfff" emissiveIntensity={1.15} roughness={0.1} />
          </mesh>
          {Array.from({ length: 6 }, (_, i) => {
            const angle = (i / 6) * Math.PI * 2;
            return <mesh key={`inner-${i}`} position={[Math.cos(angle) * 0.49, Math.sin(angle) * 0.49, 0.21]} rotation={[0, 0, angle]}><boxGeometry args={[0.18, 0.07, 0.07]} /><meshBasicMaterial color="#8bdcff" toneMapped={false} /></mesh>;
          })}
          {Array.from({ length: 8 }, (_, i) => {
            const angle = (i / 8) * Math.PI * 2;
            return <mesh key={i} position={[Math.cos(angle) * 0.8, Math.sin(angle) * 0.8, 0.18]} rotation={[0, 0, angle]}><boxGeometry args={[0.18, 0.1, 0.08]} /><meshBasicMaterial color="#91f45f" toneMapped={false} /></mesh>;
          })}
        </group>
        <mesh position={[0, 1.18, 0]}>
          <cylinderGeometry args={[0.74, 0.9, 0.25, 32]} />
          <meshPhysicalMaterial color="#e9eff4" roughness={0.4} />
        </mesh>
        <mesh position={[0, 1.34, 0]}>
          <cylinderGeometry args={[0.53, 0.53, 0.12, 32]} />
          <meshPhysicalMaterial color="#2487f1" emissive="#1673de" emissiveIntensity={0.32} roughness={0.15} />
        </mesh>
      </group>
      {([-1, 1] as const).map((side) => (
        <group key={side} name={side < 0 ? 'left-utility-bank' : 'right-utility-bank'} position={[side * 2.08, 1.38, 0]} userData={{ pivot: 'base', socket: `${side < 0 ? 'left' : 'right'}-utility-bank` }}>
          <RoundedBox args={[1.62, 2.42, 2.3]} radius={0.3} smoothness={3} castShadow>
            <meshPhysicalMaterial color="#edf2f5" roughness={0.46} clearcoat={0.16} />
          </RoundedBox>
          {[-0.35, -0.12, 0.12, 0.35].map((y) => <mesh key={y} position={[0, y + 0.48, 1.19]}><boxGeometry args={[0.92, 0.1, 0.07]} /><meshBasicMaterial color="#176ce0" toneMapped={false} /></mesh>)}
          {[-0.32, 0, 0.32].map((x) => <UtilityCable key={x} x={x} side={side} />)}
        </group>
      ))}
      <group name="service-beacon" position={[2.52, 2.85, 0.22]} userData={{ pivot: 'base', socket: 'service-beacon' }}>
        <mesh><cylinderGeometry args={[0.16, 0.18, 0.12, 18]} /><meshStandardMaterial color="#252c35" metalness={0.55} roughness={0.38} /></mesh>
        <mesh position={[0, 0.16, 0]}><cylinderGeometry args={[0.12, 0.12, 0.24, 18]} /><meshPhysicalMaterial color="#ff8a25" emissive="#ff7916" emissiveIntensity={0.85} roughness={0.2} /></mesh>
      </group>
    </group>
  );
}

/** Image-to-procedural reconstruction: accelerator validation rack reference. */
export function AcceleratorTestRack({ review = false }: { review?: boolean } = {}) {
  const arm = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (arm.current) arm.current.rotation.z = -0.28 + Math.sin(clock.elapsedTime * 0.72) * 0.15;
  });
  return (
    <group
      name="ai-accelerator-test-rack"
      position={review ? [0, 0.12, 0] : [5.4, 0.12, -18.1]}
      rotation={[0, -0.1, 0]}
      scale={0.88}
      userData={{
        sculptId: 'ai-accelerator-test-rack',
        sourceReference: '/assets/fab/ai-accelerator-test-rack-reference.png',
        pivot: 'base',
        collider: { type: 'box', size: [3.5, 4.4, 2.8] },
        destructionGroups: ['rack-shell', 'accelerator-tray-system', 'probe-arm', 'cooling-manifold'],
        sockets: ['tray-bay-1', 'tray-bay-2', 'tray-bay-3', 'tray-bay-4', 'probe-shoulder'],
      }}
    >
      <RoundedBox args={[3.58, 0.45, 2.82]} radius={0.22} smoothness={3} position={[0, 0.23, 0]} castShadow receiveShadow><meshStandardMaterial color="#202936" metalness={0.5} roughness={0.36} /></RoundedBox>
      <RoundedBox args={[3.16, 3.86, 2.55]} radius={0.38} smoothness={3} position={[0, 2.2, 0]} castShadow><meshPhysicalMaterial color="#eff3f7" roughness={0.44} clearcoat={0.2} /></RoundedBox>
      <RoundedBox args={[1.72, 0.08, 1.12]} radius={0.12} smoothness={2} position={[0, 4.16, 0]}><meshStandardMaterial color="#1c63d5" metalness={0.3} roughness={0.32} /></RoundedBox>
      {[-0.48, -0.24, 0, 0.24, 0.48].map((x) => <mesh key={x} position={[x, 4.22, 0]}><boxGeometry args={[0.08, 0.04, 0.78]} /><meshStandardMaterial color="#202936" metalness={0.62} roughness={0.3} /></mesh>)}
      <RoundedBox args={[2.45, 2.92, 0.09]} radius={0.22} smoothness={3} position={[-0.2, 2.23, 1.32]}><meshStandardMaterial color="#0c2f72" roughness={0.3} metalness={0.2} /></RoundedBox>
      {[0.95, 1.68, 2.41, 3.14].map((y, index) => (
        <group key={y} name={`accelerator-tray-${index + 1}`} position={[-0.22, y, 1.4]} userData={{ pivot: 'linear-z', socket: `tray-bay-${index + 1}`, collider: { type: 'box', size: [2, 0.48, 0.32] } }}>
          <RoundedBox args={[2.02, 0.48, 0.34]} radius={0.1} smoothness={2} castShadow><meshStandardMaterial color="#235cc6" metalness={0.28} roughness={0.34} /></RoundedBox>
          <RoundedBox args={[0.72, 0.16, 0.04]} radius={0.04} smoothness={2} position={[0, 0, 0.2]}><meshBasicMaterial color="#38d9ef" toneMapped={false} /></RoundedBox>
          <mesh position={[0.76, 0, 0.2]}><boxGeometry args={[0.09, 0.16, 0.04]} /><meshBasicMaterial color="#91f45f" toneMapped={false} /></mesh>
        </group>
      ))}
      <group ref={arm} name="probe-arm" position={[1.63, 3.24, 0.3]} userData={{ pivot: 'hinge-z', socket: 'probe-shoulder', contactType: 'hinge' }}>
        <mesh rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.3, 0.3, 0.32, 24]} /><meshStandardMaterial color="#1761cf" metalness={0.46} roughness={0.28} /></mesh>
        <RoundedBox args={[0.32, 1.1, 0.32]} radius={0.12} smoothness={3} position={[0.28, -0.46, 0]} rotation={[0, 0, -0.48]}><meshPhysicalMaterial color="#edf2f5" roughness={0.42} /></RoundedBox>
        <group name="probe-elbow" position={[0.55, -0.94, 0]} userData={{ pivot: 'hinge-z' }}>
          <mesh><sphereGeometry args={[0.24, 20, 14]} /><meshStandardMaterial color="#25303d" metalness={0.55} roughness={0.3} /></mesh>
          <RoundedBox args={[0.28, 0.92, 0.28]} radius={0.1} smoothness={3} position={[-0.2, -0.4, 0]} rotation={[0, 0, 0.45]}><meshPhysicalMaterial color="#edf2f5" roughness={0.42} /></RoundedBox>
        </group>
      </group>
      <group name="cooling-manifold" position={[1.25, 0.74, 1.05]} userData={{ pivot: 'base', socket: 'coolant-return' }}>
        {[-0.34, 0, 0.34].map((x) => <mesh key={x} position={[x, 0, 0]}><torusGeometry args={[0.19, 0.065, 8, 18, Math.PI]} /><meshStandardMaterial color="#17488e" roughness={0.42} metalness={0.25} /></mesh>)}
      </group>
    </group>
  );
}

function ServiceGantry({ preset }: { preset: LightingPreset }) {
  const dark = preset === 'night' || preset === 'dusk';
  return (
    <group name="service-gantry" position={[0, 0, -14]}>
      {[-22, 0, 22].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          {[-1, 1].map((side) => (
            <RoundedBox key={side} args={[0.6, 7.8, 0.7]} radius={0.12} smoothness={2} position={[side * 6.8, 3.7, 0]} castShadow>
              <meshStandardMaterial color={dark ? '#273b34' : '#c7d5cd'} metalness={0.55} roughness={0.38} />
            </RoundedBox>
          ))}
          <RoundedBox args={[14.2, 0.6, 0.72]} radius={0.13} smoothness={2} position={[0, 7.25, 0]} castShadow>
            <meshStandardMaterial color={dark ? '#263a33' : '#d4e0d9'} metalness={0.52} roughness={0.38} />
          </RoundedBox>
          {[-4.8, 0, 4.8].map((lightX) => (
            <mesh key={lightX} position={[lightX, 6.9, 0.36]}>
              <boxGeometry args={[2.4, 0.08, 0.16]} />
              <meshBasicMaterial color={dark ? '#89aaff' : '#eafff3'} toneMapped={false} />
            </mesh>
          ))}
        </group>
      ))}
      <WaferMonument />
    </group>
  );
}

function RearCleanroomWall({ preset }: { preset: LightingPreset }) {
  const dark = preset === 'night' || preset === 'dusk';
  const panel = useMemo(() => paintedPanel(8), []);
  return (
    <group position={[0, 3.4, -24]}>
      <mesh receiveShadow>
        <boxGeometry args={[108, 7, 0.6]} />
        <meshStandardMaterial
          color={dark ? '#132720' : '#e8f0eb'}
          roughness={0.66}
          metalness={0.08}
          normalMap={panel.normalMap}
          normalScale={panel.normalScale}
          roughnessMap={panel.roughnessMap}
        />
      </mesh>
      {Array.from({ length: 12 }, (_, i) => {
        const x = -49.5 + i * 9;
        return (
          <group key={i} position={[x, 0.1, 0.34]}>
            <RoundedBox args={[6.7, 3.6, 0.14]} radius={0.16} smoothness={2}>
              <meshPhysicalMaterial color={dark ? '#163652' : '#85bcec'} roughness={0.16} metalness={0.18} transmission={0.08} transparent opacity={0.82} />
            </RoundedBox>
            <mesh position={[0, -2.36, 0.08]}>
              <boxGeometry args={[6.4, 0.12, 0.08]} />
              <meshBasicMaterial color={i % 2 ? '#76e067' : '#4d7bf0'} toneMapped={false} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

function SelectionFixture() {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.position.y = 0.34 + 0.08 * Math.sin(clock.elapsedTime * 3);
  });
  return (
    <group ref={ref} position={[0, 0.34, 0]} name="inspection-selection-fixture">
      {([-1, 1] as const).flatMap((x) => ([-1, 1] as const).map((z) => (
        <group key={`${x}-${z}`} position={[x * 4.3, 0.45, z * 3.2]}>
          <RoundedBox args={[0.18, 1.05, 0.18]} radius={0.05} smoothness={2}><meshBasicMaterial color="#b7ff4a" toneMapped={false} /></RoundedBox>
          <pointLight color="#b7ff4a" intensity={0.55} distance={3.2} decay={2} position={[0, 0.54, 0]} />
        </group>
      )))}
      <RoundedBox args={[2.7, 0.15, 0.22]} radius={0.06} smoothness={2} position={[0, 5.8, 0]}><meshBasicMaterial color="#b7ff4a" toneMapped={false} /></RoundedBox>
    </group>
  );
}

export function Compound({
  nodes,
  preset,
  selectedNodeId,
  onSelect,
}: {
  nodes: RigNodeData[];
  preset: LightingPreset;
  selectedNodeId?: string | null;
  onSelect?: (id: string) => void;
}) {
  const p = LIGHTING_PRESETS[preset];
  const byFamily = useMemo(
    () => ({
      oil: nodes.filter((node) => node.type === 'oil'),
      mine: nodes.filter((node) => node.type !== 'oil'),
    }),
    [nodes]
  );

  return (
    <group>
      <color attach="background" args={[p.sky]} />
      <fog attach="fog" args={[p.fog, 72, 210]} />
      <hemisphereLight color={preset === 'night' ? '#526f9c' : '#d9f6e5'} groundColor={preset === 'night' ? '#07110e' : '#799386'} intensity={p.fill * 1.35} />
      <ambientLight intensity={p.fill * 0.28} />
      <directionalLight
        position={p.key}
        color={p.keyColor}
        intensity={p.keyIntensity}
        castShadow
        shadow-mapSize={[4096, 4096]}
        shadow-intensity={0.58}
        shadow-bias={-0.0001}
        shadow-normalBias={0.024}
        shadow-camera-left={-48}
        shadow-camera-right={48}
        shadow-camera-top={48}
        shadow-camera-bottom={-48}
        shadow-camera-near={1}
        shadow-camera-far={120}
      />
      <directionalLight position={[-28, 20, 24]} color={preset === 'night' ? '#4467af' : '#8dd9ff'} intensity={p.fill * 1.25} />
      <SafeEnvironment files="/env/cape_hill_1k.hdr" environmentIntensity={p.envIntensity} background={false} fallbackSky={p.sky} />

      <CleanroomFloor preset={preset} />
      <RearCleanroomWall preset={preset} />
      <ServiceGantry preset={preset} />
      <EUVUtilityCore />
      <AcceleratorTestRack />

      {byFamily.oil.map((node, index) => (
        <group key={node.id} position={nodePosition(index, 'oil', Number(node.id) || index)}>
          <NodeRig node={node} targetSize={8} onClick={onSelect} />
          {selectedNodeId === node.id && <SelectionFixture />}
        </group>
      ))}
      {byFamily.mine.map((node, index) => (
        <group key={node.id} position={nodePosition(index, 'mine', Number(node.id) || index)}>
          <NodeRig node={node} targetSize={8} onClick={onSelect} />
          {selectedNodeId === node.id && <SelectionFixture />}
        </group>
      ))}
    </group>
  );
}
