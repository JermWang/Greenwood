'use client';

// Greenwood HQ, rendered: a paved plaza, a fountain, and the tower.
//
// THE BRIEF IS THE OPPOSITE OF THE GROUNDS.
//
// The Grounds are landscaped and organic — grass, scattered trees, a path worn
// through them. HQ is BUILT: paving to the building line, furniture placed by
// hand on an axis, and a tower with enough floors that you have to look up.
// Walking from one to the other should feel like stepping off a lawn onto a
// concourse, and that contrast is doing the pacing work — this is the last
// civilised place before the fence starts meaning something.
//
// The furniture is a written list in lib/hq-map, not a generator. A generator
// can make a convincing WOOD, because a wood has no author and its only rule is
// that trees do not overlap. It cannot make a convincing SQUARE, because every
// object in a square was put there by somebody for a reason, and the reasons are
// what the eye reads.
//
// The tower is the first thing in this game with real VERTICAL mass. Everything
// so far has been one storey under an isometric camera, where height is nearly
// free; a nine-storey block is the first object that can dominate a frame, so it
// is set back at the north end and stepped inward as it rises. Both of those are
// there to stop it eating the plaza it is supposed to stand on.

import { memo, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import Layer from './instancing';
import { gridTexture } from './mapkit';
import { ISO } from './palette';
import PlaceLabel from './PlaceLabel';
import { StreetPlanter } from './OutdoorDressing';
import { Bench } from './MapDressing';
import { BOUNDS, DOORS, FOUNTAIN, TOWER, allProps } from '@/lib/hq-map';

const SKY = '#aebac4';

/** Overcast, matching the Grounds so the two read as one afternoon. */
const HqLighting = memo(function HqLighting() {
  return (
    <>
      <color attach="background" args={[SKY]} />
      <hemisphereLight color="#dce6ee" groundColor="#6b6b62" intensity={1.3} />
      <ambientLight color="#ffffff" intensity={0.45} />
      <directionalLight
        color="#fdf8ee"
        intensity={1.2}
        position={[22, 34, 18]}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0012}
        shadow-normalBias={0.02}
      >
        {/* Sized to take the tower's shadow, which is far longer than anything
            the Grounds ever had to cast. */}
        <orthographicCamera attach="shadow-camera" args={[-46, 46, 46, -46, 1, 140]} />
      </directionalLight>
      <directionalLight color="#b6c8d8" intensity={0.35} position={[-18, 14, -14]} />
    </>
  );
});

const CENTRE = {
  x: (BOUNDS.minX + BOUNDS.maxX) / 2,
  z: (BOUNDS.minZ + BOUNDS.maxZ) / 2,
};
/** Drawn past the playable edge so the boundary is never the visible edge. */
const GROUND_PAD = 90;

const Ground = memo(function Ground() {
  const span = Math.max(BOUNDS.maxX - BOUNDS.minX, BOUNDS.maxZ - BOUNDS.minZ) + 1 + GROUND_PAD;
  // Paving, not grass. Odd span and an integer centre keep grid lines on tile
  // edges — see the same note in GroundsScene.
  const texture = useMemo(() => gridTexture('#8a877e', 'rgba(48, 46, 42, 0.22)', span), [span]);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[CENTRE.x, -0.02, CENTRE.z]} receiveShadow>
      <planeGeometry args={[span, span]} />
      <meshStandardMaterial map={texture} color="#ffffff" roughness={0.97} metalness={0} />
    </mesh>
  );
});

/**
 * The tower.
 *
 * Nine storeys in three stepped blocks, each set in from the one below. The
 * setbacks are load-bearing rather than decorative: a plain extruded box at this
 * height reads as a wall and flattens the whole frame, where steps give the eye
 * something to climb and keep the silhouette from being a rectangle.
 *
 * Window bands rather than individual windows — at this zoom a grid of separate
 * panes turns to noise, and a lit horizontal band per floor is what actually
 * says "there are floors in here", which is the one fact the exterior has to
 * communicate before the elevator exists.
 */
