'use client';

// The tile board: the grid, the desks standing on it, and the hover/placement
// feedback that makes tile-clicking legible.
//
// The grid is one InstancedMesh rather than ~800 meshes, so the whole floor is a
// single draw call and hover is resolved from the raycast's instanceId.

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from 'react';
import * as THREE from 'three';
import Desk, { type DeskLivery } from './DeskModels';
import MachineRoomSet from './MachineRoomSet';
import Character, { type CharacterLook } from './Character';
import { cellId, findPath, nearestOpen, type Cell } from './pathing';
import { useRouter } from 'next/navigation';
import { machineRoomDoors, arrivalCell, arrivalFacing, outwardFacing, doorAt, doorTileAt, rememberExit, takeArrival, type Door } from './portals';
import { Portal } from './MapDressing';
import { concreteTexture, hash2 } from './mapkit';
import { ISO, TILE_TOP, type IsoMachine, type PlacedIsoMachine } from './palette';

/**
 * Mirrors FLOOR_BOUNDS in lib/floor, which the server clamps every saved layout
 * into. Duplicated rather than imported because lib/floor loads node:sqlite.
 * If the server's bounds ever move, this must move with them — a board smaller
 * than the server's would strand machines off-grid.
 */
export const BOARD_BOUNDS = { minX: -12, maxX: 12, minZ: -20, maxZ: 12 } as const;

export interface BoardBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export const cellKey = (x: number, z: number) => `${x}:${z}`;

export interface DragState {
  dragging: boolean;
  moved: number;
}

interface BoardProps {
  machines: IsoMachine[];
  layout: PlacedIsoMachine[];
  /** The machine the player picked up and is about to place. */
  holdingId: string | null;
  selectedId: string | null;
  onTileClick: (x: number, z: number) => void;
  onDeskClick: (id: string) => void;
  /**
   * The tile the player is standing on, reported as they arrive.
   *
   * Building a desk happens where you STAND, not where you click — a click with
   * nothing in hand already means "walk there", and overloading it would make
   * every step across the room a decision about whether you meant to build. So
   * the floor watches where you end up instead.
   */
  onPlayerMove?: (cell: Cell) => void;
  dragRef: MutableRefObject<DragState>;
  /** Compact boards (the dashboard twin) pass their own extent. */
  bounds?: BoardBounds;
  /**
   * Build the room around the board.
   *
   * Only the Machine Room wants it. The dashboard twin and the title-screen
   * showroom are framed at a fixed zoom on a board a few tiles across, and a
   * shell that reaches 1.4 units past the bounds would be cropped by that
   * framing — the walls would arrive as slabs across the corner of a widget.
   */
  dressed?: boolean;
  /**
   * The player, standing in the room.
   *
   * Supplied only by the real Machine Room — the dashboard twin is a diagram of
   * a floor, and a character wandering around a diagram would be claiming it is
   * somewhere you can be.
   */
  avatar?: { look: CharacterLook; name?: string } | null;
  /** Desk and plinth cosmetics, applied to every desk on this floor. */
  livery?: DeskLivery;
}

const TILE_GEO = new THREE.BoxGeometry(0.98, 0.16, 0.98);
const dummy = new THREE.Object3D();
const tint = new THREE.Color();

/**
 * Shop-floor zoning.
 *
 * The centre lane is the service trench nobody builds over, the margin is the
 * walkway inside the hazard band, and everything between is bay. Three tones
 * instead of a checkerboard is what turns a grid into a floor plan.
 */
function zoneColour(x: number, z: number, bounds: BoardBounds, doors: Door[]): string {
  // The way out is painted before anything else claims the tile.
  if (doorTileAt(doors, x, z)) return '#8fae1f';
  if (Math.abs(x) <= 0.5) return '#7f7c74';
  const margin =
    x <= bounds.minX || x >= bounds.maxX || z <= bounds.minZ || z >= bounds.maxZ;
  if (margin) return '#55524b';
  // Bays are 4x4; the seam between them is painted a shade darker.
  const seam = ((x % 4) + 4) % 4 === 0 || ((z % 4) + 4) % 4 === 0;
  return seam ? '#5e5b54' : '#6b6860';
}

