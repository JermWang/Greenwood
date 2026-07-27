'use client';

// The set dressing kit: architecture, props and floor markings the rooms are
// built out of.
//
// Everything here is procedural flat-shaded geometry in the same language as the
// desks, so a room can be composed the way a level designer would — walls, then
// zoning, then the things people put in a room — rather than by scattering more
// machines around. Each piece takes a `seed` where variation helps, so two
// planters are not the same planter.

import { useMemo } from 'react';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import { ISO } from './palette';
import {
  arrowTexture,
  brushedTexture,
  carpetTexture,
  hash2,
  lightPoolTexture,
  medallionTexture,
} from './mapkit';

/**
 * A seeded rotation snapped to a quarter turn.
 *
 * Props used to take a free rotation off the hash — anything from 0 to a half
 * turn for a planter, give or take 17 degrees for a crate stack. On a set built
 * entirely from box geometry standing on a square grid, an arbitrary angle does
 * not read as natural variation, it reads as furniture nobody straightened: the
 * silhouettes stop agreeing with the tiles and with each other, and the whole
 * room looks slightly knocked.
 *
 * Four orientations keep a seeded prop from being identical to its neighbour
 * while leaving every edge parallel to the grid. Variety that survives the snap
 * — height, foliage, colour — is doing the work that a crooked angle was
 * pretending to do.
 *
 * CrateStack is the deliberate exception and does NOT use this: cargo is meant
 * to look set down rather than laid out. See its own note for why.
 */
const quarterTurn = (seed: number, salt: number) =>
  Math.floor(hash2(seed, salt) * 4) * (Math.PI / 2);

const flat = (color: string, rough = 0.8, metal = 0.05) => (
  <meshStandardMaterial color={color} flatShading roughness={rough} metalness={metal} />
);

const lit = (color: string, intensity = 1) => (
  <meshStandardMaterial
    color={color}
    emissive={color}
    emissiveIntensity={intensity}
    flatShading
    roughness={0.4}
    toneMapped={false}
  />
);

// ---------------------------------------------------------------------------
// Floor markings
// ---------------------------------------------------------------------------

/**
 * A textured plane laid flat on the floor.
 *
 * `polygonOffset` rather than a Y nudge: at this camera angle a decal lifted far
 * enough to beat z-fighting is visibly floating, and one lifted little enough to
 * look flat still flickers. Offsetting in depth-buffer space fixes both.
 */
export function FloorDecal({
  texture,
  position,
  size,
  rotation = 0,
  opacity = 1,
  color = '#ffffff',
}: {
  texture: THREE.Texture;
  position: [number, number];
  size: [number, number];
  rotation?: number;
  opacity?: number;
  color?: string;
}) {
  return (
    <mesh position={[position[0], 0.081, position[1]]} rotation={[-Math.PI / 2, 0, rotation]}>
      <planeGeometry args={size} />
      <meshBasicMaterial
        map={texture}
        color={color}
        transparent
        opacity={opacity}
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={-4}
        polygonOffsetUnits={-4}
        toneMapped={false}
      />
    </mesh>
  );
}

/**
 * The centre inlay. Purely decorative, and the room is dead without it.
 *
 * Opacity was 0.5 and it simply did not read on screen — the atrium looked
 * empty. Pale stone under a warm pendant leaves very little contrast for a
 * white decal to work with, so it needs most of its alpha.
 */
export function Medallion({ position = [0, 0], size = 7 }: { position?: [number, number]; size?: number }) {
  return <FloorDecal texture={medallionTexture()} position={position} size={[size, size]} opacity={0.92} />;
}

/** Warm spill under a lamp, so light has somewhere to land on a flat floor. */
export function LightPool({ position, radius = 3 }: { position: [number, number]; radius?: number }) {
  return (
    <mesh position={[position[0], 0.084, position[1]]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[radius * 2, radius * 2]} />
      <meshBasicMaterial
        map={lightPoolTexture()}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </mesh>
  );
}

