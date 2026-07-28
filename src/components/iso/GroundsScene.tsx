'use client';

// Greenwood Grounds, rendered.
//
// The brief for this scene is unusual: it has to be UNREMARKABLE. Every other
// place in the game is trying to be interesting — the Machine Room is a machine
// room, the Deep Forest is the turn. This is a landscaped car park on an
// overcast afternoon, and it works precisely to the degree that a player walks
// through it without thinking about it.
//
// That is doing two jobs at once:
//
//   IT IS THE NAVIGATION. CLAUDE.md forbids a nav rail because navigation
//   happens in the world; this is the world that claim was waiting on. Doors are
//   things you walk to.
//
//   IT IS THE CONTROL SAMPLE. The reveal in docs/greenwood-turn.md needs a
//   baseline of ordinariness to be measured against. A player who has spent an
//   hour in a pleasant, well-kept, boring park is a player for whom the fence at
//   the north end means something. If this scene ever gets atmospheric, the Deep
//   Forest loses the thing it is contrasted with.
//
// The one deliberate wrongness is the fence, and it is left entirely to the
// player to notice: it is too tall for a car park, its top is angled inward, and
// its floodlights point away from the settlement. Nobody lights a perimeter to
// look at their own car park. There is no text anywhere drawing attention to it.

import { memo, useMemo } from 'react';
import * as THREE from 'three';
import Layer, { vary } from './instancing';
import { gridTexture } from './mapkit';
import { ISO } from './palette';
import PlaceLabel from './PlaceLabel';
import { FenceSection, Planter, SettlementBuilding } from './OutdoorDressing';
import { SPECIES, speciesAt } from '@/lib/woodcutting';
import {
  allProps,
  BOUNDS,
  BUILDINGS,
  DOORS,
  ENTRANCE,
  FENCE_GAP,
  FENCE_Z,
  FORECOURT_HALF,
  type MapProp,
} from '@/lib/grounds-map';

/** Foliage greens. Real greens, deliberately not the brand colour. */
const NEEDLE = ['#4a6b3c', '#537447', '#425f34', '#5c7d4c'];
const BARK = '#4a3b2c';
const ROCK = '#78746c';

/**
 * Overcast afternoon.
 *
 * Bright, low-contrast, and slightly cool — a white sky, which is what an
 * overcast day actually is. The key light is weak and the hemisphere light does
 * most of the work, so shadows are soft and shallow rather than absent: kill
 * them entirely and everything looks pasted onto the ground.
 *
 * Fog is HAZE here, not a wall — and the numbers have to be derived rather than
 * guessed, because this camera makes the obvious ones wrong.
 *
 * The rig sits at ISO_OFFSET, about 45 units from whatever it is looking at, so
 * EVERY fragment starts at view depth ~45 and nothing is ever nearer than that.
 * A fog whose near is below 45 hazes the player's own boots. Worse, the depth
 * axis is not the screen axis you would expect: moving one tile toward +Z pushes
 * a point 0.577 units further from the camera and 0.408 units DOWN the screen,
 * so the bottom of the viewport is the far distance and the top is the near
 * ground. Fog therefore thickens downward, which looks wrong written down and is
 * exactly right on screen.
 *
 * near 58 clears the player and the whole upper half of the view; far 100 is
 * past the bottom edge at any sensible zoom. The Deep Forest's exponential fog
 * would be wrong here — that one is a wall you stop seeing through before you
 * stop walking, and the point of this region is that you can see across it.
 */
const SKY = '#aebac4';

function GroundsLighting() {
  return (
    <>
      <color attach="background" args={[SKY]} />
      <fog attach="fog" args={[SKY, 58, 100]} />
      <hemisphereLight color="#dce6ee" groundColor="#6b6b58" intensity={1.35} />
      <ambientLight color="#ffffff" intensity={0.45} />
      <directionalLight
        color="#fdf8ee"
        intensity={1.15}
        position={[22, 30, 16]}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0012}
        shadow-normalBias={0.02}
      >
        {/*
          Sized to the map, unlike the Deep Forest's, because there is no fog to
          hide the far end behind. An 81x81 map on a 2048 shadow map is about 25
          texels per world unit, which holds up for the soft shadows an overcast
          sky casts anyway.
        */}
        <orthographicCamera attach="shadow-camera" args={[-46, 46, 46, -46, 1, 120]} />
      </directionalLight>
      {/* Cool bounce from the opposite side, so unlit faces are not flat black.
          Every surface here is flat-shaded, which makes that failure obvious. */}
      <directionalLight color="#b6c8d8" intensity={0.35} position={[-18, 12, -14]} />
    </>
  );
}

