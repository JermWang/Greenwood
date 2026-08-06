'use client';

// The Trading Floor: the game's social space, built as a room rather than a grid.
//
// The layout is authored, not scattered. Two glazed walls close the far corner
// so the space has a back to it; four trading stalls sit at the corners with the
// Outfitter on the north wall; the middle is left clear around a stone medallion
// because a floor people gather on has to have somewhere to gather. Between them
// run walkway lanes, and the leftover ground is dressed — a lounge with a rug
// and benches on the east side, a colonnade down the far walls, planters, a
// queue rope, a market board, and pendants throwing real pools of light.
//
// One table, PROPS, is the source of truth for the furniture: it is what gets
// drawn AND what the pathfinder treats as solid. Two lists would drift, and the
// symptom would be a character strolling through a bench.

import { useRouter } from 'next/navigation';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { IsoRig, Lighting } from './IsoScene';
import { renderTier } from './render-tier';
import { type BoardBounds, type DragState } from './IsoBoard';
import Character, { lookFor } from './Character';
import { cellId, findPath, nearestOpen, type Cell } from './pathing';
import { TRADING_FLOOR_DOORS, arrivalCell, arrivalFacing, outwardFacing, doorAt, doorTileAt, rememberExit, takeArrival } from './portals';
import { ISO, ISO_OFFSET, TILE_TOP } from './palette';
import { hash2, terrazzoTexture, grateTexture, hazardTexture } from './mapkit';
import {
  Beam,
  Bench,
  Column,
  FloorDecal,
  Medallion,
  Pendant,
  Planter,
  Portal,
  Rug,
  Stanchion,
  TickerBoard,
  Wall,
  ZoneSign,
} from './MapDressing';
import { useFloorPresence, type FloorPeer, type PresenceIdentity } from './useFloorPresence';
import NpcField from './NpcField';
import NpcDialogue from '@/components/ui/NpcDialogue';
import { npcAt, type Npc } from '@/lib/npcs';
import { api } from '@/lib/api-client';

/** 23x23. Roughly double the old room, which had the stalls almost touching. */
const FLOOR: BoardBounds = { minX: -11, maxX: 11, minZ: -11, maxZ: 11 };
/** Module-level: an inline literal would make R3F re-apply and stomp the fit. */
const CAMERA = { position: ISO_OFFSET, zoom: 30, near: -400, far: 600 } as const;
const TILE_GEO = new THREE.BoxGeometry(0.98, 0.16, 0.98);
const dummy = new THREE.Object3D();
const tint = new THREE.Color();

const DOORS = TRADING_FLOOR_DOORS;

interface Stall {
  key: string;
  label: string;
  blurb: string;
  /** Where clicking it goes. Null for a stall that opens a panel in place. */
  href: string | null;
  x: number;
  z: number;
  accent: string;
}

/**
 * Stalls ring the floor rather than sitting in it, so the middle stays clear
 * for players to gather — the part of a trading floor that has to feel busy.
 *
 * The Outfitter is the exception that opens over the floor instead of routing
 * away: what you buy there is worn by the avatar standing three tiles from you,
 * and leaving the scene to shop would hide the only reason to shop.
 */
const STALLS: Stall[] = [
  { key: 'instruments', label: 'Instruments', blurb: 'Enhancement parts', href: '/app/market', x: -7, z: -7, accent: ISO.bright },
  { key: 'allocations', label: 'Allocations', blurb: 'Sealed deal flow', href: '/app/market', x: 7, z: -7, accent: ISO.mint },
  { key: 'desks', label: 'Desks', blurb: 'Upgraded machines', href: '/app/market', x: -7, z: 7, accent: ISO.accent },
  { key: 'notes', label: 'Fixed Income', blurb: 'Lock BNTY for yield', href: '/app/stake', x: 7, z: 7, accent: ISO.amber },
  { key: 'outfitter', label: 'Outfitter', blurb: 'Looks and refinements', href: null, x: 0, z: -9, accent: ISO.deep },
];

type PropKind = 'planter' | 'bench' | 'stanchion' | 'column';