/** A rug: carpet plane with a woven border, to soften a seating area. */
export function Rug({
  position,
  size,
  color = '#6d5f4c',
  border = ISO.deep,
}: {
  position: [number, number];
  size: [number, number];
  color?: string;
  border?: string;
}) {
  return (
    <group position={[position[0], 0, position[1]]}>
      <mesh position={[0, 0.088, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={size} />
        <meshStandardMaterial
          map={carpetTexture()}
          color={border}
          roughness={0.95}
          polygonOffset
          polygonOffsetFactor={-3}
          polygonOffsetUnits={-3}
        />
      </mesh>
      <mesh position={[0, 0.09, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[size[0] - 0.5, size[1] - 0.5]} />
        <meshStandardMaterial
          map={carpetTexture()}
          color={color}
          roughness={0.95}
          polygonOffset
          polygonOffsetFactor={-4}
          polygonOffsetUnits={-4}
        />
      </mesh>
    </group>
  );
}

/**
 * An exit at the room's edge: chevrons painted on the floor, a lit threshold
 * strip, and a sign naming where it goes.
 *
 * The arrows are the affordance the player reads first, which is why they are
 * on the ground in the room rather than on a menu.
 */
export function Portal({
  position,
  facing,
  label,
  active,
  onEnter,
}: {
  position: [number, number];
  /** Direction of travel, in radians about Y. 0 points toward +Z. */
  facing: number;
  label: string;
  active: boolean;
  onEnter: () => void;
}) {
  // The doorway furniture stands slightly OUTSIDE the threshold tile, offset
  // along the door's outward normal. Rotating the whole group by `facing` and
  // offsetting once is what keeps this correct for all four sides: the previous
  // version offset by Math.cos(facing) on Z alone, which is right for a north or
  // south door and collapses to no offset at all for an east or west one,
  // stacking the posts, lintel and sign on top of the player's own tile.
  // Both rooms used to nudge the whole portal 0.6 along world +Z before handing
  // it here, on top of this standoff. That put the ground arrow 0.6 off the tile
  // it marks, and — once a door existed on a north wall — pushed that door's
  // frame INTO the room rather than out of it, because a world-space nudge does
  // not know which way the door points. The group now sits exactly on its door
  // tile and the standoff is applied here, along the door's own normal, so it
  // works the same on all four walls. 2.5 = the old 0.6 + 1.9, so nothing moved.
  const OUT = 2.5;
  return (
    <group position={[position[0], 0, position[1]]}>
      <FloorDecal
        texture={arrowTexture()}
        position={[0, 0]}
        size={[2.6, 3.4]}
        rotation={-facing}
        color={active ? ISO.accent : '#c8c6c0'}
        opacity={active ? 0.95 : 0.42}
      />
      {/* Rotated once, so everything below is authored in the door's own frame:
          +X runs along the opening and +Z points out of the room. */}
      <group rotation={[0, facing, 0]}>
        {/* Threshold: a lit strip across the doorway, brighter when you are on it. */}
        <mesh position={[0, 0.06, OUT]}>
          <boxGeometry args={[3, 0.07, 0.16]} />
          {lit(ISO.accent, active ? 2.4 : 0.7)}
        </mesh>
        <group
          onClick={(e) => { e.stopPropagation(); onEnter(); }}
          onPointerOver={(e) => e.stopPropagation()}
        >
          {/* Frame posts, so the exit reads as a doorway from across the room. */}
          {[-1.6, 1.6].map((x) => (
            <mesh key={x} position={[x, 1.1, OUT]} castShadow>
              <boxGeometry args={[0.18, 2.2, 0.18]} />
              {flat(ISO.steelDark, 0.5, 0.5)}
            </mesh>
          ))}
          <mesh position={[0, 2.25, OUT]} castShadow>
            <boxGeometry args={[3.5, 0.22, 0.24]} />
            {flat(ISO.paint)}
          </mesh>
          <Html center position={[0, 2.75, OUT]} zIndexRange={[10, 0]}>
            <div className={`iso-portal-sign ${active ? 'is-active' : ''}`}>{label}</div>
          </Html>
        </group>
      </group>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Architecture
// ---------------------------------------------------------------------------

/**
 * A wall run with skirting, a wainscot rail and optional glazing.
 *
 * Built as one component because a bare box reads as a barrier, not a wall —
 * the horizontal bands are what give it scale and tell you how tall the room is.
 */
export function Wall({
  position,
  length,
  rotation = 0,
  height = 4.2,
  windows = 0,
}: {
  position: [number, number];
  length: number;
  rotation?: number;
  height?: number;
  /** Glazed bays punched along the run. 0 leaves it solid. */
  windows?: number;
}) {
  const bays = useMemo(() => {
    if (windows <= 0) return [];
    const step = length / windows;
    return Array.from({ length: windows }, (_, i) => -length / 2 + step * (i + 0.5));
  }, [length, windows]);

  return (
    <group position={[position[0], 0, position[1]]} rotation={[0, rotation, 0]}>
      <mesh position={[0, height / 2, 0]} receiveShadow castShadow>
        <boxGeometry args={[length, height, 0.34]} />
        <meshStandardMaterial map={brushedTexture()} color={ISO.concreteAlt} flatShading roughness={0.92} />
      </mesh>
      {/* Skirting and the rail: two thin bands do more for readability than any
          amount of texture on the wall face. */}
      <mesh position={[0, 0.19, 0.03]} castShadow>
        <boxGeometry args={[length, 0.38, 0.42]} />
        {flat(ISO.concreteDark, 0.9)}
      </mesh>
      <mesh position={[0, height * 0.44, 0.03]}>
        <boxGeometry args={[length, 0.12, 0.42]} />
        {flat(ISO.steelDark, 0.6, 0.4)}
      </mesh>
      <mesh position={[0, height - 0.12, 0.03]}>
        <boxGeometry args={[length, 0.24, 0.46]} />
        {flat(ISO.paint)}
      </mesh>

      {bays.map((x) => (
        <group key={x} position={[x, height * 0.66, 0.06]}>
          <mesh>
            <boxGeometry args={[1.9, 1.7, 0.34]} />
            <meshStandardMaterial
              color={ISO.glass}
              emissive="#dceaf2"
              emissiveIntensity={0.55}
              roughness={0.15}
              metalness={0.1}
              transparent
              opacity={0.72}
            />
          </mesh>
          <mesh position={[0, 0, 0.13]}>
            <boxGeometry args={[2.06, 1.86, 0.1]} />
            {flat(ISO.steelDark, 0.5, 0.5)}
          </mesh>
          <mesh position={[0, 0, 0.16]}>
            <boxGeometry args={[0.07, 1.7, 0.08]} />
            {flat(ISO.steelDark, 0.5, 0.5)}
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Structural column: base, shaft, capital. Breaks up long floors. */
export function Column({ position, height = 4.2 }: { position: [number, number]; height?: number }) {
  return (
    <group position={[position[0], 0, position[1]]}>
      <mesh position={[0, 0.16, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.92, 0.32, 0.92]} />
        {flat(ISO.concreteDark, 0.9)}
      </mesh>
      <mesh position={[0, height / 2, 0]} castShadow>
        <boxGeometry args={[0.6, height, 0.6]} />
        {flat(ISO.concrete, 0.88)}
      </mesh>
      {/* Corner reveals: four thin strips turn a plain post into a fluted one. */}
      {[[-0.31, -0.31], [0.31, -0.31], [-0.31, 0.31], [0.31, 0.31]].map(([x, z], i) => (
        <mesh key={i} position={[x, height / 2, z]}>
          <boxGeometry args={[0.09, height - 0.5, 0.09]} />
          {flat(ISO.concreteAlt, 0.85)}
        </mesh>
      ))}
      <mesh position={[0, height - 0.18, 0]} castShadow>
        <boxGeometry args={[0.86, 0.36, 0.86]} />
        {flat(ISO.paint)}
      </mesh>
    </group>
  );
}

/** Overhead beam. Reads as a ceiling without needing one drawn. */
export function Beam({
  position,
  length,
  rotation = 0,
  height = 4.4,
}: {
  position: [number, number];
  length: number;
  rotation?: number;
  height?: number;
}) {
  return (
    <group position={[position[0], height, position[1]]} rotation={[0, rotation, 0]}>
      <mesh castShadow>
        <boxGeometry args={[length, 0.34, 0.42]} />
        {flat(ISO.steelDark, 0.55, 0.45)}
      </mesh>
      <mesh position={[0, -0.22, 0]}>
        <boxGeometry args={[length, 0.1, 0.62]} />
        {flat(ISO.steel, 0.5, 0.5)}
      </mesh>
    </group>
  );
}

/** Overhead pipe run for the Machine Room, with collars at intervals. */
export function PipeRun({
  position,
  length,
  rotation = 0,
  height = 4.1,
  color = ISO.steelDark,
}: {
  position: [number, number];
  length: number;
  rotation?: number;
  height?: number;
  color?: string;
}) {
  const collars = Math.max(2, Math.round(length / 5));
  return (
    <group position={[position[0], height, position[1]]} rotation={[0, rotation, 0]}>
      <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.17, 0.17, length, 8]} />
        {flat(color, 0.45, 0.6)}
      </mesh>
      {Array.from({ length: collars }, (_, i) => {
        const x = -length / 2 + (length / (collars - 1)) * i;
        return (
          <group key={i} position={[x, 0, 0]}>
            <mesh rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.23, 0.23, 0.18, 8]} />
              {flat(ISO.steel, 0.4, 0.6)}
            </mesh>
            <mesh position={[0, 0.35, 0]}>
              <boxGeometry args={[0.07, 0.7, 0.07]} />
              {flat(ISO.steelDark, 0.5, 0.5)}
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

/**
 * A planted evergreen in a box.
 *
 * On theme twice over: it is the mark on the logo, and it is the one prop that
 * makes an interior read as a place people spend time rather than a warehouse.
 */
export function Planter({ position, seed = 0 }: { position: [number, number]; seed?: number }) {
  const h = 1.5 + hash2(seed, 1) * 0.7;
  // Height still varies freely — that reads as growth. The box it stands in is
  // square and sits on a square tile, so its angle does not.
  const spin = quarterTurn(seed, 2);
  return (
    <group position={[position[0], 0.08, position[1]]} rotation={[0, spin, 0]}>
      <mesh position={[0, 0.3, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.0, 0.6, 1.0]} />
        {flat(ISO.woodDark, 0.9)}
      </mesh>
      <mesh position={[0, 0.62, 0]}>
        <boxGeometry args={[1.1, 0.1, 1.1]} />
        {flat(ISO.wood, 0.85)}
      </mesh>
      <mesh position={[0, 0.66, 0]}>
        <boxGeometry args={[0.86, 0.06, 0.86]} />
        {flat('#3f342a', 1)}
      </mesh>
      <mesh position={[0, 0.7 + h * 0.5, 0]} castShadow>
        <cylinderGeometry args={[0.07, 0.1, h, 6]} />
        {flat('#5a4632', 0.9)}
      </mesh>
      {/* Three tapering tiers — the chevrons from the mark, in three dimensions. */}
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[0, 0.75 + h * (0.42 + i * 0.26), 0]} castShadow>
          <coneGeometry args={[0.62 - i * 0.16, 0.72 - i * 0.1, 6]} />
          {flat(i === 2 ? '#3f5c3a' : '#35502f', 0.95)}
        </mesh>
      ))}
    </group>
  );
}

/** Slatted bench, for the lounge zone. */
export function Bench({ position, rotation = 0 }: { position: [number, number]; rotation?: number }) {
  return (
    <group position={[position[0], 0.08, position[1]]} rotation={[0, rotation, 0]}>
      {[-0.7, 0.7].map((x) => (
        <mesh key={x} position={[x, 0.22, 0]} castShadow>
          <boxGeometry args={[0.14, 0.44, 0.62]} />
          {flat(ISO.steelDark, 0.5, 0.5)}
        </mesh>
      ))}
      {[-0.22, 0, 0.22].map((z) => (
        <mesh key={z} position={[0, 0.48, z]} castShadow receiveShadow>
          <boxGeometry args={[1.9, 0.08, 0.17]} />
          {flat(ISO.wood, 0.85)}
        </mesh>
      ))}
      {[0.62, 0.8].map((y, i) => (
        <mesh key={y} position={[0, y, -0.26 - i * 0.02]} castShadow>
          <boxGeometry args={[1.9, 0.08, 0.15]} />
          {flat(ISO.wood, 0.85)}
        </mesh>
      ))}
    </group>
  );
}

/** Post-and-rope stanchion, for queue lines and cordoned corners. */
export function Stanchion({ position, rope = 0 }: { position: [number, number]; rope?: number }) {
  return (
    <group position={[position[0], 0.08, position[1]]}>
      <mesh position={[0, 0.05, 0]} castShadow>
        <cylinderGeometry args={[0.24, 0.28, 0.1, 10]} />
        {flat(ISO.steelDark, 0.4, 0.7)}
      </mesh>
      <mesh position={[0, 0.5, 0]} castShadow>
        <cylinderGeometry args={[0.055, 0.055, 0.9, 8]} />
        {flat(ISO.steel, 0.35, 0.75)}
      </mesh>
      <mesh position={[0, 0.99, 0]}>
        <sphereGeometry args={[0.09, 10, 8]} />
        {flat(ISO.paint, 0.3, 0.6)}
      </mesh>
      {rope > 0 && (
        <mesh position={[rope / 2, 0.78, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.035, 0.035, rope, 6]} />
          {flat('#6d2f33', 0.95, 0)}
        </mesh>
      )}
    </group>
  );
}

/**
 * Pendant lamp: shade, emissive underside, and the pool it throws.
 *
 * `cast` exists because point lights are not free — every one of them is
 * another iteration in the fragment shader for every lit surface in the room. A
 * floor with ten pendants wants ten lamps and about four lights; the rest carry
 * their glow with an emissive face and a painted pool, which at this camera
 * angle is indistinguishable from the real thing.
 */
export function Pendant({
  position,
  height = 3.4,
  color = '#ffeccd',
  cast = true,
}: {
  position: [number, number];
  height?: number;
  color?: string;
  cast?: boolean;
}) {
  return (
    <>
      <group position={[position[0], height, position[1]]}>
        <mesh position={[0, 0.6, 0]}>
          <cylinderGeometry args={[0.03, 0.03, 1.2, 6]} />
          {flat(ISO.steelDark, 0.5, 0.5)}
        </mesh>
        <mesh castShadow>
          <coneGeometry args={[0.52, 0.44, 8, 1, true]} />
          {flat(ISO.paint, 0.5)}
        </mesh>
        <mesh position={[0, -0.2, 0]}>
          <circleGeometry args={[0.44, 8]} />
          <meshBasicMaterial color={color} toneMapped={false} side={THREE.DoubleSide} />
        </mesh>
      </group>
      {cast && (
        <pointLight
          position={[position[0], height - 0.4, position[1]]}
          color={color}
          intensity={9}
          distance={9}
          decay={2}
        />
      )}
      <LightPool position={position} radius={2.6} />
    </>
  );
}

/** Wall-mounted market board: a grid of lit bars that reads as live data. */
export function TickerBoard({
  position,
  rotation = 0,
  width = 5,
}: {
  position: [number, number];
  rotation?: number;
  width?: number;
}) {
  const bars = useMemo(
    () =>
      Array.from({ length: 18 }, (_, i) => ({
        h: 0.14 + hash2(i, 77) * 0.8,
        up: hash2(i, 78) > 0.42,
      })),
    []
  );
  return (
    <group position={[position[0], 2.5, position[1]]} rotation={[0, rotation, 0]}>
      <mesh castShadow>
        <boxGeometry args={[width, 1.5, 0.16]} />
        {flat('#14140f', 0.7)}
      </mesh>
      <mesh position={[0, 0, 0.09]}>
        <boxGeometry args={[width + 0.16, 1.66, 0.08]} />
        {flat(ISO.steelDark, 0.5, 0.5)}
      </mesh>
      {bars.map((bar, i) => {
        const x = -width / 2 + 0.28 + (i * (width - 0.56)) / 17;
        return (
          <mesh key={i} position={[x, -0.5 + bar.h / 2, 0.1]}>
            <boxGeometry args={[0.16, bar.h, 0.03]} />
            {lit(bar.up ? ISO.accent : ISO.danger, bar.up ? 1.5 : 1.1)}
          </mesh>
        );
      })}
      <mesh position={[0, -0.52, 0.1]}>
        <boxGeometry args={[width - 0.4, 0.02, 0.03]} />
        {lit(ISO.steel, 0.5)}
      </mesh>
    </group>
  );
}

/**
 * Stacked shipping crates, for the Machine Room's edges.
 *
 * The one prop that is DELIBERATELY off the grid, and the exception that proves
 * the rule the rest of the set follows.
 *
 * Everything else here was snapped to quarter turns because an arbitrary angle
 * on a planter or a bench reads as furniture nobody straightened. Cargo is the
 * opposite: crates are things somebody put down in a hurry, and a stack squared
 * perfectly to the floor plan reads as scenery placed by a level editor. The
 * slight lean is the whole point — it is what makes the corner of the room feel
 * worked in rather than laid out.
 *
 * Kept modest on purpose. Past about 20 degrees it stops reading as "set down"
 * and starts reading as "falling over", which is a different and worse idea.
 */
const CRATE_MAX_LEAN = 0.34; // radians, ~19 degrees either way
const CRATE_MAX_SHIFT = 0.09; // tiles of sideways nudge per crate in a stack

export function CrateStack({ position, seed = 0 }: { position: [number, number]; seed?: number }) {
  const count = 1 + Math.floor(hash2(seed, 9) * 3);
  const lean = (hash2(seed, 10) - 0.5) * 2 * CRATE_MAX_LEAN;
  return (
    <group position={[position[0], 0.08, position[1]]} rotation={[0, lean, 0]}>
      {Array.from({ length: count }, (_, i) => {
        const s = 0.9 - i * 0.09;
        // Each crate sits a little off the one below, and turned a little
        // further, so a tall stack fans rather than extruding. Seeded, so a
        // given crate stack looks the same on every load and every client.
        const shift = (hash2(seed, i + 20) - 0.5) * 2 * CRATE_MAX_SHIFT;
        const turn = (hash2(seed, i + 40) - 0.5) * CRATE_MAX_LEAN;
        return (
          <group key={i} position={[shift, 0.3 + i * 0.62, shift * 0.6]} rotation={[0, turn, 0]}>
            <mesh castShadow receiveShadow>
              <boxGeometry args={[s, 0.6, s]} />
              {flat(i % 2 === 0 ? ISO.wood : ISO.woodDark, 0.92)}
            </mesh>
            <mesh position={[0, 0, s / 2 + 0.01]}>
              <boxGeometry args={[s * 0.55, 0.14, 0.02]} />
              {flat(ISO.paint, 0.9)}
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

/** Wall-mounted service cabinet with status lamps. */
export function ServicePanel({
  position,
  rotation = 0,
  seed = 0,
}: {
  position: [number, number];
  rotation?: number;
  seed?: number;
}) {
  return (
    <group position={[position[0], 1.5, position[1]]} rotation={[0, rotation, 0]}>
      <mesh castShadow>
        <boxGeometry args={[1.1, 1.5, 0.22]} />
        {flat(ISO.steelDark, 0.55, 0.45)}
      </mesh>
      <mesh position={[0, 0, 0.12]}>
        <boxGeometry args={[0.9, 1.3, 0.03]} />
        {flat(ISO.concreteDark, 0.7)}
      </mesh>
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[-0.28 + i * 0.28, 0.45, 0.15]}>
          <boxGeometry args={[0.11, 0.11, 0.03]} />
          {lit(hash2(seed, i) > 0.45 ? ISO.accent : ISO.amber, 1.6)}
        </mesh>
      ))}
      {[0, 1, 2, 3].map((i) => (
        <mesh key={`v-${i}`} position={[0, 0.1 - i * 0.16, 0.15]}>
          <boxGeometry args={[0.72, 0.05, 0.02]} />
          {flat(ISO.steel, 0.5, 0.5)}
        </mesh>
      ))}
    </group>
  );
}

/** A hanging sign that names a zone. Rooms should tell you where you are. */
export function ZoneSign({
  position,
  label,
  height = 3.1,
  accent = ISO.accent,
}: {
  position: [number, number];
  label: string;
  height?: number;
  accent?: string;
}) {
  return (
    <group position={[position[0], height, position[1]]}>
      {[-0.9, 0.9].map((x) => (
        <mesh key={x} position={[x, 0.62, 0]}>
          <cylinderGeometry args={[0.022, 0.022, 1.24, 6]} />
          {flat(ISO.steelDark, 0.5, 0.5)}
        </mesh>
      ))}
      <mesh castShadow>
        <boxGeometry args={[2.3, 0.5, 0.09]} />
        {flat('#1b1a14', 0.7)}
      </mesh>
      <mesh position={[0, -0.27, 0]}>
        <boxGeometry args={[2.3, 0.05, 0.11]} />
        {lit(accent, 1.4)}
      </mesh>
      <Html center position={[0, 0, 0.09]} zIndexRange={[9, 0]}>
        <div className="iso-zone-sign">{label}</div>
      </Html>
    </group>
  );
}