/**
 * Mown grass with the tile grid on it. One draw, whatever the map's size.
 *
 * Drawn LARGER than the playable area — the extra ring is ground you can see and
 * cannot reach, which is what a horizon is. Fog alone cannot do this job: it
 * fades what is drawn, and past the plane's edge there is nothing to fade, so a
 * hard boundary with sky under it stays a hard boundary however thick the haze.
 * The two work together — geometry puts ground where you can see, fog stops you
 * noticing where it ends.
 *
 * 90 is measured, not chosen. The player spawns at z = 38 and the bottom of the
 * viewport is about 34 tiles of +Z beyond wherever they stand, so the visible
 * ground has to reach z ≈ 73; the playable area stops at 40. At 30 the corner
 * was plainly visible on a 1280x800 canvas.
 *
 * The padding must be EVEN. The grid repeats once per world unit over a plane
 * centred on the origin, so cell centres land on integers only when the span is
 * odd — and the playable span (EXTENT * 2 + 1) already is. An odd pad would
 * offset every grid line by half a tile, and the floor would quietly stop
 * agreeing with the tiles it exists to represent.
 */
const GROUND_PAD = 90;

/** Centre of the playable rectangle. The map is not centred on the origin. */
const CENTRE = {
  x: (BOUNDS.minX + BOUNDS.maxX) / 2,
  z: (BOUNDS.minZ + BOUNDS.maxZ) / 2,
};

const Ground = memo(function Ground() {
  // Odd span AND an integer centre, together, are what keep grid lines on tile
  // edges: the plane's near corner then lands on a half-integer, which is
  // exactly where a cell boundary is. Break either and the whole floor slides
  // half a tile out of agreement with the map it represents.
  const span = Math.max(BOUNDS.maxX - BOUNDS.minX, BOUNDS.maxZ - BOUNDS.minZ) + 1 + GROUND_PAD;
  const texture = useMemo(() => gridTexture('#5c6b46', 'rgba(206, 220, 186, 0.22)', span), [span]);
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[CENTRE.x, -0.02, CENTRE.z]}
      receiveShadow
    >
      <planeGeometry args={[span, span]} />
      {/* White: `map` multiplies `color`, so the tone is baked into the texture. */}
      <meshStandardMaterial map={texture} color="#ffffff" roughness={1} metalness={0} />
    </mesh>
  );
});

/**
 * The paths, as a handful of quads rather than per-tile geometry.
 *
 * grounds-map's `onPath` is the authority on which tiles are paved — it decides
 * where props may not spawn — and these rectangles are drawn to match it. They
 * are separate because a path is continuous to look at and per-tile to reason
 * about, and drawing four hundred one-unit quads to represent five rectangles
 * would be paying per tile for something with no per-tile variation.
 *
 * If `onPath` changes shape, these change with it. There is a test asserting
 * every path rectangle here is walkable, which is the cheap half of that
 * agreement; the expensive half is remembering to look.
 */
const Paths = memo(function Paths() {
  /**
   * Built ONCE, not per render.
   *
   * This used to call `texture.clone()` inside the render body, once per paved
   * rectangle. Every re-render of this scene therefore allocated a fresh set of
   * THREE textures and handed the old ones to the garbage collector — and the
   * scene re-renders on every tile the player walks onto, because the page
   * tracks their position to follow the camera. Walking across the map was
   * allocating and uploading textures continuously, which is what the frame-rate
   * drop while moving actually was. The clone is still needed (repeat is a
   * property of the texture, and each rectangle tiles differently), it just
   * belongs behind a memo.
   */
  const quads = useMemo(() => {
    const base = gridTexture('#8e8b82', 'rgba(60, 58, 52, 0.16)', 1);
    const paved = (x: number, z: number, w: number, d: number) => {
      const t = base.clone();
      t.needsUpdate = true;
      t.repeat.set(w, d);
      return { key: `${x}:${z}`, x, z, w, d, t };
    };
    const avenueMinZ = FENCE_Z + 1;
    const avenueMaxZ = BOUNDS.maxZ;
    return [
      // The avenue: entrance gate to the fence gate, dead straight.
      paved(0, (avenueMinZ + avenueMaxZ) / 2, 5, avenueMaxZ - avenueMinZ + 1),
      // The forecourt in front of the two buildings.
      paved(0, 36, FORECOURT_HALF * 2 + 1, 3),
      // Spurs to each doorway.
      ...DOORS.map((d) => paved(d.x, d.z, 3, 3)),
    ];
  }, []);

  return (
    <>
      {quads.map((q) => (
        <mesh
          key={q.key}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[q.x, 0.006, q.z]}
          receiveShadow
        >
          <planeGeometry args={[q.w, q.d]} />
          <meshStandardMaterial map={q.t} color="#ffffff" roughness={0.96} metalness={0} />
        </mesh>
      ))}
    </>
  );
});