interface FloorProp {
  kind: PropKind;
  x: number;
  z: number;
  rotation?: number;
  rope?: number;
  seed?: number;
}

/**
 * Every solid thing on the floor, in one table.
 *
 * Rendered from here and made impassable from here, so the two can never
 * disagree — the same reason floor-rules.ts exists on the server side.
 */
const PROPS: FloorProp[] = [
  // Colonnade down the two far walls.
  { kind: 'column', x: -10, z: -10 }, { kind: 'column', x: -10, z: -4 },
  { kind: 'column', x: -10, z: 2 }, { kind: 'column', x: -10, z: 8 },
  { kind: 'column', x: -4, z: -10 }, { kind: 'column', x: 3, z: -10 },
  { kind: 'column', x: 9, z: -10 },
  // East lounge.
  { kind: 'bench', x: 9, z: -2, rotation: Math.PI }, { kind: 'bench', x: 9, z: 2 },
  { kind: 'planter', x: 10, z: -5, seed: 1 }, { kind: 'planter', x: 10, z: 5, seed: 2 },
  // Greenery along the west wall and the open edges.
  { kind: 'planter', x: -10, z: -1, seed: 3 }, { kind: 'planter', x: -10, z: 5, seed: 4 },
  { kind: 'planter', x: -5, z: 10, seed: 5 }, { kind: 'planter', x: 4, z: 10, seed: 6 },
  { kind: 'planter', x: -2, z: -6, seed: 7 }, { kind: 'planter', x: 2, z: -6, seed: 8 },
  { kind: 'planter', x: 6, z: 3, seed: 9 },
  // Queue rope in front of the Outfitter.
  { kind: 'stanchion', x: -3, z: -7, rope: 3 }, { kind: 'stanchion', x: 0, z: -7, rope: 3 },
  { kind: 'stanchion', x: 3, z: -7 },
];

/**
 * Cells a character may not stand on.
 *
 * Stalls occupy their own cell; props occupy theirs. The walls are outside the
 * tile bounds, so the bounds check already keeps anyone from walking into them.
 */
const BLOCKED = new Set<string>([
  ...STALLS.map((s) => cellId(s.x, s.z)),
  ...PROPS.map((p) => cellId(p.x, p.z)),
]);

/**
 * What kind of ground each cell is.
 *
 * This is the zoning pass, and it is what stops the floor reading as graph
 * paper: the atrium is polished and pale, lanes are worn lighter where people
 * walk, stall aprons are darker service tile, and the leftover field is plain.
 */
type Zone = 'atrium' | 'lane' | 'apron' | 'lounge' | 'field' | 'door';

const ZONE_COLOUR: Record<Zone, string> = {
  atrium: '#b6b2a9',
  lane: '#a29e95',
  apron: '#7c7970',
  lounge: '#8b877e',
  field: '#6e6b64',
  /** Brand green, and the only tiles on the floor painted with it. */
  door: '#8fae1f',
};

function zoneOf(x: number, z: number): Zone {
  // Doors win over every other zone: the way out has to be the most legible
  // thing on the ground, not something the atrium can overpaint.
  if (doorTileAt(DOORS, x, z)) return 'door';
  if (Math.hypot(x, z) <= 4.6) return 'atrium';
  for (const stall of STALLS) {
    if (Math.abs(x - stall.x) <= 1 && Math.abs(z - stall.z) <= 1) return 'apron';
  }
  if (x >= 7 && Math.abs(z) <= 4) return 'lounge';
  if (Math.abs(x) <= 1 || Math.abs(z) <= 1) return 'lane';
  return 'field';
}

function surface(color: string, emissive?: string, intensity = 0) {
  return (
    <meshStandardMaterial
      color={color}
      flatShading
      roughness={0.78}
      metalness={0.06}
      emissive={emissive ?? '#000000'}
      emissiveIntensity={intensity}
    />
  );
}

