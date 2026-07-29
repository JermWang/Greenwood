'use client';

// One instanced draw call, parameterised.
//
// Extracted from InstancedForest, which learned this the expensive way: the Deep
// Forest used to mount one <Tree> per prop, and each Tree is a group of five
// meshes. At a couple of thousand trees that is ten thousand objects for three.js
// to cull, sort and submit every frame, and the zone ran in single digits.
//
// InstancedMesh submits one geometry many times in a single call, with a
// per-instance matrix carrying position, rotation and scale. What it costs is
// per-instance MATERIAL variation — every instance shares one material — which
// is recovered as per-instance COLOUR, so a stand of trees still reads as many
// different trees rather than one tree stamped repeatedly.
//
// Lives here rather than in either scene because both outdoor regions need it
// and neither owns it. The Grounds would otherwise have copied it, and a copied
// batching routine is a batching routine that gets fixed in one place.

import { useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';

/**
 * Deterministic per-prop variation, seeded from the prop's own seed.
 *
 * Sine-hash rather than the map modules' integer hash, because this only ever
 * decides APPEARANCE. Position comes from the map, which is shared with the
 * server and must be exact; how tall a particular tree is has no consequence
 * beyond the frame it is drawn in.
 */
export function vary(seed: number, salt: number): number {
  const n = Math.sin(seed * 12.9898 + salt * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

export interface LayerProps {
  count: number;
  /** Base colour. White when `colour` is supplied, since the two multiply. */
  flat: string;
  /** Geometry for the instance, as a JSX child. */
  children: React.ReactNode;
  /** Write the transform for instance `i` onto `dummy`. */
  place: (i: number, dummy: THREE.Object3D) => void;
  /** Optional per-instance tint. */
  colour?: (i: number, c: THREE.Color) => void;
  roughness?: number;
  metalness?: number;
}

/**
 * `place` writes a matrix per instance. Done in a layout effect rather than on
 * every frame — scenery never moves, so the matrices are written once and the
 * BNTY replays them for free. `instanceMatrix.needsUpdate` is the one thing that
 * must not be forgotten, or nothing appears and nothing errors.
 */
export default function Layer({
  count,
  colour,
  flat,
  children,
  place,
  roughness = 0.92,
  metalness = 0.03,
}: LayerProps) {
  const ref = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh || count === 0) return;
    const dummy = new THREE.Object3D();
    const c = new THREE.Color();
    for (let i = 0; i < count; i += 1) {
      place(i, dummy);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      if (colour) {
        colour(i, c);
        mesh.setColorAt(i, c);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    // Frustum culling off: the bounding sphere three.js computes for an
    // InstancedMesh comes from the base geometry, not the spread of instances,
    // so scenery spanning a whole map would vanish the moment its origin left
    // the view.
    mesh.frustumCulled = false;
  }, [count, place, colour]);

  if (count === 0) return null;
  return (
    <instancedMesh ref={ref} args={[undefined as never, undefined as never, count]} castShadow receiveShadow>
      {children}
      <meshStandardMaterial color={flat} flatShading roughness={roughness} metalness={metalness} />
    </instancedMesh>
  );
}