/**
 * The perimeter fence, with the one gap in it.
 *
 * Floodlights every fourth section and only on the western half, which is not a
 * pattern — it is a fence that has been repaired unevenly by people with other
 * priorities. A perfectly regular run of working lamps would read as a finished
 * asset rather than as infrastructure somebody is barely keeping up with.
 */
const Fence = memo(function Fence() {
  const sections = [];
  // FenceSection spans 2 units, so step by 2 and skip the gate opening.
  for (let x = BOUNDS.minX; x <= BOUNDS.maxX; x += 2) {
    if (Math.abs(x) <= FENCE_GAP) continue;
    sections.push(
      <FenceSection
        key={x}
        position={[x, FENCE_Z]}
        floodlight={x % 8 === 0}
        // Half the lamps are out. The working ones are on the settlement's side
        // of the gate; the dark ones are further out.
        lightOn={x > -12}
      />
    );
  }
  return <>{sections}</>;
});

/**
 * The entrance arch, at the south end.
 *
 * There was nothing here: players materialised on open grass, which made the
 * Grounds read as a screen rather than as somewhere you had walked into. A
 * settlement with a guarded perimeter at one end and no threshold at the other
 * does not make sense on its own terms — and the arrival point is the first
 * thing every new player sees, so it was the worst place in the game to have
 * nothing standing.
 *
 * Deliberately friendlier than the fence at the far end: timber and a painted
 * sign rather than steel and floodlights. Both are boundaries; only one of them
 * is keeping something out, and a player should feel that difference long before
 * they could explain it.
 */
const EntranceGate = memo(function EntranceGate() {
  const half = 3.2;
  return (
    <group position={[ENTRANCE.x, 0, ENTRANCE.z]}>
      {[-half, half].map((x) => (
        <mesh key={x} position={[x, 1.8, 0]} castShadow>
          <boxGeometry args={[0.44, 3.6, 0.44]} />
          <meshStandardMaterial color={ISO.woodDark} flatShading roughness={0.95} />
        </mesh>
      ))}
      {/* Lintel, plus a lighter beam under it so the arch has some depth. */}
      <mesh position={[0, 3.75, 0]} castShadow>
        <boxGeometry args={[half * 2 + 1, 0.5, 0.5]} />
        <meshStandardMaterial color={ISO.woodDark} flatShading roughness={0.95} />
      </mesh>
      <mesh position={[0, 3.36, 0]} castShadow>
        <boxGeometry args={[half * 2, 0.24, 0.34]} />
        <meshStandardMaterial color={ISO.wood} flatShading roughness={0.95} />
      </mesh>
      {/* Sign board on the lintel, lit — branding, so Robin Neon is correct. */}
      <mesh position={[0, 3.75, 0.28]}>
        <boxGeometry args={[3.4, 0.34, 0.06]} />
        <meshStandardMaterial
          color={ISO.accent}
          emissive={ISO.accent}
          emissiveIntensity={1.2}
          toneMapped={false}
          flatShading
        />
      </mesh>
      <pointLight position={[0, 3.2, 1.4]} color={ISO.accent} intensity={5} distance={10} decay={2} />
      <PlaceLabel position={[0, 4.7, 0]}>Greenwood Grounds</PlaceLabel>
    </group>
  );
});

/**
 * Scenery, batched.
 *
 * Trees are three instanced layers plus a trunk; boulders and planters are one
 * each. Planters are drawn as real components rather than instanced because
 * there are only a handful and they carry several small meshes — the batching
 * threshold is somewhere in the low hundreds, and below it instancing costs more
 * complexity than it saves frames.
 */
