'use client';

// You, in the Grounds. Click a tile, walk there; walk into a door, go through it.
//
// MOVEMENT HERE IS CLIENT-SIDE, and that is a deliberate departure from the Deep
// Forest rather than an oversight. CLAUDE.md's rule is that the server owns
// anything that can be CONTESTED, and nothing in this region can be: there is no
// loot, no PvP, no creature, nothing to gather and nothing to lose. A player who
// cheated their position here would arrive at a door they were always allowed to
// walk to, faster.
//
// What is still enforced server-side is the only thing that matters — whether
// the door OPENS. That check lives in lib/regions and runs against the player's
// real level and pack, not against anything this component believes. Cheating
// your way to the Treeline arch gets you a refusal at the arch.
//
// The moment anything out here becomes worth arguing over, this has to move to
// the expedition model. lib/grounds-map is already written to that contract —
// zero imports, pure functions of the coordinate — so the server can start
// validating steps without the terrain having to be rebuilt first.

import { useCallback, useMemo, useState } from 'react';
import { ThreeEvent } from '@react-three/fiber';
import type { MutableRefObject } from 'react';
import type { DragState } from './IsoBoard';
import Character, { lookFor } from './Character';
import { findPathWhere, smoothPath, type Cell } from './pathing';
import { DoorTile, TileFill, TileRing } from './TileMarker';
import { ISO } from './palette';
import {
  ARRIVAL,
  BOUNDS,
  DOORS,
  doorAt,
  doorCells,
  isWalkable,
  type Doorway,
} from '@/lib/grounds-map';

/** The click surface, sized and placed to cover exactly the playable rectangle. */
const PLANE = {
  w: BOUNDS.maxX - BOUNDS.minX + 1,
  d: BOUNDS.maxZ - BOUNDS.minZ + 1,
  cx: (BOUNDS.minX + BOUNDS.maxX) / 2,
  cz: (BOUNDS.minZ + BOUNDS.maxZ) / 2,
};

/**
 * Turn a world-space hit into a map tile.
 *
 * A rounding, and nothing more. There is no offset to undo and no rotated
 * intermediary to convert through, because the camera is the shared IsoRig:
 * world x/z ARE map x/z. Every bug in this conversion in the Deep Forest came
 * from a bespoke camera that recentred the world under the player.
 */
const toCell = (point: { x: number; z: number }): Cell => ({
  x: Math.round(point.x),
  z: Math.round(point.z),
});

export interface GroundsPlayerProps {
  wallet: string;
  /**
   * Where to appear.
   *
   * Defaults to the arrival point at the south end of the avenue, but the page
   * overrides it when the player has just walked OUT of a building — you should
   * come back out of the door you went in through, not be teleported to the edge
   * of the map. Same rule the rooms follow between themselves (see portals).
   */
  start?: Cell;
  /** Shared with IsoRig, so a camera pan is not also read as an order to walk. */
  dragRef: MutableRefObject<DragState>;
  /** Fired on every tile reached, so the page can follow with the camera. */
  onMove: (cell: Cell) => void;
  /** Fired when the player stops on a doorway tile. */
  onDoor: (door: Doorway | null) => void;
  /**
   * Handed straight to Character, which writes the live interpolated position
   * into it every frame. The camera reads it — see IsoRig's `followRef`.
   */
  positionRef?: React.MutableRefObject<{ x: number; z: number } | null>;
}