const Tower = memo(function Tower() {
  const w = TOWER.maxX - TOWER.minX + 1;
  const d = TOWER.maxZ - TOWER.minZ + 1;
  const cx = (TOWER.minX + TOWER.maxX) / 2;
  const cz = (TOWER.minZ + TOWER.maxZ) / 2;

  /** Base height, inset, storeys — bottom block first. */
  const blocks = [
    { h: 9, inset: 0, floors: 3 },
    { h: 8, inset: 1.6, floors: 3 },
    { h: 7, inset: 3.2, floors: 3 },
  ];

  let y = 0;
  const parts: React.ReactNode[] = [];
  blocks.forEach((b, i) => {
    const bw = w - b.inset * 2;
    const bd = d - b.inset * 2;
    parts.push(
      <group key={`b${i}`} position={[cx, y, cz]}>
        <mesh position={[0, b.h / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[bw, b.h, bd]} />
          <meshStandardMaterial color={ISO.concreteAlt} flatShading roughness={0.94} />
        </mesh>
        {/* Floor bands. One per storey, on all four faces, so the count reads
            from any angle the camera can be at. */}
        {Array.from({ length: b.floors }, (_, f) => {
          const fy = (b.h / b.floors) * (f + 0.55);
          return (
            <group key={f} position={[0, fy, 0]}>
              {[
                [0, bd / 2 + 0.02, bw - 0.8, 0.06],
                [0, -bd / 2 - 0.02, bw - 0.8, 0.06],
              ].map(([ox, oz, sw, sd]) => (
                <mesh key={`z${oz}`} position={[ox, 0, oz]}>
                  <boxGeometry args={[sw, 0.55, sd]} />
                  <meshStandardMaterial
                    color={ISO.glass}
                    emissive="#ffe9b0"
                    emissiveIntensity={0.5}
                    toneMapped={false}
                    flatShading
                  />
                </mesh>
              ))}
              {[bw / 2 + 0.02, -bw / 2 - 0.02].map((ox) => (
                <mesh key={`x${ox}`} position={[ox, 0, 0]}>
                  <boxGeometry args={[0.06, 0.55, bd - 0.8]} />
                  <meshStandardMaterial
                    color={ISO.glass}
                    emissive="#ffe9b0"
                    emissiveIntensity={0.5}
                    toneMapped={false}
                    flatShading
                  />
                </mesh>
              ))}
            </group>
          );
        })}
        {/* Parapet, so each block ends on an edge rather than a cut. */}
        <mesh position={[0, b.h + 0.16, 0]} castShadow>
          <boxGeometry args={[bw + 0.4, 0.32, bd + 0.4]} />
          <meshStandardMaterial color={ISO.concreteDark} flatShading roughness={0.95} />
        </mesh>
      </group>
    );
    y += b.h + 0.32;
  });

  return (
    <group>
      {parts}
      {/* Roof plant. Every one of these buildings is a generator housing, and
          the ducting is true long before the game admits it. */}
      <mesh position={[cx + 2, y + 0.8, cz]} castShadow>
        <boxGeometry args={[3, 1.6, 2.2]} />
        <meshStandardMaterial color={ISO.steelDark} flatShading roughness={0.7} metalness={0.4} />
      </mesh>
      <mesh position={[cx - 3, y + 1.4, cz - 1]} castShadow>
        <cylinderGeometry args={[0.5, 0.6, 2.8, 8]} />
        <meshStandardMaterial color={ISO.steelDark} flatShading roughness={0.7} metalness={0.4} />
      </mesh>
      {/* Mast light. The tallest lit thing in the settlement, and the only one
          visible from outside it — which is why "one of the last lit
          settlements" is a thing anybody could say. */}
      <mesh position={[cx, y + 3.4, cz]}>
        <boxGeometry args={[0.3, 0.3, 0.3]} />
        <meshStandardMaterial
          color={ISO.accent}
          emissive={ISO.accent}
          emissiveIntensity={2}
          toneMapped={false}
        />
      </mesh>
      <pointLight position={[cx, y + 3.4, cz]} color={ISO.accent} intensity={12} distance={26} decay={2} />

      {/* Entrance canopy over the door, on the south face. */}
      <group position={[0, 0, TOWER.maxZ + 0.5]}>
        <mesh position={[0, 3.4, 0.9]} castShadow>
          <boxGeometry args={[7, 0.3, 2.4]} />
          <meshStandardMaterial color={ISO.concreteDark} flatShading roughness={0.95} />
        </mesh>
        {[-3.2, 3.2].map((x) => (
          <mesh key={x} position={[x, 1.7, 1.9]} castShadow>
            <boxGeometry args={[0.28, 3.4, 0.28]} />
            <meshStandardMaterial color={ISO.steelDark} flatShading roughness={0.5} metalness={0.55} />
          </mesh>
        ))}
        {/* The doorway itself: a dark opening, not a slab. It has to read as
            passable from across the plaza. */}
        <mesh position={[0, 1.6, 0.06]}>
          <boxGeometry args={[4.4, 3.2, 0.1]} />
          <meshStandardMaterial color="#16150f" flatShading roughness={1} />
        </mesh>
        <mesh position={[0, 3.32, 0.14]}>
          <boxGeometry args={[4.8, 0.22, 0.1]} />
          <meshStandardMaterial
            color={ISO.accent}
            emissive={ISO.accent}
            emissiveIntensity={1.5}
            toneMapped={false}
            flatShading
          />
        </mesh>
        <pointLight position={[0, 3, 2.6]} color={ISO.accent} intensity={7} distance={12} decay={2} />
      </group>

      <PlaceLabel position={[cx, y + 5.2, cz]}>Greenwood HQ</PlaceLabel>
    </group>
  );
});

/**
 * The fountain.
 *
 * Load-bearing for the fiction rather than decorative: a fountain is the single
 * most legible signal that a place is civic and maintained — somebody pays for
 * the water, somebody cleans it — and this is the last such place before the
 * Treeline. It is also the shape a player will navigate by, which is why it sits
 * dead centre of the concourse.
 */
const Fountain = memo(function Fountain() {
  const jet = useRef<THREE.Mesh>(null);
  // Sine on elapsed time rather than a per-frame accumulator, so every client
  // sees the same water at the same moment — the same rule the gate pulses use.
  useFrame((s) => {
    if (jet.current) {
      const t = s.clock.elapsedTime;
      jet.current.scale.y = 1 + Math.sin(t * 2.4) * 0.14;
    }
  });

  const r = FOUNTAIN.radius;
  return (
    <group position={[FOUNTAIN.x, 0, FOUNTAIN.z]}>
      {/* Basin wall, then the water inside it, sunk so the wall reads as a rim. */}
      <mesh position={[0, 0.22, 0]} receiveShadow castShadow>
        <cylinderGeometry args={[r, r, 0.44, 16]} />
        <meshStandardMaterial color={ISO.concrete} flatShading roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.4, 0]}>
        <cylinderGeometry args={[r - 0.35, r - 0.35, 0.1, 16]} />
        <meshStandardMaterial
          color="#4b7f96"
          roughness={0.15}
          metalness={0.25}
          emissive="#1d3f52"
          emissiveIntensity={0.35}
        />
      </mesh>
      {/* Plinth and jet. */}
      <mesh position={[0, 0.7, 0]} castShadow>
        <cylinderGeometry args={[0.45, 0.6, 1, 8]} />
        <meshStandardMaterial color={ISO.concreteAlt} flatShading roughness={0.95} />
      </mesh>
      <mesh ref={jet} position={[0, 1.7, 0]}>
        <cylinderGeometry args={[0.12, 0.2, 1.1, 6]} />
        <meshStandardMaterial
          color="#bfe4f0"
          transparent
          opacity={0.72}
          roughness={0.1}
          emissive="#7fb8cc"
          emissiveIntensity={0.5}
        />
      </mesh>
    </group>
  );
});

