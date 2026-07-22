'use client';

// Main 3D canvas: smooth facility-focused camera controls and crisp direct PBR
// rendering of the procedural cleanroom campus.

import { Suspense, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html, useProgress } from '@react-three/drei';
import { Compound, type LightingPreset, nodePosition } from './Compound';
import PostFX from './PostFX';
import type { RigNodeData } from './NodeRig';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';

/**
 * Landing framing.
 *
 * A perspective camera's FOV is vertical, so a portrait viewport keeps the
 * same height and squeezes the width. The wide desktop shot spans roughly 37
 * world units and comfortably holds both the wafer fab (x -13) and cleanroom
 * line (x +9); at a 390px-wide viewport the same camera sees under 10 units
 * and frames the central aisle between them instead of either facility.
 *
 * Portrait therefore gets its own shot: pushed in on the wafer fab with a wider
 * FOV, so the hero of the scene is actually on screen behind the copy.
 */
const LANDING_WIDE = {
  target: new THREE.Vector3(0, 2.2, -3),
  position: new THREE.Vector3(1, 8.8, 17),
  fov: 40,
};
const LANDING_NARROW = {
  target: new THREE.Vector3(-5.3, 2.1, -3),
  position: new THREE.Vector3(-1.6, 8.4, 12),
  fov: 52,
};
/**
 * Aspect below which the wide shot stops holding both facilities.
 *
 * The wide camera sits ~27 units from its target at a 42 degree vertical FOV,
 * so its visible half-width is about 10.3 * aspect. The facilities sit 11 units
 * either side of that target and need roughly 14 units of half-width to clear
 * their own footprints, which only happens above ~1.35. Tablets in portrait
 * (0.75) and even 1024x768 (1.33) fall short, so they get the single-fab shot
 * rather than a framing of the aisle between them.
 */
const NARROW_ASPECT = 1.35;

