'use client';

// The Machine Room's set: the shell the desks are installed into.
//
// Deliberately a different room from the Trading Floor rather than the same one
// with other props in it. The floor is sealed concrete with painted bay lanes
// instead of polished stone, the light is hard strip lighting instead of warm
// pendants, and the ceiling carries pipework and a gantry. Nothing here is
// interactive — it exists so that placing a desk feels like installing plant in
// a building, not dropping a token on a board.
//
// Everything scales off `bounds`, because the buildable area grows when an older
// layout reaches past the default, and a shell that stayed put would leave those
// desks standing outside the building.

import { useMemo } from 'react';
import { type BoardBounds } from './IsoBoard';
import { ISO } from './palette';
import { grateTexture, hazardTexture } from './mapkit';
import { Beam, Column, CrateStack, FloorDecal, PipeRun, ServicePanel, Wall, ZoneSign } from './MapDressing';
import { machineRoomDoors } from './portals';

/** Overhead strip light: a hard linear source, the opposite of a warm pendant. */
function StripLight({ position, length }: { position: [number, number]; length: number }) {
  return (
    <>
      <group position={[position[0], 3.9, position[1]]}>
        <mesh castShadow>
          <boxGeometry args={[length, 0.16, 0.34]} />
          <meshStandardMaterial color={ISO.steelDark} flatShading roughness={0.5} metalness={0.5} />
        </mesh>
        <mesh position={[0, -0.1, 0]}>
          <boxGeometry args={[length - 0.3, 0.06, 0.24]} />
          <meshBasicMaterial color="#e8f2ff" toneMapped={false} />
        </mesh>
        {[-length / 2 + 0.4, length / 2 - 0.4].map((x) => (
          <mesh key={x} position={[x, 0.3, 0]}>
            <cylinderGeometry args={[0.02, 0.02, 0.6, 5]} />
            <meshStandardMaterial color={ISO.steelDark} flatShading metalness={0.5} />
          </mesh>
        ))}
      </group>
      <pointLight
        position={[position[0], 3.4, position[1]]}
        color="#dceaff"
        intensity={7}
        distance={11}
        decay={2}
      />
    </>
  );
}

