'use client';

// Everything the game draws ON a tile, in one place.
//
// Markers were being written per-scene, and they had drifted: the hover tile was
// a 0.96 quad, loot piles and creatures used a square ring of one size, the
// player's own ring used the same numbers inside a group scaled by 1.55 — so the
// one marker a player looks at most was half again too big for the tile it was
// supposed to be sitting on. On a grid where a tile is a unit of meaning (this
// is how far a step goes, this is what "adjacent" means, this is the cell a door
// occupies) a marker that is not tile-sized is actively lying.
//
// THE GEOMETRY, and why the numbers look odd:
//
// `ringGeometry` approximates a circle with `thetaSegments` sides, so four
// segments make a quad whose CORNERS sit at the radius — which means a square of
// side `r * sqrt(2)`, not `r`. To cover exactly one tile the outer radius has to
// be 1/sqrt(2) = 0.7071. The PI/4 start rotates the quad off the diamond so its
// sides run along the grid axes instead of across them.
//
// Use TileFill for "this tile means something" and TileRing for "the thing
// standing here means something". A fill reads as ground you can act on; a ring
// reads as an object's footprint. Mixing them is what made doors look like loot.

import * as THREE from 'three';

/** Half-diagonal of a unit tile. See the header for why this is not 0.5. */
export const TILE_R = Math.SQRT1_2;

/** Ring thickness, as a fraction of a tile. Thin enough to read as an outline. */
const RING = 0.16;

export interface MarkerProps {
  /** Tile coordinates. Integers — a marker between cells is a marker that lies. */
  x: number;
  z: number;
  color: string;
  opacity?: number;
  /**
   * Height above the ground plane.
   *
   * Ordering matters and is fiddly: the ground sits at -0.02, the click plane at
   * 0.004. Anything drawn below the click plane is invisible; anything drawn
   * above it without `raycast={() => null}` STEALS the click, so the tile you are
   * pointing at becomes the thing stopping you from clicking it.
   */
  y?: number;
}

/**
 * A filled tile.
 *
 * Never a raycast target. It always sits above the click plane, so without the
 * null raycast it swallows the very click it is advertising.
 */
export function TileFill({ x, z, color, opacity = 0.3, y = 0.012 }: MarkerProps) {
  return (
    <mesh
      position={[x, y, z]}
      rotation={[-Math.PI / 2, 0, 0]}
      renderOrder={2}
      raycast={() => null}
    >
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={opacity}
        toneMapped={false}
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

/** A square outline exactly one tile across. */
export function TileRing({ x, z, color, opacity = 0.7, y = 0.014 }: MarkerProps) {
  return (
    <mesh
      position={[x, y, z]}
      rotation={[-Math.PI / 2, 0, 0]}
      renderOrder={2}
      raycast={() => null}
    >
      <ringGeometry args={[TILE_R * (1 - RING), TILE_R, 4, 1, Math.PI / 4]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={opacity}
        toneMapped={false}
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

/**
 * A door: a filled tile with an outline around it.
 *
 * Doors used to be drawn as a bare ring, which put them in the same visual
 * language as loot piles and creature footprints — three different things all
 * saying "an outlined square". A door is somewhere you GO, so it gets the fill
 * that means ground-you-can-act-on, and keeps a brighter edge so it still reads
 * as a threshold rather than as a puddle.
 */
export function DoorTile({ x, z, color, opacity = 0.34, y = 0.01 }: MarkerProps) {
  return (
    <group>
      <TileFill x={x} z={z} color={color} opacity={opacity} y={y} />
      <TileRing x={x} z={z} color={color} opacity={Math.min(1, opacity * 2.2)} y={y + 0.002} />
    </group>
  );
}
