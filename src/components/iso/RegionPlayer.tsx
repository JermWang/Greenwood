'use client';

// You, in an outdoor region — parameterised by the map you are standing on.
//
// GroundsPlayer was written against lib/grounds-map directly, and adding a
// second outdoor region made the choice explicit: copy it, or take the map as an
// argument. Everything in it that matters is already generic — click a tile,
// route to it, walk, notice thresholds — and the only region-specific parts are
// four pure functions and a rectangle.
//
// GroundsPlayer should collapse into this next. It is left alone here rather
// than refactored alongside a new region, because changing the component that
// drives the one region players actually use, in the same pass as adding one
// nobody has walked yet, is how you end up unable to tell which change broke it.

import { useCallback, useMemo, useState } from 'react';
import { ThreeEvent } from '@react-three/fiber';
import type { MutableRefObject } from 'react';
import type { DragState } from './IsoBoard';
import Character, { lookFor, type CharacterAction } from './Character';
import { findPathWhere, smoothPath, type Cell } from './pathing';
import { DoorTile, TileFill, TileRing } from './TileMarker';
import { ISO } from './palette';

/** Everything this component needs to know about where it is. */
export interface RegionMap<D> {
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  isWalkable: (x: number, z: number) => boolean;
  doors: D[];
  doorAt: (x: number, z: number) => D | null;
  doorCells: (door: D) => Array<{ x: number; z: number }>;
  /** Identity, for comparing the door under the player against the door list. */
  doorId: (door: D) => string;
}

export interface RegionPlayerProps<D> {
  wallet: string;
  map: RegionMap<D>;
  start: Cell;
  /** Which way to look on arrival, radians about Y. 0 faces +Z. */
  startFacing?: number;
  /** Shared with IsoRig, so a camera pan is not also read as an order to walk. */
  dragRef: MutableRefObject<DragState>;
  onMove: (cell: Cell) => void;
  onDoor: (door: D | null) => void;
  /**
   * What the body is doing while stood still.
   *
   * Owned by the page, because the page owns whatever request the animation is
   * covering — a swing starts when the request goes out and stops when it comes
   * back, and only the caller knows that.
   */
  action?: CharacterAction;
  positionRef?: MutableRefObject<{ x: number; z: number } | null>;
}

/**
 * World x/z ARE map x/z under the shared IsoRig, so picking a tile is a
 * rounding and nothing more. Every bug in this conversion came from a bespoke
 * camera that recentred the world under the player.
 */
const toCell = (point: { x: number; z: number }): Cell => ({
  x: Math.round(point.x),
  z: Math.round(point.z),
});

export default function RegionPlayer<D>({
  wallet,
  map,
  start,
  startFacing = 0,
  dragRef,
  onMove,
  onDoor,
  action = 'idle',
  positionRef,
}: RegionPlayerProps<D>) {
  const [spawn] = useState<Cell>(() => ({ ...start }));
  const [position, setPosition] = useState<Cell>(spawn);
  const [route, setRoute] = useState<Cell[]>([]);
  const [hover, setHover] = useState<Cell | null>(null);

  const look = useMemo(() => lookFor({ wallet, isSelf: true }), [wallet]);

  const plane = useMemo(
    () => ({
      w: map.bounds.maxX - map.bounds.minX + 1,
      d: map.bounds.maxZ - map.bounds.minZ + 1,
      cx: (map.bounds.minX + map.bounds.maxX) / 2,
      cz: (map.bounds.minZ + map.bounds.maxZ) / 2,
    }),
    [map.bounds]
  );

  const step = useCallback(
    (cell: Cell) => {
      setPosition(cell);
      onMove(cell);
      onDoor(map.doorAt(cell.x, cell.z));
    },
    [onMove, onDoor, map]
  );

  const goTo = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      event.stopPropagation();
      // A drag that happened to end over this tile is a camera pan, not a walk.
      if (dragRef.current.moved > 6) return;
      const target = toCell(event.point);
      if (!map.isWalkable(target.x, target.z)) return;
      onDoor(null);
      // Smoothed: BFS ties break toward staircases, and walking one reads as
      // drunk. See smoothPath.
      const raw = findPathWhere(position, target, map.bounds, map.isWalkable);
      setRoute(smoothPath(raw, position, map.isWalkable));
    },
    [position, dragRef, onDoor, map]
  );

  const onHover = useCallback((event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    const cell = toCell(event.point);
    setHover((prev) => (prev && prev.x === cell.x && prev.z === cell.z ? prev : cell));
  }, []);

  const walkable = hover ? map.isWalkable(hover.x, hover.z) : false;
  const standing = map.doorAt(position.x, position.z);

  return (
    <>
      {/* The click surface. Transparent, NOT invisible: three.js skips invisible
          objects when raycasting, so a hidden plane is one nothing can click. */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[plane.cx, 0.004, plane.cz]}
        onClick={goTo}
        onPointerMove={onHover}
        onPointerOut={() => setHover(null)}
      >
        <planeGeometry args={[plane.w, plane.d]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      <Character
        look={look}
        target={position}
        path={route}
        onStep={step}
        spawn={spawn}
        spawnFacing={startFacing}
        action={action}
        positionRef={positionRef}
      />

      {/* Showing the REFUSAL matters as much as showing the target: a tile that
          silently ignores clicks teaches players the game is unresponsive. */}
      {hover && (
        <TileFill
          x={hover.x}
          z={hover.z}
          color={walkable ? ISO.accent : '#d2453a'}
          opacity={walkable ? 0.26 : 0.2}
        />
      )}

      {route.length > 0 && (
        <TileRing
          x={route[route.length - 1].x}
          z={route[route.length - 1].z}
          color={ISO.accent}
          opacity={0.8}
          y={0.02}
        />
      )}

      {/* Thresholds, as lit tiles. A door you have to discover by walking into
          it is a door most players never find. */}
      {map.doors.flatMap((d) => {
        const here = standing != null && map.doorId(standing) === map.doorId(d);
        return map.doorCells(d).map((c) => (
          <DoorTile
            key={`${map.doorId(d)}:${c.x}:${c.z}`}
            x={c.x}
            z={c.z}
            color={ISO.accent}
            opacity={here ? 0.6 : 0.32}
          />
        ));
      })}
    </>
  );
}