/** A market stall: timber counter, steel posts, painted canopy, lit sign. */
function StallModel({ stall, hovered }: { stall: Stall; hovered: boolean }) {
  return (
    <group>
      <mesh position={[0, 0.35, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.5, 0.5, 1.0]} />
        {surface(ISO.wood)}
      </mesh>
      <mesh position={[0, 0.62, 0]} castShadow>
        <boxGeometry args={[1.6, 0.08, 1.1]} />
        {surface(ISO.woodDark)}
      </mesh>
      {/* Illuminated sign board — the branded element. */}
      <mesh position={[0, 0.74, 0.44]}>
        <boxGeometry args={[1.35, 0.14, 0.06]} />
        {surface(stall.accent, stall.accent, hovered ? 1.4 : 0.75)}
      </mesh>
      {[-0.65, 0.65].map((x) => (
        <mesh key={x} position={[x, 1.0, -0.35]} castShadow>
          <boxGeometry args={[0.09, 1.3, 0.09]} />
          <meshStandardMaterial color={ISO.steelDark} flatShading roughness={0.4} metalness={0.6} />
        </mesh>
      ))}
      <mesh position={[0, 1.7, 0]} rotation={[0.18, 0, 0]} castShadow>
        <boxGeometry args={[1.7, 0.12, 1.2]} />
        {surface(hovered ? ISO.paint : '#cfcbc3')}
      </mesh>
      {/* Goods on the counter, so a stall looks stocked rather than staffed by
          nobody selling nothing. */}
      {[-0.45, 0, 0.45].map((x, i) => (
        <mesh key={x} position={[x, 0.74 + (i === 1 ? 0.05 : 0), -0.1]} castShadow>
          <boxGeometry args={[0.26, i === 1 ? 0.22 : 0.14, 0.26]} />
          {surface(i % 2 === 0 ? ISO.steel : ISO.woodDark)}
        </mesh>
      ))}
    </group>
  );
}

function FloorTiles({
  onWalk,
  dragRef,
}: {
  onWalk: (x: number, z: number) => void;
  dragRef: React.MutableRefObject<DragState>;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const [hover, setHover] = useState<number | null>(null);

  const cells = useMemo(() => {
    const out: Array<{ x: number; z: number; zone: Zone }> = [];
    for (let x = FLOOR.minX; x <= FLOOR.maxX; x += 1) {
      for (let z = FLOOR.minZ; z <= FLOOR.maxZ; z += 1) out.push({ x, z, zone: zoneOf(x, z) });
    }
    return out;
  }, []);

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

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    cells.forEach((c, i) => {
      if (hover === i) {
        mesh.setColorAt(i, tint.set(ISO.tileHover));
        return;
      }
      // Zone gives the tile its job; the per-cell jitter stops a zone reading as
      // one printed sheet. Laid stone is never twice the same shade.
      tint.set(ZONE_COLOUR[c.zone]);
      const wear = 0.94 + hash2(c.x, c.z, 3) * 0.12;
      mesh.setColorAt(i, tint.multiplyScalar(wear));
    });
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [cells, hover]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[TILE_GEO, undefined, cells.length]}
      receiveShadow
      onPointerMove={(e) => { e.stopPropagation(); if (e.instanceId != null) setHover(e.instanceId); }}
      onPointerOut={() => setHover(null)}
      onClick={(e) => {
        e.stopPropagation();
        if (dragRef.current.moved > 6) return;
        if (e.instanceId == null) return;
        const cell = cells[e.instanceId];
        onWalk(cell.x, cell.z);
      }}
    >
      <meshStandardMaterial map={terrazzoTexture()} flatShading roughness={0.62} metalness={0.03} />
    </instancedMesh>
  );
}

/**
 * The static set: walls, structure, props and floor markings.
 *
 * Memoised because none of it depends on where anyone is standing, and
 * rebuilding sixty meshes every time a character takes a step is the difference
 * between a smooth floor and a stuttering one.
 */
