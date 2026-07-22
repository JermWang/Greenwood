'use client';

// The fab shell: an enclosed cleanroom warehouse whose glazing looks out onto a
// real captured sky.
//
// What is outside the building is a sourced HDRI — Poly Haven's CC0 "Rooftop
// Day", see rooftop_day_2k.LICENSE.txt — and nothing else. An earlier pass
// filled the exterior with thirty procedural boxes standing in for a skyline;
// they were drawn in front of that HDRI, so the scene paid for a real captured
// environment and then hid it behind obviously-generated geometry. Boxes are
// gone. If the city needs to change, change the HDRI.
//
// Surfaces come from the procedural PBR library rather than flat colours, so
// the overhead LEDs streak across the floor and the equipment panels hold a
// micro-texture instead of reading as untextured white.

import { useMemo } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import SafeEnvironment from './SafeEnvironment';
import { brushedMetal, epoxyFloor, paintedPanel } from './surfaces';

const WINDOW_Z = [-19, -11, -3, 5, 13, 19];
const WINDOW_X = [-13, -6.5, 0, 6.5, 13];

/**
 * Glazing.
 *
 * `transmission` rather than plain opacity: transmission refracts and tints
 * what is behind the pane, which is what makes the HDRI city read as being
 * *outside* rather than as a picture pasted onto the glass. `ior` is nudged
 * below real glass so the distortion stays legible at this thickness.
 */
function Glass({ args, position }: { args: [number, number, number]; position: [number, number, number] }) {
  return (
    <RoundedBox args={args} radius={0.12} smoothness={2} position={position}>
      <meshPhysicalMaterial
        color="#cfeaf7"
        roughness={0.06}
        metalness={0}
        transmission={0.86}
        thickness={0.35}
        ior={1.32}
        transparent
        opacity={0.5}
        side={THREE.DoubleSide}
      />
    </RoundedBox>
  );
}

function Mullion({ position, args }: { position: [number, number, number]; args: [number, number, number] }) {
  const metal = useMemo(() => brushedMetal(2), []);
  return (
    <mesh position={position} castShadow>
      <boxGeometry args={args} />
      <meshStandardMaterial
        color="#637883"
        metalness={0.72}
        roughness={0.3}
        normalMap={metal.normalMap}
        normalScale={metal.normalScale}
        roughnessMap={metal.roughnessMap}
      />
    </mesh>
  );
}

function WallPanel({
  position,
  args,
  color,
}: {
  position: [number, number, number];
  args: [number, number, number];
  color: string;
}) {
  const panel = useMemo(() => paintedPanel(3), []);
  return (
    <mesh position={position} receiveShadow castShadow>
      <boxGeometry args={args} />
      <meshStandardMaterial
        color={color}
        roughness={0.6}
        metalness={0.14}
        normalMap={panel.normalMap}
        normalScale={panel.normalScale}
        roughnessMap={panel.roughnessMap}
      />
    </mesh>
  );
}

function SideWall({ side }: { side: -1 | 1 }) {
  return (
    <group name={`${side < 0 ? 'west' : 'east'}-window-wall`}>
      <WallPanel position={[side * 17, 1.05, -1.5]} args={[0.46, 2.1, 47]} color="#d9e3e1" />
      <WallPanel position={[side * 17, 9.25, -1.5]} args={[0.46, 2.5, 47]} color="#c9d5d3" />
      {[-23, -15, -7, 1, 9, 17, 22].map((z) => (
        <Mullion key={z} position={[side * 17, 5.2, z]} args={[0.52, 6.3, 0.5]} />
      ))}
      {WINDOW_Z.map((z) => (
        <Glass key={z} args={[0.12, 5.7, 7.35]} position={[side * 16.78, 5.35, z]} />
      ))}
    </group>
  );
}

function EndWall({ z, front = false }: { z: number; front?: boolean }) {
  return (
    <group name={front ? 'loading-wall' : 'north-window-wall'}>
      <WallPanel position={[0, 1.05, z]} args={[34, 2.1, 0.46]} color="#d9e3e1" />
      <WallPanel position={[0, 9.25, z]} args={[34, 2.5, 0.46]} color="#c9d5d3" />
      {[-16.8, -9.75, -3.25, 3.25, 9.75, 16.8].map((x) => (
        <Mullion key={x} position={[x, 5.2, z]} args={[0.5, 6.3, 0.52]} />
      ))}
      {WINDOW_X.map((x) => (
        <Glass key={x} args={[5.85, 5.7, 0.12]} position={[x, 5.35, z + (front ? -0.22 : 0.22)]} />
      ))}
      {front && (
        <RoundedBox args={[7.2, 5.5, 0.38]} radius={0.22} smoothness={2} position={[0, 3.8, z - 0.28]}>
          <meshStandardMaterial color="#273746" metalness={0.6} roughness={0.34} />
        </RoundedBox>
      )}
    </group>
  );
}

