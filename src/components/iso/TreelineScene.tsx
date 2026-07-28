'use client';

// The Treeline, rendered: amber dusk, a service track, and the wood closing in.
//
// THE MIDDLE TERM. The Grounds are an overcast afternoon and the Deep Forest is
// a bad night. This is the light going — warm, low, still readable. Nothing here
// looks hostile, and the hostiles are real. That gap is the whole job: the first
// place that can hurt you should not announce itself, or the Deep Forest has
// nothing left to escalate to.
//
// The trees come from lib/treeline-map and their SPECIES from lib/woodcutting,
// which is why this region matters mechanically as well as tonally: black pine
// grows here in quantity, so the crafting ladder opens at level 6 rather than
// behind the PvP gate at 10.

import { memo, useMemo } from 'react';
import * as THREE from 'three';
import Layer, { vary } from './instancing';
import { gridTexture } from './mapkit';
import { ISO } from './palette';
import PlaceLabel from './PlaceLabel';
import { SPECIES, speciesAt } from '@/lib/woodcutting';
import { BOUNDS, DOORS, TRACK_HALF, TRACK_Z, allProps, type MapProp } from '@/lib/treeline-map';

const DEAD_BARK = '#6b6154';
const ROCK = '#6f6b63';

/** Sky at dusk. Warm, and darker than the Grounds by a clear step. */
const SKY = '#6b5744';

/**
 * Amber dusk.
 *
 * A low warm key from the west, a cold sky fill, and enough ambient to keep the
 * near field readable. The colour does the telling — this is the same world as
 * the Grounds an hour later, not a different art direction.
 *
 * Fog is linear and starts past the player, for the reason documented at length
 * in GroundsScene: the isometric rig sits ~45 units from whatever it looks at,
 * so every fragment begins at that depth and a fog whose near is below it hazes
 * the player's own boots. Thicker than the Grounds' though — you should lose the
 * far end of this place, because losing it is what makes the Deep Forest's total
 * loss of sight feel like a continuation rather than a new rule.
 */
const TreelineLighting = memo(function TreelineLighting() {
  return (
    <>
      <color attach="background" args={[SKY]} />
      <fog attach="fog" args={[SKY, 50, 88]} />
      <hemisphereLight color="#8a7a63" groundColor="#3a3227" intensity={1.0} />
      <ambientLight color="#c9a978" intensity={0.4} />
      {/* The sun, nearly down. Long shadows are most of what says "dusk". */}
      <directionalLight
        color="#e8a457"
        intensity={1.55}
        position={[-26, 12, 8]}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0011}
        shadow-normalBias={0.02}
      >
        <orthographicCamera attach="shadow-camera" args={[-34, 34, 34, -34, 1, 110]} />
      </directionalLight>
      {/* Cold fill from the opposite side — the part of the sky the sun has
          already left. Without it dusk reads as a single orange wash. */}
      <directionalLight color="#5c7392" intensity={0.42} position={[20, 14, -12]} />
    </>
  );
});

const CENTRE = {
  x: (BOUNDS.minX + BOUNDS.maxX) / 2,
  z: (BOUNDS.minZ + BOUNDS.maxZ) / 2,
};
const GROUND_PAD = 90;

const Ground = memo(function Ground() {
  const span = Math.max(BOUNDS.maxX - BOUNDS.minX, BOUNDS.maxZ - BOUNDS.minZ) + 1 + GROUND_PAD;
  // Duller and browner than the Grounds' mown green — this is scrub, not lawn.
  const texture = useMemo(() => gridTexture('#4a4a33', 'rgba(190, 186, 150, 0.16)', span), [span]);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[CENTRE.x, -0.02, CENTRE.z]} receiveShadow>
      <planeGeometry args={[span, span]} />
      <meshStandardMaterial map={texture} color="#ffffff" roughness={1} metalness={0} />
    </mesh>
  );
});

/**
 * The service track.
 *
 * One quad, matching `onPath` in the map module. Gravel rather than paving —
 * this is maintained just enough to drive down, which is the most the settlement
 * bothers with out here.
 */