const Room = memo(function Room() {
  return (
    <group>
      {/* Far walls only. At this fixed camera angle the near sides would sit
          between the player and the room, so the two that close the space are
          the two you are looking at. */}
      <Wall position={[0, -11.9]} length={24.4} windows={7} height={4.6} />
      <Wall position={[-11.9, 0]} length={24.4} rotation={Math.PI / 2} windows={7} height={4.6} />

      {PROPS.map((prop, i) => {
        switch (prop.kind) {
          case 'column':
            return <Column key={i} position={[prop.x, prop.z]} height={4.6} />;
          case 'bench':
            return <Bench key={i} position={[prop.x, prop.z]} rotation={prop.rotation} />;
          case 'stanchion':
            return <Stanchion key={i} position={[prop.x, prop.z]} rope={prop.rope} />;
          default:
            return <Planter key={i} position={[prop.x, prop.z]} seed={prop.seed} />;
        }
      })}

      {/* Two runs, not five. The full grid drew a bright X across the middle of
          the room and competed with everything under it — overhead structure
          should frame the space, not be the first thing you look at. */}
      {[-7, 7].map((z) => <Beam key={`bz-${z}`} position={[0, z]} length={23} height={4.7} />)}

      {/* Atrium: the medallion is the thing at the middle of the room, and the
          reason the centre is worth standing in. */}
      <Medallion size={9.4} />
      <Pendant position={[0, 0]} height={4.2} />
      {[[-4, -4], [4, -4], [-4, 4], [4, 4]].map(([x, z], i) => (
        <Pendant key={i} position={[x, z]} height={3.9} cast={false} />
      ))}

      <Rug position={[9, 0]} size={[4.2, 7.4]} />
      <ZoneSign position={[9, 0]} label="LOUNGE" height={3.3} accent={ISO.amber} />

      {/* West wall carries the market board — the room's one live surface. */}
      <TickerBoard position={[-11.6, 0]} rotation={Math.PI / 2} width={8.4} />

      {/* Painted markings: hazard band across the exit threshold, and grating
          where the lanes reach the atrium. */}
      {/* Painted lines land on tile boundaries: a hazard band on the seam two
          tiles short of the doorway, and grate strips centred on the tile where
          each lane meets the atrium. Both were on arbitrary fractions — 9.3 and
          5.6 — so the paint cut across tiles at a slightly different place on
          every side of the room. */}
      <FloorDecal texture={hazardTexture()} position={[0, 9.5]} size={[4.2, 0.48]} opacity={0.5} color={ISO.amber} />
      {[[-6, 0], [6, 0], [0, -6], [0, 6]].map(([x, z], i) => (
        <FloorDecal
          key={i}
          texture={grateTexture()}
          position={[x, z]}
          size={i < 2 ? [0.9, 3.4] : [3.4, 0.9]}
          opacity={0.55}
          color={ISO.steelDark}
        />
      ))}
    </group>
  );
});