function CeilingSystems() {
  const metal = useMemo(() => brushedMetal(2), []);
  const panel = useMemo(() => paintedPanel(6), []);
  const steel = (color: string) => (
    <meshStandardMaterial
      color={color}
      metalness={0.68}
      roughness={0.3}
      normalMap={metal.normalMap}
      normalScale={metal.normalScale}
      roughnessMap={metal.roughnessMap}
    />
  );
  return (
    <group name="warehouse-ceiling">
      <mesh position={[0, 10.48, -1.5]} rotation={[Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[34, 47]} />
        <meshStandardMaterial
          color="#d5dfdc"
          roughness={0.74}
          metalness={0.1}
          normalMap={panel.normalMap}
          normalScale={panel.normalScale}
          roughnessMap={panel.roughnessMap}
          side={THREE.DoubleSide}
        />
      </mesh>
      {[-15, -9, -3, 3, 9, 15].map((x) => (
        <RoundedBox key={`beam-${x}`} args={[0.48, 0.58, 46]} radius={0.08} smoothness={2} position={[x, 9.95, -1.5]} castShadow>
          {steel('#536873')}
        </RoundedBox>
      ))}
      {[-18, -8, 2, 12].map((z) => (
        <RoundedBox key={`cross-${z}`} args={[33, 0.42, 0.46]} radius={0.08} smoothness={2} position={[0, 9.8, z]} castShadow>
          {steel('#6e8188')}
        </RoundedBox>
      ))}
      {[-11.8, -4, 4, 11.8].map((x) => (
        <mesh key={`led-${x}`} position={[x, 9.58, -1.5]}>
          <boxGeometry args={[0.14, 0.09, 39]} />
          {/* Above 1.0 so the bloom threshold catches the strips and nothing else. */}
          <meshBasicMaterial color="#eaffff" toneMapped={false} />
        </mesh>
      ))}
      <RoundedBox args={[2.2, 1.05, 39]} radius={0.28} smoothness={3} position={[0, 9.22, -1.5]} castShadow>
        {steel('#aebbbd')}
      </RoundedBox>
      {[-10, 10].map((x) => (
        <RoundedBox key={`duct-${x}`} args={[1.5, 0.75, 31]} radius={0.22} smoothness={3} position={[x, 9.15, -2]} castShadow>
          {steel('#b8c4c4')}
        </RoundedBox>
      ))}
    </group>
  );
}

function Floor({ onFloor }: { onFloor?: (point: THREE.Vector3) => void }) {
  const epoxy = useMemo(() => epoxyFloor(18), []);
  return (
    <>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, -1.5]}
        receiveShadow
        onPointerDown={
          onFloor
            ? (event: ThreeEvent<PointerEvent>) => {
                event.stopPropagation();
                onFloor(event.point);
              }
            : undefined
        }
      >
        <planeGeometry args={[34, 47]} />
        <meshStandardMaterial
          color="#dce6e3"
          roughness={0.62}
          metalness={0.08}
          normalMap={epoxy.normalMap}
          normalScale={epoxy.normalScale}
          roughnessMap={epoxy.roughnessMap}
        />
      </mesh>
      <gridHelper args={[47, 47, '#86a6ac', '#bdcdcf']} position={[0, 0.018, -1.5]} />
    </>
  );
}

export default function WarehouseEnvironment({ onFloor }: { onFloor?: (point: THREE.Vector3) => void }) {
  const metal = useMemo(() => brushedMetal(2), []);
  return (
    <group name="gpu-city-warehouse">
      {/* backgroundBlurriness 0: the 2K capture is sharp enough to show as-is,
          and blurring it would throw away the detail it was downloaded for. */}
      <SafeEnvironment
        files="/env/rooftop_day_2k.hdr"
        environmentIntensity={0.95}
        background
        backgroundBlurriness={0}
        backgroundIntensity={0.92}
        fallbackSky="#b9d9ee"
      />
      {/* Fog only reaches the far end of a 47-unit room, so it adds depth to the
          interior without hazing the view through the glazing. */}
      <fog attach="fog" args={['#c2d6de', 58, 128]} />
      <hemisphereLight args={['#dff6ff', '#3d5560', 0.85]} />
      <ambientLight intensity={0.22} />
      {/* Sun direction is matched to the HDRI's own sun so cast shadows agree
          with the reflections and the light coming through the windows. */}
      <directionalLight
        position={[-18, 26, 18]}
        intensity={2.6}
        color="#fff3d6"
        castShadow
        shadow-mapSize={[3072, 3072]}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
        shadow-camera-near={1}
        shadow-camera-far={90}
        shadow-bias={-0.00012}
        shadow-normalBias={0.02}
      />
      <directionalLight position={[18, 12, -20]} intensity={0.42} color="#8fd8ff" />

      <Floor onFloor={onFloor} />
      <SideWall side={-1} />
      <SideWall side={1} />
      <EndWall z={-25} />
      <EndWall z={22} front />
      <CeilingSystems />
      {[-13.5, 13.5].flatMap((x) =>
        [-19, -7, 5, 17].map((z) => (
          <RoundedBox key={`${x}-${z}`} args={[0.66, 9.2, 0.66]} radius={0.1} smoothness={2} position={[x, 4.6, z]} castShadow>
            <meshStandardMaterial
              color="#60727a"
              metalness={0.7}
              roughness={0.3}
              normalMap={metal.normalMap}
              normalScale={metal.normalScale}
              roughnessMap={metal.roughnessMap}
            />
          </RoundedBox>
        ))
      )}
    </group>
  );
}
