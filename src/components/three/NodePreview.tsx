'use client';

import { Suspense } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import { NodeRig, type RigNodeData } from './NodeRig';

export default function NodePreview({
  node,
  className = '',
}: {
  node: RigNodeData;
  className?: string;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-lg border border-ink-600 bg-ink-900 ${className}`}
      aria-label={`Interactive 3D preview of ${node.type === 'oil' ? 'a wafer fab' : 'a cleanroom line'}`}
    >
      <Canvas
        shadows
        dpr={[1, 1.5]}
        camera={{ position: [7.5, 6.2, 8.5], fov: 42 }}
        gl={{ antialias: true, alpha: true, toneMapping: THREE.ACESFilmicToneMapping }}
      >
        <ambientLight intensity={0.75} />
        <hemisphereLight args={['#dbeafe', '#3f2a16', 1.2]} />
        <directionalLight position={[6, 10, 7]} intensity={2.4} castShadow />
        <pointLight position={[-5, 4, -4]} color="#f59e0b" intensity={1.2} distance={18} />
        <Suspense
          fallback={
            <Html center>
              <span className="whitespace-nowrap font-mono text-[10px] uppercase tracking-widest text-amber-500">
                Loading model…
              </span>
            </Html>
          }
        >
          <group position={[0, -0.9, 0]}>
            <NodeRig node={node} targetSize={7.2} />
          </group>
        </Suspense>
        <OrbitControls
          makeDefault
          autoRotate
          autoRotateSpeed={0.8}
          enablePan={false}
          minDistance={7}
          maxDistance={16}
          minPolarAngle={0.25 * Math.PI}
          maxPolarAngle={0.49 * Math.PI}
          target={[0, 1.1, 0]}
        />
      </Canvas>
      <div className="pointer-events-none absolute bottom-2 right-2 rounded bg-ink-900/70 px-2 py-1 font-mono text-[9px] uppercase tracking-widest text-steel-400">
        Drag to rotate · scroll to zoom
      </div>
    </div>
  );
}