export default function IsoBoard({
  machines,
  layout,
  holdingId,
  selectedId,
  onTileClick,
  onDeskClick,
  onPlayerMove,
  dragRef,
  bounds = BOARD_BOUNDS,
  dressed = false,
  avatar = null,
  livery,
}: BoardProps) {
  const router = useRouter();
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const [hover, setHover] = useState<number | null>(null);
  /** Where the player is standing. Only meaningful when `avatar` is supplied. */
  /** Spawn at the door you came through. See IsoTradingFloor for the why. */
  const [entry] = useState<{ cell: Cell; facing: number }>(() => {
    const from = takeArrival();
    const door = from ? machineRoomDoors(bounds).find((d) => d.id === from) : null;
    return door
      ? { cell: arrivalCell(door), facing: arrivalFacing(door) }
      : { cell: { x: 0, z: 3 }, facing: 0 };
  });
  const spawn = entry.cell;
  const [position, setPosition] = useState<Cell>(spawn);
  const [path, setPath] = useState<Cell[]>([]);
  /** See IsoTradingFloor: guards against spawning inside a door and bouncing. */
  const [hasWalked, setHasWalked] = useState(false);
  const arrive = useCallback((cell: Cell) => {
    setPosition(cell);
    setHasWalked(true);
  }, []);

  /**
   * Report where the player is standing, including on arrival.
   *
   * Watches `position` rather than firing inside `arrive`, so the spawn counts:
   * somebody who walks into the room and builds without taking a step would
   * otherwise never have told the floor where they are, and the build affordance
   * would not appear until their second move.
   */
  useEffect(() => { onPlayerMove?.(position); }, [onPlayerMove, position]);

  const cells = useMemo(() => {
    const out: Array<{ x: number; z: number }> = [];
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      for (let z = bounds.minZ; z <= bounds.maxZ; z += 1) out.push({ x, z });
    }
    return out;
  }, [bounds]);

  // Declared above the tile-colour effect on purpose: that effect lists `doors`
  // as a dependency, and a dependency array is evaluated while the body runs —
  // so a memo declared further down would be read in its temporal dead zone and
  // throw before the board ever painted.
  //
  // Doors follow the buildable area, which grows to take in desks an older
  // layout left further out; one pinned to the original edge would end up
  // standing in the middle of the floor.
  const doors = useMemo(() => machineRoomDoors(bounds), [bounds]);

  /**
   * Cell -> instance index, for the pick plane.
   *
   * Hover is still stored as an index because the tint effect writes colours by
   * instance, but it is now DERIVED from a rounded world coordinate rather than
   * read off a raycast against the tile geometry. A lookup rather than a scan:
   * this runs on every pointer move across ~800 cells.
   */
  const cellIndex = useMemo(() => {
    const map = new Map<string, number>();
    cells.forEach((c, i) => map.set(cellKey(c.x, c.z), i));
    return map;
  }, [cells]);
  const indexOfCell = useCallback(
    (x: number, z: number) => cellIndex.get(cellKey(x, z)) ?? null,
    [cellIndex]
  );

  const byId = useMemo(() => new Map(machines.map((m) => [m.id, m])), [machines]);
  const occupied = useMemo(() => {
    const set = new Map<string, string>();
    for (const p of layout) set.set(cellKey(p.x, p.z), p.id);
    return set;
  }, [layout]);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    cells.forEach((c, i) => {
      dummy.position.set(c.x, 0, c.z);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [cells]);

  // Tile colour carries every piece of board state: parity for readability,
  // occupancy so a full cell is obvious, and hover that turns red when the drop
  // would be refused — the player should never click into a rejected placement.
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    cells.forEach((c, i) => {
      const key = cellKey(c.x, c.z);
      const taken = occupied.get(key);
      if (hover === i) {
        const blocked = Boolean(holdingId && taken && taken !== holdingId);
        mesh.setColorAt(i, tint.set(blocked ? ISO.tileBlocked : ISO.tileHover));
        return;
      }
      if (taken) {
        mesh.setColorAt(i, tint.set(ISO.tileOccupied));
        return;
      }
      // Zone gives the cell its job, the jitter keeps a poured floor from
      // reading as one printed sheet.
      tint.set(zoneColour(c.x, c.z, bounds, doors));
      mesh.setColorAt(i, tint.multiplyScalar(0.93 + hash2(c.x, c.z, 7) * 0.14));
    });
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [cells, hover, occupied, holdingId, bounds, doors]);

  const holding = holdingId ? byId.get(holdingId) : null;
  const hoverCell = hover != null ? cells[hover] : null;

  /** Desks are solid: the player walks around the plant, not through it. */
  const blocked = useMemo(() => new Set(layout.map((p) => cellId(p.x, p.z))), [layout]);

  const doorHere = avatar ? doorAt(doors, position.x, position.z) : null;

  /**
   * Walking into a doorway takes you through it — no confirmation step, same as
   * the Trading Floor. Gated on the walk having finished, so a route that
   * crosses the threshold on its way elsewhere does not eject the player
   * mid-errand, and ref-guarded so it fires once per arrival.
   */
  const walking =
    path.length > 0 &&
    !(path[path.length - 1].x === position.x && path[path.length - 1].z === position.z);
  const leaveThrough = walking || !hasWalked ? null : doorHere;
  const leaving = useRef(false);
  useEffect(() => {
    if (!leaveThrough) { leaving.current = false; return; }
    if (leaving.current) return;
    leaving.current = true;
    rememberExit(leaveThrough.arriveAt);
    router.push(leaveThrough.href);
  }, [leaveThrough, router]);

  const walkTo = useCallback(
    (x: number, z: number) => {
      if (!avatar) return;
      const route = findPath(position, { x, z }, bounds, blocked);
      if (route.length) setPath(route);
    },
    [avatar, position, bounds, blocked]
  );

  /** Reach out when standing next to the desk that is currently selected. */
  const selectedPlacement = selectedId ? layout.find((p) => p.id === selectedId) : undefined;
  const atSelected = Boolean(
    selectedPlacement &&
      Math.abs(selectedPlacement.x - position.x) <= 1 &&
      Math.abs(selectedPlacement.z - position.z) <= 1
  );

  return (
    <group>
      {/* Board base, so the grid reads as a solid object rather than floating tiles. */}
      <mesh position={[
        (bounds.minX + bounds.maxX) / 2,
        -0.22,
        (bounds.minZ + bounds.maxZ) / 2,
      ]} receiveShadow>
        <boxGeometry args={[
          bounds.maxX - bounds.minX + 2.4,
          0.36,
          bounds.maxZ - bounds.minZ + 2.4,
        ]} />
        <meshStandardMaterial color={ISO.panel} flatShading roughness={0.9} />
      </mesh>

      {dressed && <MachineRoomSet bounds={bounds} />}

      {/*
        The floor. DRAWN here, but no longer picked here.

        Tiles are boxes 0.16 units tall, and under a fixed isometric camera a ray
        toward a far tile clips the raised SIDE of a nearer one on the way — so
        the instanceId that came back was the tile in front of the one you were
        pointing at. Consistently, by roughly one cell, in the same direction.
        That is the offset, and it is the same class of bug the Deep Forest had
        before it stopped picking against geometry.
      */}
      <instancedMesh
        ref={meshRef}
        args={[TILE_GEO, undefined, cells.length]}
        receiveShadow
        castShadow
        raycast={() => null}
      >
        <meshStandardMaterial map={concreteTexture()} flatShading roughness={0.84} metalness={0.02} />
      </instancedMesh>

      {/*
        The pick surface: one flat plane, and a rounding.

        Exactly what the outdoor maps do. A plane has no thickness, so there is
        no side face to clip and the hit point IS the tile — world x/z round
        straight to a cell with nothing to convert and nothing to get wrong.

        Sits at 0.09, just above the tile tops (0.08) and just below where desks
        stand (TILE_TOP, 0.1), so desks and doors still take their own clicks
        first and only bare floor reaches this.

        Transparent, NOT `visible={false}` — three.js skips invisible objects
        when raycasting, which would make this a pick surface nothing can pick.
      */}
      <mesh
        position={[(bounds.minX + bounds.maxX) / 2, 0.09, (bounds.minZ + bounds.maxZ) / 2]}
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerMove={(e) => {
          e.stopPropagation();
          setHover(indexOfCell(Math.round(e.point.x), Math.round(e.point.z)));
        }}
        onPointerOut={() => setHover(null)}
        onClick={(e) => {
          e.stopPropagation();
          // A drag that ends over a tile is a camera pan, not a placement.
          if (dragRef.current.moved > 6) return;
          const x = Math.round(e.point.x);
          const z = Math.round(e.point.z);
          if (indexOfCell(x, z) == null) return;
          // Holding a machine means the click is a placement; otherwise it is
          // the player deciding to go and stand somewhere.
          if (holdingId) onTileClick(x, z);
          else walkTo(x, z);
        }}
      >
        <planeGeometry
          args={[bounds.maxX - bounds.minX + 1, bounds.maxZ - bounds.minZ + 1]}
        />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* Ghost of the desk being placed, so the drop lands where it looks. */}
      {holding && hoverCell && (
        <group position={[hoverCell.x, TILE_TOP, hoverCell.z]} scale={0.96}>
          <group>
            <Desk kind={holding.kind} accent={holding.accent} hovered livery={livery} />
          </group>
        </group>
      )}

      {layout.map((placed) => {
        const machine = byId.get(placed.id);
        if (!machine) return null;
        return (
          <group
            key={placed.id}
            position={[placed.x, TILE_TOP, placed.z]}
            rotation={[0, placed.rotation, 0]}
            onClick={(e) => {
              e.stopPropagation();
              if (dragRef.current.moved > 6) return;
              onDeskClick(placed.id);
              // Walk over to whatever you just selected, so inspecting a desk is
              // something the character does rather than something the UI does.
              if (!holdingId) {
                const spot = nearestOpen({ x: placed.x, z: placed.z }, bounds, blocked);
                if (spot) walkTo(spot.x, spot.z);
              }
            }}
            onPointerOver={(e) => e.stopPropagation()}
          >
            <Desk
              kind={machine.kind}
              accent={machine.accent}
              selected={selectedId === placed.id || holdingId === placed.id}
              livery={livery}
            />
          </group>
        );
      })}

      {/* Only rendered when somebody is in the room to use it. The dashboard
          twin is a diagram of a floor, and a door on a diagram promises a place
          you can walk to. */}
      {avatar &&
        doors.map((door) => (
          <Portal
            key={door.id}
            position={[door.x, door.z]}
            facing={outwardFacing(door)}
            label={door.label}
            active={doorHere?.id === door.id}
            onEnter={() => { rememberExit(door.arriveAt); router.push(door.href); }}
          />
        ))}

      {avatar && (
        <Character
          look={avatar.look}
          name={avatar.name}
          target={position}
          path={path}
          spawn={spawn}
          spawnFacing={entry.facing}
          onStep={arrive}
          action={atSelected ? 'interact' : 'idle'}
        />
      )}
    </group>
  );
}
