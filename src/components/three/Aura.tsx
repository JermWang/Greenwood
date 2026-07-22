'use client';

// Tiered machine atmosphere: light beams, motes, orbitals, runes, and halos.

import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Sparkles } from '@react-three/drei';
import { RARITY_ORDER, RARITY_COLOR, rarityTier } from './fx';
import type { Rarity } from '@/lib/rarity';

/** Physical status rails built into a machine bay. */
export function BayStatusLights({ color, radius, opacity = 0.85 }: { color: string; radius: number; opacity?: number }) {
  const half = radius * 0.62;
  const rail = radius * 0.72;
  return (
    <group name="machine-bay-status-rails" position={[0, 0.11, 0]}>
      {([-1, 1] as const).map((side) => (
        <group key={`x-${side}`} position={[side * half, 0, 0]}>
          <mesh><boxGeometry args={[0.11, 0.13, rail]} /><meshBasicMaterial color={color} transparent opacity={opacity} toneMapped={false} /></mesh>
          <pointLight color={color} intensity={opacity * 0.22} distance={radius * 0.8} decay={2} />
        </group>
      ))}
      {([-1, 1] as const).map((side) => (
        <mesh key={`z-${side}`} position={[0, 0, side * half]}><boxGeometry args={[rail, 0.13, 0.11]} /><meshBasicMaterial color={color} transparent opacity={opacity} toneMapped={false} /></mesh>
      ))}
      {([-1, 1] as const).flatMap((x) => ([-1, 1] as const).map((z) => (
        <mesh key={`${x}-${z}`} position={[x * half, 0.22, z * half]}><cylinderGeometry args={[0.09, 0.12, 0.42, 12]} /><meshBasicMaterial color={color} transparent opacity={opacity} toneMapped={false} /></mesh>
      )))}
    </group>
  );
}

export function LightBeam({ color, height, radius, opacity = 0.16 }: { color: string; height: number; radius?: number; opacity?: number }) {
  const mat = useRef<THREE.ShaderMaterial>(null);
  const R = radius ?? 0.07 * height;
  useFrame(({ clock }) => {
    if (mat.current) mat.current.uniforms.uTime.value = clock.elapsedTime;
  });
  const uniforms = useMemo(
    () => ({ uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity }, uTime: { value: 0 } }),
    [color, opacity]
  );
  return (
    <mesh position={[0, height / 2, 0]} renderOrder={6}>
      <cylinderGeometry args={[0.25 * R, R, height, 28, 1, true]} />
      <shaderMaterial
        ref={mat}
        transparent
        depthWrite={false}
        side={THREE.DoubleSide}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
        uniforms={uniforms}
        vertexShader={`varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`}
        fragmentShader={`uniform vec3 uColor; uniform float uOpacity; uniform float uTime; varying vec2 vUv;
void main(){
  float radial = 1.0 - abs(vUv.x - 0.5) * 2.0;
  float vertical = 1.0 - vUv.y * 0.9;
  float shimmer = 0.9 + 0.1 * sin(vUv.y * 6.0 - uTime * 1.6);
  float a = pow(radial, 2.4) * vertical * shimmer * uOpacity;
  gl_FragColor = vec4(uColor, a);
}`}
      />
    </mesh>
  );
}

export function Motes({ color, count, area, size = 4, speed = 0.3 }: { color: string; count: number; area: [number, number, number]; size?: number; speed?: number }) {
  if (count <= 0) return null;
  return (
    <Sparkles
      count={count}
      scale={area}
      position={[0, area[1] / 2, 0]}
      size={size}
      speed={speed}
      color={color}
      opacity={0.8}
    />
  );
}