const Track = memo(function Track() {
  const w = BOUNDS.maxX - BOUNDS.minX + 1;
  const d = TRACK_HALF * 2 + 1;
  const texture = useMemo(() => gridTexture('#5e5647', 'rgba(40, 36, 30, 0.2)', 1), []);
  const t = useMemo(() => {
    const c = texture.clone();
    c.needsUpdate = true;
    c.repeat.set(w, d);
    return c;
  }, [texture, w, d]);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[CENTRE.x, 0.006, TRACK_Z]} receiveShadow>
      <planeGeometry args={[w, d]} />
      <meshStandardMaterial map={t} color="#ffffff" roughness={0.98} metalness={0} />
    </mesh>
  );
});

/** Trees, dead trunks and boulders, batched. Species decides the colours. */
const Scatter = memo(function Scatter({ felled }: { felled: Set<string> }) {
  const { trees, dead, rocks, shapes } = useMemo(() => {
    const props = allProps();
    // Felled trees leave the instance buffer rather than being hidden — an
    // InstancedMesh has no per-instance visibility flag. See InstancedForest.
    const standing = props.filter((p) => p.kind === 'tree' && !felled.has(`${p.x}:${p.z}`));
    return {
      trees: standing,
      dead: props.filter((p) => p.kind === 'dead'),
      rocks: props.filter((p) => p.kind === 'boulder'),
      shapes: standing.map((p: MapProp) => {
        const species = SPECIES[speciesAt('treeline', p.x, p.z)];
        return {
          height: 3.0 + vary(p.seed, 1) * 2.3,
          spread: 1.2 + vary(p.seed, 2) * 0.6,
          spin: vary(p.seed, 3) * Math.PI * 2,
          lean: (vary(p.seed, 4) - 0.5) * 0.12,
          needle: new THREE.Color(species.needle),
          bark: new THREE.Color(species.bark),
        };
      }),
    };
  }, [felled]);

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

  // One useMemo returning a fixed-length array, NOT a useMemo per tier — hooks
  // must run in the same order every render.
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

  const needleColour = useMemo(() => (i: number, c: THREE.Color) => c.copy(shapes[i].needle), [shapes]);
  const barkColour = useMemo(() => (i: number, c: THREE.Color) => c.copy(shapes[i].bark), [shapes]);

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
      <Layer count={trees.length} flat="#ffffff" colour={barkColour} place={trunk}>
        <cylinderGeometry args={[0.09, 0.14, 1, 5]} />
      </Layer>
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
});

const TreelineScene = memo(function TreelineScene({ felled }: { felled: Set<string> }) {
  return (
    <>
      <TreelineLighting />
      <Ground />
      <Track />
      <Scatter felled={felled} />

      {/* Both ends of the track. Labels read from the door table so a sign can
          never name a different place than the one behind it — see the fence
          gate in GroundsScene for what that bug looked like. */}
      {DOORS.map((d) => (
        <group key={d.id} position={[d.x, 0, d.z]}>
          {[-1.6, 1.6].map((o) => (
            <mesh key={o} position={[0, 1.7, o]} castShadow>
              <boxGeometry args={[0.22, 3.4, 0.22]} />
              <meshStandardMaterial color={ISO.steelDark} flatShading roughness={0.5} metalness={0.6} />
            </mesh>
          ))}
          <mesh position={[0, 3.5, 0]} castShadow>
            <boxGeometry args={[0.26, 0.26, 3.6]} />
            <meshStandardMaterial color={ISO.steelDark} flatShading roughness={0.5} metalness={0.6} />
          </mesh>
          {/* The only neon out here. Under a dying sky it stops meaning
              "Greenwood" and starts meaning "this still has power". */}
          <mesh position={[0.16, 3.5, 0]}>
            <boxGeometry args={[0.05, 0.1, 3.2]} />
            <meshStandardMaterial
              color={ISO.accent}
              emissive={ISO.accent}
              emissiveIntensity={1.7}
              toneMapped={false}
              flatShading
            />
          </mesh>
          <pointLight position={[0, 3, 0]} color={ISO.accent} intensity={6} distance={13} decay={2} />
          <PlaceLabel position={[0, 4.3, 0]}>{d.label}</PlaceLabel>
        </group>
      ))}
    </>
  );
});

export default TreelineScene;