const Scatter = memo(function Scatter({ felled }: { felled: Set<string> }) {
  const { trees, rocks, planters, shapes } = useMemo(() => {
    const props = allProps();
    /*
     * Felled trees are removed from the INSTANCE LIST, not hidden.
     *
     * There is no per-instance visibility flag on an InstancedMesh — every
     * instance in the buffer is drawn — so the only honest way to take a tree
     * out of the world is to rebuild the buffer without it. That is why this
     * depends on `felled`: cutting a tree changes the count, every matrix after
     * it shifts down one, and the layout effect writes the whole set again.
     *
     * At a few hundred trees that rebuild costs less than a frame and happens
     * only on a chop. The alternative — scaling a felled instance to zero —
     * leaves a degenerate matrix in the buffer and reads as a flicker.
     */
    const standing = props.filter((p) => p.kind === 'tree' && !felled.has(`${p.x}:${p.z}`));
    return {
      trees: standing,
      rocks: props.filter((p) => p.kind === 'boulder'),
      planters: props.filter((p) => p.kind === 'planter'),
      // Species decides the colour, so a birch is pale and an oak is dark
      // wherever it stands — the same lookup the server validates a chop
      // against, so what you see is what you can cut.
      shapes: standing.map((p: MapProp) => {
        const species = SPECIES[speciesAt('grounds', p.x, p.z)];
        return {
          height: 3.1 + vary(p.seed, 1) * 2.4,
          spread: 1.2 + vary(p.seed, 2) * 0.6,
          spin: vary(p.seed, 3) * Math.PI * 2,
          lean: (vary(p.seed, 4) - 0.5) * 0.11,
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

  // One useMemo returning a fixed-length array, NOT a useMemo per tier. Hooks
  // must run in the same order every render, so a hook called from inside a map
  // is a rule violation that happens to work only while the length never changes.
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
      {/* Three tiers — the chevrons from the mark, in three dimensions. Each is
          its own layer because they differ in scale per tree, and one instanced
          layer cannot hold three geometries. */}
      {tiers.map((place, n) => (
        <Layer key={n} count={trees.length} flat="#ffffff" colour={needleColour} place={place}>
          <coneGeometry args={[1, 1, 6]} />
        </Layer>
      ))}
      <Layer count={rocks.length} flat={ROCK} place={rockPlace}>
        <dodecahedronGeometry args={[1, 0]} />
      </Layer>
      {planters.map((p) => (
        <Planter key={`${p.x}:${p.z}`} position={[p.x, p.z]} seed={p.seed} />
      ))}
    </>
  );
});

/**
 * The scene contents. Mounted inside a Canvas by the page.
 *
 * Doorway signage is drawn here; the doorways THEMSELVES are decided in
 * lib/grounds-map, so what a player can walk through and what they can read are
 * one list. A label without a door would be a sign for a place you cannot reach.
 */
const GroundsScene = memo(function GroundsScene({ felled }: { felled: Set<string> }) {
  return (
    <>
      <GroundsLighting />
      <Ground />
      <Paths />
      <Scatter felled={felled} />
      <Fence />
      <EntranceGate />

      {BUILDINGS.map((b) => {
        const door = DOORS.find((d) => d.id === b.id);
        const cx = (b.minX + b.maxX) / 2;
        const cz = (b.minZ + b.maxZ) / 2;
        return (
          <group key={b.id}>
            <SettlementBuilding
              position={[cx, cz]}
              width={b.maxX - b.minX + 1}
              depth={b.maxZ - b.minZ + 1}
              seed={b.minX}
              doorOffset={door ? door.x - cx : 0}
            />
            <PlaceLabel position={[cx, 5.6, cz]}>{b.name}</PlaceLabel>
          </group>
        );
      })}

      {/* The way out, at the fence. Lit in Robin Neon like every other gate in
          the game — the colour means "this works", and at this point in the
          story the player has no reason yet to read it as anything else. */}
      <group position={[0, 0, FENCE_Z]}>
        {[-FENCE_GAP - 0.4, FENCE_GAP + 0.4].map((x) => (
          <mesh key={x} position={[x, 1.9, 0]} castShadow>
            <boxGeometry args={[0.26, 3.8, 0.26]} />
            <meshStandardMaterial color={ISO.steelDark} flatShading roughness={0.5} metalness={0.6} />
          </mesh>
        ))}
        <mesh position={[0, 3.9, 0]} castShadow>
          <boxGeometry args={[FENCE_GAP * 2 + 1.2, 0.28, 0.28]} />
          <meshStandardMaterial color={ISO.steelDark} flatShading roughness={0.5} metalness={0.6} />
        </mesh>
        <mesh position={[0, 3.9, 0.17]}>
          <boxGeometry args={[FENCE_GAP * 2 + 0.7, 0.1, 0.06]} />
          <meshStandardMaterial
            color={ISO.accent}
            emissive={ISO.accent}
            emissiveIntensity={1.6}
            toneMapped={false}
            flatShading
          />
        </mesh>
        <PlaceLabel position={[0, 4.8, 0]}>The Treeline</PlaceLabel>
      </group>
    </>
  );
});

export default GroundsScene;