export default function MachineRoomSet({ bounds }: { bounds: BoardBounds }) {
  const geometry = useMemo(() => {
    const width = bounds.maxX - bounds.minX + 1;
    const depth = bounds.maxZ - bounds.minZ + 1;
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cz = (bounds.minZ + bounds.maxZ) / 2;
    // Walls sit just outside the last row of tiles, on the two far sides only —
    // the near two would stand between the camera and the room.
    const wallZ = bounds.minZ - 1.4;
    const wallX = bounds.minX - 1.4;
    return { width, depth, cx, cz, wallZ, wallX };
  }, [bounds]);

  const { width, depth, cx, cz, wallZ, wallX } = geometry;

  /**
   * The north wall, cut around the doorway.
   *
   * The way back to the Trading Floor is on this wall — the far one — because
   * the Trading Floor lies north of here and travel between the two has to keep
   * its direction. That means the wall can no longer be one unbroken run: it is
   * built as two segments with a gap where the door is, or the exit would be
   * standing behind a solid wall with a lit sign hanging over it.
   *
   * Read from the same door table the board and the portal use, so a door that
   * moves takes its doorway with it.
   */
  const northWall = useMemo(() => {
    const door = machineRoomDoors(bounds).find((d) => d.side === 'north');
    const start = cx - (width + 3) / 2;
    const end = cx + (width + 3) / 2;
    if (!door) return [{ centre: cx, length: width + 3 }];
    // Clear the full opening plus the frame posts standing either side of it.
    const gap = (door.half * 2 + 1) + 0.8;
    const segments = [
      { centre: (start + (door.x - gap / 2)) / 2, length: door.x - gap / 2 - start },
      { centre: ((door.x + gap / 2) + end) / 2, length: end - (door.x + gap / 2) },
    ];
    // A door near a corner can leave a sliver, or nothing at all, on one side.
    return segments.filter((segment) => segment.length > 0.5);
  }, [bounds, cx, width]);

  /** Where the doorway is, for the props that must not stand in front of it. */
  const doorX = useMemo(
    () => machineRoomDoors(bounds).find((d) => d.side === 'north')?.x ?? null,
    [bounds]
  );

  /**
   * Strip lights run across the bays, spaced so no bay sits in the dark.
   *
   * Rounded to whole tiles. The spacing is a division of the room's depth, which
   * lands on quarter- and half-tiles far more often than not, and a ceiling of
   * fittings each hanging over a different fraction of a tile is visible from
   * the floor as light pooling slightly out of step with the bays it lights.
   */
  const strips = useMemo(() => {
    const rows = Math.max(2, Math.round(depth / 6));
    return Array.from({ length: rows }, (_, i) =>
      Math.round(bounds.minZ + ((i + 0.5) * depth) / rows)
    );
  }, [bounds.minZ, depth]);

  return (
    <group>
      {northWall.map((segment) => (
        <Wall
          key={segment.centre}
          position={[segment.centre, wallZ]}
          length={segment.length}
          height={4.6}
          windows={Math.max(1, Math.round(segment.length / 7))}
        />
      ))}
      <Wall
        position={[wallX, cz]}
        length={depth + 3}
        rotation={Math.PI / 2}
        height={4.6}
        windows={Math.max(2, Math.round(depth / 7))}
      />

      {/* Gantry: columns at the far corner and midpoints, tied by beams. */}
      <Column position={[wallX + 0.9, wallZ + 0.9]} height={4.6} />
      {/* Shifted clear of the doorway rather than sitting at the midpoint: the
          gantry's centre column used to land on exactly the tile the door is
          now cut into, so the way out had a steel post planted in it. */}
      <Column position={[doorX === null ? cx : doorX - 3.5, wallZ + 0.9]} height={4.6} />
      <Column position={[wallX + 0.9, cz]} height={4.6} />
      <Beam position={[cx, wallZ + 0.9]} length={width + 2} height={4.7} />
      <Beam position={[wallX + 0.9, cz]} length={depth + 2} rotation={Math.PI / 2} height={4.7} />

      {/* Services overhead. Two runs at different heights so the ceiling has
          depth rather than one flat layer of props. */}
      <PipeRun position={[cx, bounds.minZ + 2]} length={width + 2} height={4.15} />
      <PipeRun position={[cx, bounds.maxZ - 2]} length={width + 2} height={3.95} color={ISO.amber} />
      <PipeRun position={[bounds.minX + 2, cz]} length={depth + 2} rotation={Math.PI / 2} height={4.35} />

      {strips.map((z) => (
        <StripLight key={z} position={[cx, z]} length={width - 1} />
      ))}

      {/* Wall-mounted, so the small offset off the wall face stays — that is the
          panel's depth, not a position. What moved is the run ALONG the wall:
          these sat at minX+3.4 and minZ+3.6, landing between tiles for no
          reason, and now step in whole tiles like everything else. */}
      <ServicePanel position={[bounds.minX + 2, wallZ + 0.28]} seed={1} />
      <ServicePanel position={[bounds.minX + 4, wallZ + 0.28]} seed={2} />
      <ServicePanel position={[wallX + 0.28, bounds.minZ + 4]} rotation={Math.PI / 2} seed={3} />

      {/* Cargo sits on tiles, squared to the room. These were scattered across
          arbitrary fractions — -12.4, -11.5, 10.4, -20.2 — which put every stack
          on a different fraction of a tile and made the corner read as junk
          dropped at angles rather than stock stacked against a wall. */}
      <CrateStack position={[bounds.minX, bounds.maxZ - 1]} seed={4} />
      <CrateStack position={[bounds.minX + 1, bounds.maxZ - 2]} seed={5} />
      <CrateStack position={[bounds.maxX - 1, bounds.minZ]} seed={6} />

      {/* Also off-centre now, for the same reason as the column above — a lit
          sign reading INSTALLATION BAYS hanging in the middle of the exit reads
          as a label FOR the exit, which is the one thing it must not say. */}
      <ZoneSign
        position={[doorX === null ? cx : doorX - 6.5, wallZ + 1.6]}
        label="INSTALLATION BAYS"
        height={3.4}
      />

      {/* Painted markings. The hazard band frames the buildable area, so where
          you may set a desk down is legible before you pick one up. */}
      {[
        { p: [cx, bounds.minZ - 0.62] as [number, number], s: [width, 0.44] as [number, number] },
        { p: [cx, bounds.maxZ + 0.62] as [number, number], s: [width, 0.44] as [number, number] },
        { p: [bounds.minX - 0.62, cz] as [number, number], s: [0.44, depth] as [number, number] },
        { p: [bounds.maxX + 0.62, cz] as [number, number], s: [0.44, depth] as [number, number] },
      ].map((band, i) => (
        <FloorDecal key={i} texture={hazardTexture()} position={band.p} size={band.s} opacity={0.55} color={ISO.amber} />
      ))}

      {/* Service trench down the middle: grating over the cable run every floor
          like this has, and the reason the centre lane stays clear. */}
      <FloorDecal
        texture={grateTexture()}
        position={[cx, cz]}
        size={[1.1, depth - 1]}
        opacity={0.8}
        color={ISO.steel}
      />
    </group>
  );
}
