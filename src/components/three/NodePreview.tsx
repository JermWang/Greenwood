'use client';

// Single-desk turntable, used by the inventory cards and the handbook.
//
// This renders the same desk models as the isometric board rather than a
// second, differently-styled sculpt: an Equity Desk in the inventory has to be
// recognisably the object the player sees on their floor. The one departure
// from the board is the camera — here it orbits, because a card is the only
// place a player can look at a single desk from more than one side.

import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import Desk from '@/components/iso/DeskModels';
import { ISO, type MachineKind } from '@/components/iso/palette';

/** The node shape the preview needs. Structurally what the pages already pass. */
export interface RigNodeData {
  id: string;
  type: 'oil' | 'mine';
  level: number;
  isActive?: boolean;
  components: Array<{ slot: string; rarity: string }>;
}

/** Matches IsoTwin, so a desk is the same colour here as it is on the board. */
function accentFor(type: 'oil' | 'mine', level: number): string {
  if (type === 'oil') return level >= 7 ? ISO.bright : level >= 4 ? ISO.accent : ISO.deep;
  return level >= 7 ? ISO.mint : level >= 4 ? ISO.deep : '#0b7d47';
}

/** Desks are authored at board scale (~1 unit wide); fill the card instead. */
const MODEL_SCALE = 2.6;

export default function NodePreview({
  node,
  className = '',
}: {
  node: RigNodeData;
  className?: string;
}) {
  const kind: MachineKind = node.type === 'oil' ? 'euv' : 'rack';
  const accent = accentFor(node.type, node.level);

  return (
    <div
      className={`relative overflow-hidden rounded-lg border border-ink-600 bg-ink-900 ${className}`}
      aria-label={`Interactive 3D preview of ${node.type === 'oil' ? 'an Equity Desk' : 'a Treasury Desk'}`}
    >
      <Canvas
        shadows
        dpr={[1, 1.5]}
        camera={{ position: [5.2, 4.4, 5.8], fov: 40 }}
        gl={{ antialias: true, alpha: true, toneMapping: THREE.ACESFilmicToneMapping }}
      >
        {/* Same daylight rig as the board — warm key, cool sky, neutral fill.
            Nothing tinted toward the brand colour, or every matte surface here
            would read green regardless of the material it is meant to be. */}
        <ambientLight color="#ffffff" intensity={0.55} />
        <hemisphereLight color="#cfe0ee" groundColor="#6d6154" intensity={0.85} />
        <directionalLight
          color="#fff4e2"
          intensity={2.0}
          position={[6, 9, 4]}
          castShadow
          shadow-mapSize={[1024, 1024]}
          shadow-bias={-0.0012}
        />
        <directionalLight color="#9fbcd6" intensity={0.5} position={[-6, 4, -5]} />

        {/* No Suspense boundary: every model here is built from primitives in
            code, so there is nothing to stream and nothing to fall back to. */}
        <group position={[0, -1.4, 0]} scale={MODEL_SCALE}>
          <Desk kind={kind} accent={accent} />
        </group>

        {/* A plain shadow catcher so the desk sits on something. */}
        <mesh position={[0, -1.4, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <circleGeometry args={[3.4, 48]} />
          <shadowMaterial opacity={0.28} />
        </mesh>

        <OrbitControls
          makeDefault
          autoRotate
          autoRotateSpeed={0.8}
          enablePan={false}
          minDistance={5}
          maxDistance={12}
          minPolarAngle={0.25 * Math.PI}
          maxPolarAngle={0.49 * Math.PI}
          target={[0, 0.6, 0]}
        />
      </Canvas>
      <div className="pointer-events-none absolute bottom-2 right-2 rounded bg-ink-900/70 px-2 py-1 font-mono text-[9px] uppercase tracking-widest text-steel-400">
        Drag to rotate · scroll to zoom
      </div>
    </div>
  );
}