/**
 * Street furniture.
 *
 * Every piece is placed by hand in lib/hq-map — see PLACED there for the three
 * composition rules. This file only draws what that list says.
 *
 * The bench is the REAL bench, the one the Trading Floor's lounge already uses.
 * It was an instanced flat box, which is what you reach for when you are
 * thinking about draw calls instead of about the room: a plank on the ground
 * with no legs and no back, at the one scale where a player walks right past it.
 * There are five of them. Instancing five objects saves nothing and cost the
 * plaza the only piece of furniture anybody actually looks at.
 */
const Furniture = memo(function Furniture() {
  const { lamps, benches, planters } = useMemo(() => {
    const props = allProps();
    return {
      lamps: props.filter((p) => p.kind === 'lamp'),
      benches: props.filter((p) => p.kind === 'bench'),
      planters: props.filter((p) => p.kind === 'planter'),
    };
  }, []);

  const lampPost = useMemo(
    () => (i: number, d: THREE.Object3D) => {
      const p = lamps[i];
      d.position.set(p.x, 1.5, p.z);
      d.rotation.set(0, 0, 0);
      d.scale.set(1, 3, 1);
    },
    [lamps]
  );

  return (
    <>
      {/* Posts stay instanced — there are twenty of them and they are identical
          cylinders, which is exactly the case instancing is for. */}
      <Layer count={lamps.length} flat={ISO.steelDark} place={lampPost} roughness={0.5} metalness={0.5}>
        <cylinderGeometry args={[0.08, 0.11, 1, 6]} />
      </Layer>
      {lamps.map((p) => (
        <group key={`h${p.x}:${p.z}`} position={[p.x, 3.1, p.z]}>
          <mesh>
            <boxGeometry args={[0.36, 0.16, 0.36]} />
            <meshStandardMaterial
              color="#ffe9b0"
              emissive="#ffe9b0"
              emissiveIntensity={1.6}
              toneMapped={false}
              flatShading
            />
          </mesh>
          <pointLight color="#ffe4a3" intensity={4} distance={8} decay={2} />
        </group>
      ))}

      {benches.map((p) => (
        <Bench key={`b${p.x}:${p.z}`} position={[p.x, p.z]} rotation={p.rotation} />
      ))}

      {planters.map((p) => (
        <StreetPlanter key={`p${p.x}:${p.z}`} position={[p.x, p.z]} seed={p.seed} />
      ))}
    </>
  );
});

const HqScene = memo(function HqScene() {
  return (
    <>
      <HqLighting />
      <Ground />
      <Tower />
      <Fountain />
      <Furniture />

      {/* Signage on the two doors that lead somewhere with a scene. The tower's
          own sign is drawn with the building. */}
      {DOORS.filter((d) => d.id !== 'lobby').map((d) => (
        <PlaceLabel key={d.id} position={[d.x, 3.4, d.z]}>
          {d.label}
        </PlaceLabel>
      ))}
    </>
  );
});

export default HqScene;
