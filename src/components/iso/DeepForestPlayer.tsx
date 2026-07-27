'use client';

// You, in the forest. Movement, and the loot you can see from where you stand.
//
// The client computes a route and then WALKS it one tile at a time, asking the
// server to confirm each step. That looks wasteful next to posting a destination
// and being teleported there, and the waste is the point: everything in this
// zone is a question about where you are right now. Loot is readable at one
// tile. Extraction happens at a gate. A client that could cross the map in one
// call could read every pile on it without ever being exposed.
//
// So the server is the authority and this component is a prediction. It moves
// the character immediately for responsiveness, and when the server disagrees it
// RECONCILES rather than retries — snapping back to the tile the server believes
// and dropping the rest of the route. A client that argued with a rejection
// would be a client that eventually wins.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ThreeEvent } from '@react-three/fiber';
import type { MutableRefObject } from 'react';
import type { DragState } from './IsoBoard';
import Character, { lookFor } from './Character';
import { ISO } from './palette';
import { EXTENT, isWalkable, gateAt } from '@/lib/deep-forest-map';
/**
 * NOT smoothed, unlike the Grounds.
 *
 * smoothPath collapses a staircase into long straight legs, which is what makes
 * walking read as walking — but out here every leg is posted to the server and
 * validated as a single step (Chebyshev distance of one). A smoothed route would
 * be a sequence of jumps the server is right to reject, and the client would
 * spend the whole walk reconciling. Straightening this one means smoothing for
 * DISPLAY while still stepping the server through each tile, which is a change
 * to the prediction/reconciliation contract rather than a change to a route.
 */
import { findPathWhere, type Cell } from './pathing';
import { TileFill, TileRing } from './TileMarker';
import { api, type CreatureView, type PlayerView, type VisiblePile } from '@/lib/api-client';

/**
 * The map, as a rectangle the route search may not leave.
 *
 * Module-level so its identity is stable — findPathWhere reads it on every
 * click, and rebuilding it per render would defeat nothing but is noise.
 */
const FOREST = { minX: -EXTENT, maxX: EXTENT, minZ: -EXTENT, maxZ: EXTENT } as const;

/**
 * Shortest walkable route between two tiles.
 *
 * Breadth-first over the same `isWalkable` the SERVER validates against, so a
 * path this finds is a path the server will accept step by step. Eight-way, so
 * diagonals cost one step — matching the server's Chebyshev reachability check.
 * If this walked four-way the two would disagree about what "adjacent" means and
 * every diagonal step would be rejected.
 *
 * The search itself lives in components/iso/pathing. It used to be a near-copy
 * here, and the copy had drifted: no corner rule, plus a visit cap of 4,000 on a
 * map of 8,649 tiles, so any walk long enough to spread the search wide hit the
 * cap and returned nothing. Clicking did nothing, silently.
 */
const findRoute = (from: Cell, to: Cell): Cell[] => findPathWhere(from, to, FOREST, isWalkable);

/**
 * Turn a world-space hit into a map tile.
 *
 * A rounding, and nothing more — which is the point.
 *
 * This used to undo two transforms: a Follow group that recentred the map on
 * the player, and worldToLocal on a plane rotated flat. Both were sources of
 * bugs (the rotation made every click resolve near z=0), and both existed only
 * because the camera was bespoke. With the shared IsoRig there is no offset and
 * no rotated intermediary: world x/z ARE map x/z.
 */
function toMapCell(point: { x: number; z: number }): Cell {
  return { x: Math.round(point.x), z: Math.round(point.z) };
}

export interface DeepForestPlayerProps {
  wallet: string;
  start: Cell;
  /**
   * Shared with IsoRig. A pan is a pointerdown, a lot of movement, and a
   * pointerup that lands over some tile — without checking this, every camera
   * drag would also order a walk to wherever the release happened.
   */
  dragRef: MutableRefObject<DragState>;
  onPiles: (piles: VisiblePile[]) => void;
  /** Creatures ride back with every step — what is hunting you changes as you move. */
  onCreatures: (creatures: CreatureView[]) => void;
  /** Other players, which move independently of anything this client does. */
  onPlayers: (players: PlayerView[]) => void;
  onMove: (cell: Cell) => void;
  /**
   * Handed to Character, which writes the live interpolated position into it
   * every frame so the camera can travel with the walk. Especially wanted out
   * here: steps are paced to a server round trip, so a camera driven by arrivals
   * moves in visible lurches.
   */
  positionRef?: React.MutableRefObject<{ x: number; z: number } | null>;
}