export default function GroundsPlayer({
  wallet,
  start,
  dragRef,
  onMove,
  onDoor,
  positionRef,
}: GroundsPlayerProps) {
  // Read once. `start` is a mount-time decision — re-reading it would snap a
  // walking character back to the door they came in through.
  const [spawn] = useState<Cell>(() => start ?? { ...ARRIVAL });
  const [position, setPosition] = useState<Cell>(spawn);
  const [route, setRoute] = useState<Cell[]>([]);
  const [hover, setHover] = useState<Cell | null>(null);

  const look = useMemo(() => lookFor({ wallet, isSelf: true }), [wallet]);

  /**
   * Reached a tile.
   *
   * Character fires this per waypoint, so the door check runs on arrival rather
   * than on a timer — walking THROUGH a doorway on the way somewhere else still
   * triggers it, which is correct: the door is the destination for anyone whose
   * route ends on it, and a passer-by gets a prompt they can ignore.
   */
  const step = useCallback(
    (cell: Cell) => {
      setPosition(cell);
      onMove(cell);
      onDoor(doorAt(cell.x, cell.z));
    },
    [onMove, onDoor]
  );

  const goTo = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      event.stopPropagation();
      // A drag that happened to end over this tile is a camera pan, not a walk.
      if (dragRef.current.moved > 6) return;
      const target = toCell(event.point);
      if (!isWalkable(target.x, target.z)) return;
      // Leaving the tile you were standing on clears any door prompt, so a
      // prompt never outlives the doorway that produced it.
      onDoor(null);
      // Smoothed: BFS ties are broken toward staircases, and walking one
      // literally reads as drunk. See smoothPath.
      const raw = findPathWhere(position, target, BOUNDS, isWalkable);
      setRoute(smoothPath(raw, position, isWalkable));
    },
    [position, dragRef, onDoor]
  );

  const onHover = useCallback((event: ThreeEvent<PointerEvent>) => {
    // stopPropagation matches IsoBoard. Without it the event keeps travelling to
    // whatever is behind the click plane and the last handler to run wins.
    event.stopPropagation();
    const cell = toCell(event.point);
    setHover((prev) => (prev && prev.x === cell.x && prev.z === cell.z ? prev : cell));
  }, []);

  const walkable = hover ? isWalkable(hover.x, hover.z) : false;

  return (
    <>
      {/* The click surface. Sized to the map and sitting just above the ground,
          so a click that lands on a tree still routes to the tile under it
          rather than doing nothing. */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[PLANE.cx, 0.004, PLANE.cz]}
        onClick={goTo}
        onPointerMove={onHover}
        onPointerOut={() => setHover(null)}
      >
        <planeGeometry args={[PLANE.w, PLANE.d]} />
        {/*
          Transparent, NOT `visible={false}`.

          three.js skips invisible objects when raycasting, so a hidden plane is
          a plane nothing can click — the surface is there, the handler is wired,
          and every click silently goes nowhere.
        */}
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/*
        Facing.

        Arriving from the south edge you look NORTH, up the avenue toward the
        fence — the direction the region wants you to walk, and Character
        otherwise defaults to +Z, which at the south edge means arriving with
        your back to the whole map.

        Coming out of a door you look SOUTH, because every door into the Grounds
        is entered heading south: the settlement is at the south end and the
        wilderness at the north, so walking out of a building and walking back
        from the Treeline are the same direction of travel. That uniformity is
        why this is a single comparison rather than a table.
      */}
      <Character
        look={look}
        target={position}
        path={route}
        onStep={step}
        spawn={spawn}
        spawnFacing={spawn.z === ARRIVAL.z && spawn.x === ARRIVAL.x ? Math.PI : 0}
        positionRef={positionRef}
      />

      {/* Hover tile: green where you can walk, red where you cannot. Showing the
          REFUSAL matters as much as showing the target — a tile that silently
          ignores clicks teaches players the game is unresponsive, where a red
          one teaches them it is blocked. */}
      {hover && (
        <TileFill
          x={hover.x}
          z={hover.z}
          color={walkable ? ISO.accent : '#d2453a'}
          opacity={walkable ? 0.26 : 0.2}
        />
      )}

      {/* Destination marker, so a long walk shows where it is heading. */}
      {route.length > 0 && (
        <TileRing
          x={route[route.length - 1].x}
          z={route[route.length - 1].z}
          color={ISO.accent}
          opacity={0.8}
          y={0.02}
        />
      )}

      {/*
        Every doorway, as a LIT TILE rather than an outline.

        The Grounds are large and mostly empty, and a door you have to discover
        by walking into it is a door most players never find — so the ways out
        have to be visible from the middle of the region, which is the whole
        reason this place exists.

        Filled, because an outline put doors in the same visual language as loot
        piles and creature footprints: three unrelated things all drawn as an
        outlined square. A door is somewhere you GO, so it gets the fill that
        means ground-you-can-act-on. Brighter when you are standing in it.
      */}
      {DOORS.flatMap((d) => {
        const standing = doorAt(position.x, position.z)?.id === d.id;
        return doorCells(d).map((c) => (
          <DoorTile
            key={`${d.id}:${c.x}:${c.z}`}
            x={c.x}
            z={c.z}
            color={ISO.accent}
            opacity={standing ? 0.6 : 0.32}
          />
        ));
      })}
    </>
  );
}
