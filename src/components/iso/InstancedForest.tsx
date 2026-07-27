'use client';

// The forest, as six draw calls instead of thousands.
//
// Six instanced layers cover the whole map: a trunk and three needle tiers for
// live trees, a trunk for dead ones, and one for boulders. The batching itself
// lives in components/iso/instancing, which the Grounds shares — see that file
// for why instancing is not optional here.

import { useMemo } from 'react';
import * as THREE from 'three';
import Layer, { vary } from './instancing';
import { allProps, type MapProp } from '@/lib/deep-forest-map';

/** Foliage greens. Real greens, deliberately not the brand colour. */
const NEEDLE = ['#3f5a33', '#47623a', '#38512d', '#4d6a3f'];
const BARK = '#4a3b2c';
const DEAD_BARK = '#6b6154';
const ROCK = '#6f6b63';

interface Shape {
  height: number;
  spread: number;
  spin: number;
  lean: number;
  needle: THREE.Color;
}

function shapeOf(prop: MapProp): Shape {
  return {
    height: 2.9 + vary(prop.seed, 1) * 2.2,
    spread: 1.15 + vary(prop.seed, 2) * 0.55,
    spin: vary(prop.seed, 3) * Math.PI * 2,
    // A slight lean, because a tree that stands perfectly plumb reads as a lamp
    // post. Small enough that a stand still looks like a wood, not a storm.
    lean: (vary(prop.seed, 4) - 0.5) * 0.13,
    needle: new THREE.Color(NEEDLE[Math.floor(vary(prop.seed, 5) * NEEDLE.length)]),
  };
}

/**
 * No view-distance culling.
 *
 * There was: props were built within 62 units of the PLAYER. That was written
 * when the camera was locked to the player and could not look anywhere else, so
 * distant props were genuinely unseeable. Once IsoRig let the camera pan freely
 * the same rule meant panning away showed bare ground — the forest existed only
 * in a bubble around a character who might be off-screen entirely.
 *
 * The whole map is now 289 props across six instanced draws. Culling that is not
 * worth a frame, let alone the class of bug it just caused.
 */
export default function InstancedForest() {
  const { trees, dead, rocks, shapes } = useMemo(() => {
    const props = allProps();
    const trees = props.filter((p) => p.kind === 'tree');
    return {
      trees,
      dead: props.filter((p) => p.kind === 'dead'),
      rocks: props.filter((p) => p.kind === 'boulder'),
      shapes: trees.map(shapeOf),
    };
  }, []);

  const trunk = useMemo(
    () => (i: number, d: THREE.Object3D) => {
      const p = trees[i];
      const s = shapes[i];
      d.position.set(p.x, s.height * 0.22, p.z);
      d.rotation.set(s.lean, s.spin, 0);
      d.scale.set(1, s.height * 0.45, 1);
    },
    [trees, shapes]
  );

  /**
   * Placement for each of the three tiers.
   *
   * Built as a fixed-length array inside ONE useMemo rather than a function that
   * calls useMemo per tier. Hooks must run in the same order every render, so a
   * hook called from inside a map over tiers is a rule violation that happens to
   * work only while the array length never changes — the kind of thing that
   * breaks silently later, on an unrelated edit.
   */
  const tiers = useMemo(
    () =>
      [0, 1, 2].map((n) => (i: number, d: THREE.Object3D) => {
        const p = trees[i];
        const s = shapes[i];
        const t = n / 2;
        d.position.set(p.x, s.height * (0.4 + t * 0.42), p.z);
        d.rotation.set(s.lean, s.spin, 0);
        const width = s.spread * (1 - t * 0.45);
        d.scale.set(width, s.height * 0.34, width);
      }),
    [trees, shapes]
  );

  const needleColour = useMemo(
    () => (i: number, c: THREE.Color) => c.copy(shapes[i].needle),
    [shapes]
  );

  const deadPlace = useMemo(
    () => (i: number, d: THREE.Object3D) => {
      const p = dead[i];
      const h = 2.4 + vary(p.seed, 1) * 1.6;
      d.position.set(p.x, h / 2, p.z);
      d.rotation.set((vary(p.seed, 3) - 0.5) * 0.3, vary(p.seed, 2) * Math.PI * 2, 0);
      d.scale.set(1, h, 1);
    },
    [dead]
  );

  const rockPlace = useMemo(
    () => (i: number, d: THREE.Object3D) => {
      const p = rocks[i];
      const s = 0.5 + vary(p.seed, 1) * 0.7;
      d.position.set(p.x, s * 0.35, p.z);
      d.rotation.set(vary(p.seed, 2) * 0.3, vary(p.seed, 3) * Math.PI * 2, vary(p.seed, 4) * 0.3);
      d.scale.setScalar(s * 0.55);
    },
    [rocks]
  );

  return (
    <>
      <Layer count={trees.length} flat={BARK} place={trunk}>
        <cylinderGeometry args={[0.09, 0.14, 1, 5]} />
      </Layer>

      {/* Three tiers — the chevrons from the mark, in three dimensions. Each is
          its own instanced layer because they differ in scale per tree, and one
          layer cannot hold three different geometries. */}
      {tiers.map((place, n) => (
        <Layer key={n} count={trees.length} flat="#ffffff" colour={needleColour} place={place}>
          <coneGeometry args={[1, 1, 6]} />
        </Layer>
      ))}

      <Layer count={dead.length} flat={DEAD_BARK} place={deadPlace}>
        <cylinderGeometry args={[0.07, 0.13, 1, 5]} />
      </Layer>

      <Layer count={rocks.length} flat={ROCK} place={rockPlace}>
        <dodecahedronGeometry args={[1, 0]} />
      </Layer>
    </>
  );
}