export default function DeepForestPlayer({ wallet, start, dragRef, onPiles, onCreatures, onPlayers, onMove, positionRef }: DeepForestPlayerProps) {
  const [position, setPosition] = useState<Cell>(start);
  const [route, setRoute] = useState<Cell[]>([]);
  const walking = useRef(false);

  const look = useMemo(() => lookFor({ wallet, isSelf: true }), [wallet]);

  /**
   * Walk the queued route, confirming each tile.
   *
   * Sequential rather than fired in parallel, because a step is only legal from
   * the tile before it — the server checks adjacency, so two steps in flight at
   * once would have the second one rejected for starting from a position that
   * had not been reached yet.
   */
  useEffect(() => {
    if (walking.current || route.length === 0) return;
    walking.current = true;

    let cancelled = false;
    (async () => {
      for (const cell of route) {
        if (cancelled) break;
        try {
          const result = await api.step(wallet, cell.x, cell.z);
          if (cancelled) break;
          setPosition(result.position);
          onMove(result.position);
          onPiles(result.piles);
          onCreatures(result.creatures);
          onPlayers(result.players);
          if (!result.accepted) {
            // The server put us somewhere else. Abandon the rest of the route
            // rather than trying the next tile, which would be a step from a
            // position we are no longer in.
            setRoute([]);
            break;
          }
        } catch {
          setRoute([]);
          break;
        }
        // Paced to roughly match the character's walk speed, so the model is
        // still arriving at one tile as the next is confirmed.
        await new Promise((r) => setTimeout(r, 190));
      }
      if (!cancelled) setRoute([]);
      walking.current = false;
    })();

    return () => {
      cancelled = true;
      walking.current = false;
    };
  }, [route, wallet, onMove, onPiles, onCreatures, onPlayers]);

  /**
   * The tile under the cursor.
   *
   * The forest had no hover feedback at all, which is why it did not feel like
   * the other rooms: every board in the game tints the tile you are pointing at,
   * and without it a click is a guess. Tracked here rather than in the scene so
   * it can be coloured by whether the tile is actually reachable.
   */
  const [hover, setHover] = useState<Cell | null>(null);

  const onHover = useCallback((event: ThreeEvent<PointerEvent>) => {
    // stopPropagation matches IsoBoard, the room where hover already works.
    // Without it the event keeps travelling to whatever is behind the click
    // plane and the last handler to run wins the frame.
    event.stopPropagation();
    const cell = toMapCell(event.point);
    setHover((prev) => (prev && prev.x === cell.x && prev.z === cell.z ? prev : cell));
  }, [position]);

  const goTo = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      event.stopPropagation();
      // A drag that ended over this tile is a camera pan, not an order to walk.
      if (dragRef.current.moved > 6) return;
      const target = toMapCell(event.point);
      if (!isWalkable(target.x, target.z)) return;
      setRoute(findRoute(position, target));
    },
    [position, dragRef]
  );

  /**
   * Which way to look on arrival: away from the gate you came in through, i.e.
   * toward the middle of the map. atan2(x, z) because the model faces +Z.
   */
  const spawnFacing = useMemo(() => {
    const gate = gateAt(start.x, start.z);
    if (!gate) return 0;
    return Math.atan2(-gate.x, -gate.z);
  }, [start.x, start.z]);

  const onGate = gateAt(position.x, position.z);

  return (
    <>
      {/* The click surface. Invisible, sitting just above the ground plane, and
          sized to the map — clicks are resolved against this rather than against
          the terrain so a click that lands on a tree still routes to the tile
          under it instead of doing nothing. */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.005, 0]}
        onClick={goTo}
        onPointerMove={onHover}
        onPointerOut={() => setHover(null)}
      >
        <planeGeometry args={[EXTENT * 2 + 1, EXTENT * 2 + 1]} />
        {/*
          Transparent, NOT `visible={false}`.

          three.js skips invisible objects when raycasting, so a hidden plane is
          a plane nothing can click — the surface was there, the handler was
          wired, and every click silently went nowhere. depthWrite is off so an
          invisible surface at ground level cannot occlude anything drawn after
          it.
        */}
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* No nameplate. The gate's name was passed here, which rendered it as
          the PLAYER's label — a floating 'South Gate' over the character's head
          that followed them around. A gate is a place; its name belongs on the
          structure, and ExtractionGate carries it now. */}
      {/*
        Faces INTO the map on arrival.

        Character defaults to angle 0, which is +Z — and the South Gate is on
        the +Z edge, so a player entering there spawned looking out of the gate
        they had just walked in through, at the void past the map boundary.
        Derived from the spawn gate rather than hardcoded, so the North, East
        and West gates are right the day they are used as entrances.
      */}
      <Character
        look={look}
        target={position}
        spawn={start}
        spawnFacing={spawnFacing}
        positionRef={positionRef}
      />

      {/*
        Hover tile. Green when you can walk there, red when you cannot.

        Drawn as a full tile quad rather than a ring, matching IsoBoard — the
        other rooms tint the whole cell, and a different shape out here would
        read as a different interaction. Showing the REFUSAL is as important as
        showing the target: a tile that simply ignores clicks teaches players
        the game is unresponsive, where a red tile teaches them it is blocked.
      */}
      {hover && (
        <TileFill
          x={hover.x}
          z={hover.z}
          color={isWalkable(hover.x, hover.z) ? ISO.accent : '#d2453a'}
          opacity={isWalkable(hover.x, hover.z) ? 0.26 : 0.2}
        />
      )}

      {/* Destination marker, so a long walk shows where it is going. */}
      {route.length > 0 && (
        <TileRing
          x={route[route.length - 1].x}
          z={route[route.length - 1].z}
          color={ISO.accent}
          opacity={0.8}
          y={0.02}
        />
      )}
    </>
  );
}
