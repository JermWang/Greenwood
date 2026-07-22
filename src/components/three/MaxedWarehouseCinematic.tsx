'use client';

import { useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { AcceleratorTestRack, EUVUtilityCore } from './Compound';
import { NodeRig, type RigNodeData } from './NodeRig';
import WarehouseEnvironment from './WarehouseEnvironment';

const DIVINE_COMPONENTS = {
  oil: [
    { slot: 'derrick', rarity: 'divine' },
    { slot: 'pump_jack', rarity: 'divine' },
    { slot: 'pipeline', rarity: 'divine' },
    { slot: 'flare_stack', rarity: 'divine' },
  ],
  mine: [
    { slot: 'drill_bit', rarity: 'divine' },
    { slot: 'ore_cart', rarity: 'divine' },
    { slot: 'rail_track', rarity: 'divine' },
    { slot: 'elevator', rarity: 'divine' },
  ],
} as const;

const MAXED_NODES: RigNodeData[] = Array.from({ length: 6 }, (_, index) => {
  const type = index % 2 === 0 ? 'oil' : 'mine';
  return {
    id: `cinematic-max-${index}`,
    type,
    level: 7,
    isActive: true,
    components: DIVINE_COMPONENTS[type].map((component) => ({ ...component })),
  };
});

const POSITIONS: [number, number, number][] = [
  [-8.7, 0, -13.5], [8.7, 0, -13.5],
  [-8.7, 0, -3.5], [8.7, 0, -3.5],
  [-8.7, 0, 6.5], [8.7, 0, 6.5],
];

function CinematicCamera() {
  const { camera } = useThree();
  const path = useMemo(() => new THREE.CatmullRomCurve3([
    new THREE.Vector3(-14.5, 4.1, 17.5),
    new THREE.Vector3(-11.5, 3.6, 4),
    new THREE.Vector3(-2, 6.2, 13.5),
    new THREE.Vector3(12.8, 4.4, 8),
    new THREE.Vector3(10.8, 3.5, -10),
    new THREE.Vector3(0, 6.8, -18),
    new THREE.Vector3(-12.5, 4.2, -9),
  ], true, 'catmullrom', 0.45), []);
  const target = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ clock }) => {
    const progress = (clock.elapsedTime % 18) / 18;
    camera.position.copy(path.getPointAt(progress));
    target.set(Math.sin(progress * Math.PI * 2) * 2.3, 2.1, -4 + Math.cos(progress * Math.PI * 2) * 2.5);
    camera.lookAt(target);
  });
  return null;
}

function ProductionUtilities() {
  return (
    <group name="max-tier-utilities">
      {[-14, -4, 6].map((z) => (
        <group key={z} position={[0, 0.18, z]}>
          <RoundedBox args={[1.15, 0.28, 8.4]} radius={0.11} smoothness={2}><meshStandardMaterial color="#293947" metalness={0.58} roughness={0.35} /></RoundedBox>
          {[-0.28, 0.28].map((x) => <mesh key={x} position={[x, 0.22, 0]}><boxGeometry args={[0.12, 0.08, 7.5]} /><meshBasicMaterial color={x < 0 ? '#46dfff' : '#b7ff4a'} toneMapped={false} /></mesh>)}
        </group>
      ))}
      {[-12.8, 12.8].map((x) => <RoundedBox key={x} args={[0.9, 0.95, 30]} radius={0.2} smoothness={3} position={[x, 8.4, -4]}><meshStandardMaterial color="#a8b8ba" metalness={0.56} roughness={0.34} /></RoundedBox>)}
    </group>
  );
}

function MaxedSetup() {
  return (
    <group name="maxed-company-showcase">
      {MAXED_NODES.map((node, index) => <group key={node.id} position={POSITIONS[index]}><NodeRig node={node} targetSize={6.1} /></group>)}
      <group position={[-5.2, 0, 14]} scale={0.62}><EUVUtilityCore review /></group>
      <group position={[5.2, 0, 14]} scale={0.72}><AcceleratorTestRack review /></group>
      <ProductionUtilities />
    </group>
  );
}

export default function MaxedWarehouseCinematic() {
  return (
    <div className="cinematic-capture-screen">
      <Canvas shadows dpr={[1, 1.35]} camera={{ position: [-14.5, 4.1, 17.5], fov: 48, near: 0.1, far: 150 }} gl={{ antialias: true, powerPreference: 'high-performance', toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.08 }}>
        <WarehouseEnvironment />
        <MaxedSetup />
        <CinematicCamera />
      </Canvas>
    </div>
  );
}