export default function IsoTradingFloor({
  identity,
  onOpenStall,
}: {
  identity: PresenceIdentity | null;
  /** Called for stalls that have no href — the page decides what to show. */
  onOpenStall?: (key: string) => void;
}) {
  const router = useRouter();
  const dragRef = useRef<DragState>({ dragging: false, moved: 0 });
  /** The cell the character has actually reached — what presence broadcasts. */
  /**
   * Spawn at the door you came through, if you came through one.
   *
   * Computed once in a lazy initialiser so the arrival marker is consumed on
   * the first render — a later re-render must not re-read it and teleport the
   * player back to the threshold mid-session.
   */
  // Position and heading are taken together, in one initialiser, because
  // takeArrival() consumes the stored door — reading it twice would give the
  // second caller nothing and leave the character facing a default direction at
  // an arrival position.
  const [entry] = useState<{ cell: Cell; facing: number }>(() => {
    const from = takeArrival();
    const door = from ? DOORS.find((d) => d.id === from) : null;
    return door
      ? { cell: arrivalCell(door), facing: arrivalFacing(door) }
      : { cell: { x: 0, z: 4 }, facing: 0 };
  });
  const spawn = entry.cell;
  const [position, setPosition] = useState<Cell>(spawn);
  const [path, setPath] = useState<Cell[]>([]);
  /**
   * Whether the player has taken a step in this room yet.
   *
   * Auto-entry is suppressed until they have. Spawn points currently sit well
   * clear of every doorway, but that is a coincidence of the numbers rather
   * than something enforced — and the failure it protects against is the worst
   * kind: spawning inside a door bounces you straight back to the room you came
   * from, which bounces you back again, with no way out but closing the tab.
   */
  const [hasWalked, setHasWalked] = useState(false);
  /** Who you are talking to. Null closes the panel. */
  const [talking, setTalking] = useState<Npc | null>(null);
  const arrive = useCallback((cell: Cell) => {
    setPosition(cell);
    setHasWalked(true);
    // Walking away ends the conversation, the same rule as every other room.
    setTalking((current) => (current && !npcAt('trading-floor', cell.x, cell.z) ? null : current));
  }, []);

  /* Total Level gates which lines exist. Fetched here rather than passed in,
     so a caller cannot forget it and quietly mute half the dialogue. */
  const [totalLevel, setTotalLevel] = useState(0);
  useEffect(() => {
    const me = identity?.wallet;
    if (!me) return;
    void api.regions(me).then((r) => setTotalLevel(r.totalLevel)).catch(() => {});
  }, [identity?.wallet]);
  const [hoveredStall, setHoveredStall] = useState<string | null>(null);
  const { peers, live } = useFloorPresence(identity, position);

  /**
   * Route from wherever the character stands to the clicked cell.
   *
   * Routed from `position` — the last cell actually reached — rather than from
   * the end of the current path, so redirecting mid-walk turns around from
   * where you are instead of finishing the old errand first.
   */
  const walkTo = useCallback(
    (x: number, z: number) => {
      const route = findPath(position, { x, z }, FLOOR, BLOCKED);
      if (route.length) setPath(route);
    },
    [position]
  );

  const stallHere = useMemo(
    () => STALLS.find((s) => Math.abs(s.x - position.x) <= 1 && Math.abs(s.z - position.z) <= 1) ?? null,
    [position]
  );
  const doorHere = doorAt(DOORS, position.x, position.z);
  const walking = path.length > 0 && !(path[path.length - 1].x === position.x && path[path.length - 1].z === position.z);

  /**
   * Walking into a doorway takes you through it.
   *
   * No confirmation: the player already said what they wanted by walking onto a
   * tile painted as an exit, and a button in front of a door is the friction
   * that makes a world feel like a form.
   *
   * Gated on the walk having FINISHED rather than on merely occupying the tile,
   * because a route along the south edge can cross the threshold on its way
   * somewhere else — firing per step would yank the player out of the room
   * mid-errand. The ref makes it fire once per arrival rather than on every
   * render while standing there.
   */
  const leaveThrough = walking || !hasWalked ? null : doorHere;
  const leaving = useRef(false);
  useEffect(() => {
    if (!leaveThrough) { leaving.current = false; return; }
    if (leaving.current) return;
    leaving.current = true;
    // Record which threshold, so the next room can put you at its side of it
    // rather than materialising you in the middle of the floor.
    rememberExit(leaveThrough.arriveAt);
    router.push(leaveThrough.href);
  }, [leaveThrough, router]);

  // Device render budget, read once per mount. See render-tier.
  const tier = useMemo(() => renderTier(), []);

  const self = peers.find((p) => p.isSelf) ?? null;
  const others = peers.filter((p) => !p.isSelf);

  return (
    <div className="iso-floor-wrap">
      <Canvas
        shadows
        dpr={tier.dpr}
        orthographic
        camera={CAMERA}
        gl={{ antialias: tier.antialias, powerPreference: 'high-performance', toneMapping: THREE.ACESFilmicToneMapping }}
        onCreated={({ gl }) => { gl.outputColorSpace = THREE.SRGBColorSpace; }}
      >
        <color attach="background" args={[ISO.void]} />
        <Lighting bounds={FLOOR} />
        <IsoRig dragRef={dragRef} interactive bounds={FLOOR} />

        {/* Plinth under the tiles, with a rim, so the room sits on something. */}
        <mesh position={[0, -0.3, 0]} receiveShadow>
          <boxGeometry args={[25.2, 0.5, 25.2]} />
          <meshStandardMaterial color={ISO.panel} flatShading roughness={0.9} />
        </mesh>
        <mesh position={[0, -0.03, 0]}>
          <boxGeometry args={[24.1, 0.14, 24.1]} />
          <meshStandardMaterial color={ISO.concreteDark} flatShading roughness={0.85} />
        </mesh>

        <FloorTiles dragRef={dragRef} onWalk={walkTo} />
        <Room />

        {DOORS.map((door) => (
          <Portal
            key={door.id}
            position={[door.x, door.z]}
            facing={outwardFacing(door)}
            label={door.label}
            active={doorHere?.id === door.id}
            onEnter={() => { rememberExit(door.arriveAt); router.push(door.href); }}
          />
        ))}

        {STALLS.map((stall) => (
          <group
            key={stall.key}
            position={[stall.x, TILE_TOP, stall.z]}
            onPointerOver={(e) => { e.stopPropagation(); setHoveredStall(stall.key); }}
            onPointerOut={() => setHoveredStall(null)}
            onClick={(e) => {
              e.stopPropagation();
              if (dragRef.current.moved > 6) return;
              // Walk over to it rather than teleporting or acting from across
              // the room. The stall's own cell is solid, so aim for the nearest
              // open one — which is how you end up standing at the counter.
              const spot = nearestOpen({ x: stall.x, z: stall.z }, FLOOR, BLOCKED);
              if (spot) walkTo(spot.x, spot.z);
            }}
          >
            <StallModel stall={stall} hovered={hoveredStall === stall.key} />
            {/* The blurb only appears when you are at the stall or pointing at
                it. Five permanent two-line signs covered more of the room than
                the room, and read as UI pasted over a scene rather than as
                signage in it. */}
            <Html center position={[0, 2.4, 0]} zIndexRange={[10, 0]}>
              <div
                className={`iso-stall-sign ${
                  hoveredStall === stall.key || stallHere?.key === stall.key ? 'is-near' : ''
                }`}
              >
                <b>{stall.label}</b>
                <small>{stall.blurb}</small>
              </div>
            </Html>
          </group>
        ))}

        {/* Stall pendants are mounted here rather than in Room so each one sits
            over the stall it lights, wherever that stall is moved to. */}
        {STALLS.map((stall, i) => (
          <Pendant
            key={stall.key}
            position={[stall.x, stall.z]}
            height={3.6}
            color={stall.accent}
            /* Only the corner stalls carry a real light. Five more point lights
               for the sake of the fifth stall is not a trade worth making. */
            cast={i < 4}
          />
        ))}

        {self && (
          <Character
            look={lookFor(self)}
            name={self.name}
            target={position}
            path={path}
            spawn={spawn}
            spawnFacing={entry.facing}
            onStep={arrive}
            action={stallHere ? 'interact' : 'idle'}
          />
        )}
        {/* Peers have no route of their own: they walk straight at whatever
            position presence last reported, which reads as walking because the
            animation is derived from the motion rather than sent with it. */}
        {others.map((peer) => (
          <Character key={peer.wallet} look={lookFor(peer)} name={peer.name} target={{ x: peer.x, z: peer.z }} />
        ))}
        <NpcField region="trading-floor" playerAt={position} onTalk={setTalking} />
      </Canvas>

      <NpcDialogue npc={talking} totalLevel={totalLevel} onClose={() => setTalking(null)} />

      <div className="iso-floor-hud">
        <span className={live ? 'is-live' : ''}>
          {live ? `${peers.length} on the floor` : 'Solo session'}
        </span>
        <small>
          {walking
            ? 'Walking…'
            : doorHere
              ? `Heading through to the ${doorHere.label}…`
              : stallHere
                ? `At the ${stallHere.label} stall — open it below`
                : 'Click a tile to walk · click a stall to visit it · green tiles are the way out'}
        </small>
        {!doorHere && !walking && stallHere && (
          <button
            className="iso-floor-cta"
            onClick={() => {
              if (stallHere.href) router.push(stallHere.href);
              else onOpenStall?.(stallHere.key);
            }}
          >
            Open {stallHere.label}
          </button>
        )}
      </div>
    </div>
  );
}