function HaloCylinder({ radius, height, color, intensity }: { radius: number; height: number; color: string; intensity: number }) {
  const mat = useRef<THREE.ShaderMaterial>(null);
  useFrame(({ clock }) => {
    if (mat.current)
      mat.current.uniforms.uIntensity.value = intensity * (0.82 + 0.18 * Math.sin(0.8 * clock.elapsedTime * Math.PI));
  });
  const uniforms = useMemo(
    () => ({ uColor: { value: new THREE.Color(color) }, uIntensity: { value: intensity } }),
    [color, intensity]
  );
  return (
    <mesh position={[0, 0.5 + height / 2, 0]} renderOrder={5}>
      <cylinderGeometry args={[radius, 0.7 * radius, height, 32, 1, true]} />
      <shaderMaterial
        ref={mat}
        transparent
        depthWrite={false}
        side={THREE.DoubleSide}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
        uniforms={uniforms}
        vertexShader={`varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`}
        fragmentShader={`uniform vec3 uColor; uniform float uIntensity; varying vec2 vUv;
void main(){
  float radial = 1.0 - abs(vUv.x - 0.5) * 2.0;
  float vertical = 1.0 - vUv.y * 0.85;
  float alpha = pow(radial, 2.0) * vertical * 0.20;
  gl_FragColor = vec4(uColor * min(uIntensity, 2.5), alpha);
}`}
      />
    </mesh>
  );
}

function DivineBeam({ color }: { color: string }) {
  const mat = useRef<THREE.ShaderMaterial>(null);
  useFrame(({ clock }) => {
    if (mat.current) mat.current.uniforms.uTime.value = clock.elapsedTime;
  });
  const uniforms = useMemo(() => ({ uColor: { value: new THREE.Color(color) }, uTime: { value: 0 } }), [color]);
  return (
    <mesh position={[0, 4.5, 0]} renderOrder={7}>
      <cylinderGeometry args={[0.15, 0.35, 8, 20, 1, true]} />
      <shaderMaterial
        ref={mat}
        transparent
        depthWrite={false}
        side={THREE.DoubleSide}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
        uniforms={uniforms}
        vertexShader={`varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`}
        fragmentShader={`uniform vec3 uColor; uniform float uTime; varying vec2 vUv;
void main(){
  float radial = 1.0 - abs(vUv.x - 0.5) * 2.0;
  float vertical = 1.0 - vUv.y * 0.9;
  float shimmer = 0.88 + 0.12 * sin(vUv.y * 8.0 - uTime * 2.0);
  float alpha = pow(radial, 2.5) * vertical * shimmer * 0.30;
  gl_FragColor = vec4(uColor * 1.6, alpha);
}`}
      />
    </mesh>
  );
}

export function RarityAura({
  components,
  tierOverride,
  isActive = true,
  lowPerf = false,
}: {
  components: Array<{ rarity: string }>;
  tierOverride?: number;
  isActive?: boolean;
  lowPerf?: boolean;
}) {
  const tier = tierOverride ?? components.reduce((m, c) => Math.max(m, rarityTier(c.rarity)), 0);
  if (tier <= 0) return null;
  const rarity = RARITY_ORDER[tier] as Rarity;
  const color = RARITY_COLOR[rarity];
  const d = lowPerf ? Math.floor((10 + 10 * tier) / 2) : 10 + 12 * tier;

  // Ground-level state is expressed by physical bay rails on the rig itself;
  // rarity flair stays above the machine so the floor remains architectural.
  return (
    <group>
      {tier >= 3 && isActive && (
        <Sparkles count={Math.floor(0.4 * d)} scale={[4, 1.5, 4]} size={1.3} speed={0.3} position={[0, 0.7, 0]} color={color} opacity={0.18} />
      )}
      {tier >= 4 && isActive && !lowPerf && (
        <Sparkles count={Math.floor(0.6 * d)} scale={[2.2, 4, 2.2]} size={1} speed={0.6} position={[0, 2, 0]} color={color} opacity={0.16} />
      )}
      {tier === 5 && <HaloCylinder radius={1.2} height={3.2} color={color} intensity={2.2} />}
      {tier >= 6 && <DivineBeam color={color} />}
    </group>
  );
}