function CameraRig({ focus, landing = false }: { focus: [number, number, number] | null; landing?: boolean }) {
  const controls = useRef<OrbitControlsImpl>(null);
  const { camera, size } = useThree();
  const narrow = landing && size.width / size.height < NARROW_ASPECT;
  const shot = narrow ? LANDING_NARROW : LANDING_WIDE;
  const desiredTarget = useRef(new THREE.Vector3(0, landing ? 2.2 : 1.8, landing ? -3 : 1));
  const desiredPosition = useRef(new THREE.Vector3(landing ? 1 : 0, landing ? 8.8 : 19, landing ? 17 : 29));
  const transitioning = useRef(false);

  // Widen the lens on narrow viewports so the rig can be framed from closer in
  // without its platform spilling out of the sides.
  useEffect(() => {
    if (!landing) return;
    const perspective = camera as THREE.PerspectiveCamera;
    if (perspective.fov === shot.fov) return;
    perspective.fov = shot.fov;
    perspective.updateProjectionMatrix();
  }, [camera, landing, shot.fov]);

  useEffect(() => {
    if (focus) {
      desiredTarget.current.set(focus[0], 3.2, focus[2]);
      desiredPosition.current.set(focus[0] + 10, 8.5, focus[2] + 12);
    } else if (landing) {
      desiredTarget.current.copy(shot.target);
      desiredPosition.current.copy(shot.position);
    } else {
      desiredTarget.current.set(0, 1.8, 1);
      desiredPosition.current.set(0, 19, 29);
    }
    transitioning.current = true;
  }, [focus, landing, shot]);

  useFrame((_, delta) => {
    const c = controls.current;
    if (!c || !transitioning.current) return;
    camera.position.x = THREE.MathUtils.damp(camera.position.x, desiredPosition.current.x, 7, delta);
    camera.position.y = THREE.MathUtils.damp(camera.position.y, desiredPosition.current.y, 7, delta);
    camera.position.z = THREE.MathUtils.damp(camera.position.z, desiredPosition.current.z, 7, delta);
    c.target.x = THREE.MathUtils.damp(c.target.x, desiredTarget.current.x, 9, delta);
    c.target.y = THREE.MathUtils.damp(c.target.y, desiredTarget.current.y, 9, delta);
    c.target.z = THREE.MathUtils.damp(c.target.z, desiredTarget.current.z, 9, delta);
    c.update();
    if (
      camera.position.distanceTo(desiredPosition.current) < 0.04 &&
      c.target.distanceTo(desiredTarget.current) < 0.03
    ) {
      transitioning.current = false;
    }
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enablePan={false}
      minDistance={7}
      maxDistance={80}
      minPolarAngle={0.15 * Math.PI}
      maxPolarAngle={0.47 * Math.PI}
      enableDamping
      dampingFactor={0.06}
    />
  );
}

function LoadingCompound() {
  const { progress } = useProgress();
  const percentage = Math.max(4, Math.round(progress));
  return (
    <Html center>
      <div
        style={{
          width: 230,
          border: '1px solid rgba(126, 232, 95, 0.35)',
          borderRadius: 10,
          background: 'rgba(12, 14, 18, 0.92)',
          padding: '14px 16px',
          boxShadow: '0 18px 50px rgba(0, 0, 0, 0.45)',
          color: '#a3f58d',
          fontFamily: 'monospace',
        }}
      >
        <div style={{ fontSize: 11, letterSpacing: '0.18em' }}>BOOTING FAB CAMPUS</div>
        <div style={{ marginTop: 10, height: 3, overflow: 'hidden', borderRadius: 3, background: '#27272a' }}>
          <div
            style={{
              width: `${percentage}%`,
              height: '100%',
              borderRadius: 3,
              background: 'linear-gradient(90deg, #238c55, #7ee85f, #b8ff9f)',
              transition: 'width 180ms ease-out',
            }}
          />
        </div>
        <div style={{ marginTop: 7, textAlign: 'right', color: '#a1a1aa', fontSize: 10 }}>{percentage}%</div>
      </div>
    </Html>
  );
}

export default function Scene({
  nodes,
  preset,
  selectedNodeId,
  onSelect,
  focusNodeId,
  variant = 'default',
}: {
  nodes: RigNodeData[];
  preset: LightingPreset;
  selectedNodeId?: string | null;
  onSelect?: (id: string) => void;
  focusNodeId?: string | null;
  variant?: 'default' | 'landing';
}) {
  const landing = variant === 'landing';
  const focus = (() => {
    const requestedId = focusNodeId === undefined ? selectedNodeId : focusNodeId;
    if (!requestedId) return null;
    const oil = nodes.filter((n) => n.type === 'oil');
    const mine = nodes.filter((n) => n.type !== 'oil');
    const oi = oil.findIndex((n) => n.id === requestedId);
    if (oi >= 0) return nodePosition(oi, 'oil', Number(requestedId) || oi);
    const mi = mine.findIndex((n) => n.id === requestedId);
    if (mi >= 0) return nodePosition(mi, 'mine', Number(requestedId) || mi);
    return null;
  })();

  return (
    <Canvas
      shadows="soft"
      dpr={[1, 2]}
      camera={{ position: landing ? [1, 8.8, 17] : [0, 19, 29], fov: landing ? 40 : 44, near: 0.1, far: 420 }}
      gl={{
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: landing ? 1.18 : 1.04,
      }}
      onCreated={({ gl }) => {
        gl.outputColorSpace = THREE.SRGBColorSpace;
      }}
      onPointerMissed={() => onSelect?.('')}
    >
      <Suspense fallback={<LoadingCompound />}>
        <Compound nodes={nodes} preset={preset} selectedNodeId={selectedNodeId} onSelect={onSelect} />
        <CameraRig focus={focus} landing={landing} />
        {/* Wider AO radius than the warehouse interior: this camera sits far
            back over an open campus, so the gaps that need darkening are
            equipment-to-ground rather than panel-to-panel. */}
        <PostFX aoRadius={1.8} aoIntensity={1.9} bloomIntensity={landing ? 0.75 : 0.55} />
      </Suspense>
    </Canvas>
  );
}
