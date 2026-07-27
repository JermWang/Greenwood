'use client';

// The animated fund avatar: legs that swing, a body that turns to face where it
// is going, and a reach when it works a stall or a desk.
//
// The important design decision is that ANIMATION IS DERIVED FROM MOTION, not
// commanded. The component is told where the character should be; it walks
// there at a fixed speed and reads its own velocity each frame to decide how
// fast the legs swing and which way the body faces. That means a remote player,
// whose position arrives over presence a few times a second, animates exactly
// like the one you are driving — no animation state on the wire, and no way for
// the two to disagree.

import { memo, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { ISO, TILE_TOP } from './palette';
import { TileRing } from './TileMarker';
import type { Cell } from './pathing';
import { AVATAR_SKINS, HAND, BOOT } from './avatar-skins';

// Re-exported so existing importers of Character keep working unchanged.
export { AVATAR_SKINS };
export type { AvatarSkin } from './avatar-skins';

/** Tiles per second. Slow enough to read as walking, quick enough to not annoy. */
const WALK_SPEED = 3.2;
/** How close counts as arrived. Below this the character snaps and stops. */
const ARRIVE_EPS = 0.06;
/** Radians per second the body turns. A snap-turn reads as a glitch. */
const TURN_RATE = 9;

export type CharacterAction = 'idle' | 'interact';

export interface CharacterLook {
  /** Glove colour, when a cosmetic overrides bare hands. */
  hand?: string;
  /** Boot colour, when a cosmetic overrides the default. */
  boot?: string;
  /** Eye colour. Laser Eyes is the reason this exists. */
  eyes?: string;
  /** Jacket / body colour. */
  body: string;
  /** Cap colour — the one branded piece by default. */
  cap: string;
  /** Cosmetic trim, when one is worn. */
  trim?: string;
  /** Neon piping down the sleeves, for the rare tier. */
  piping?: boolean;
  /** Upgrade rank, drawn as shoulder pips and trim brightness. */
  level?: number;
  isSelf?: boolean;
}

/** Ordinary clothing colours, so a crowd does not read as one uniform. */
export const OUTFITS = ['#3f5c86', '#7a3f4a', '#4a5a48', '#6b5b3e', '#4b4459', '#2f5c5c'];

export function lookFor(who: {
  wallet: string;
  outfit?: string | null;
  outfitLevel?: number;
  tier?: number;
  isSelf?: boolean;
}): CharacterLook {
  const hash = [...who.wallet].reduce((a, c) => a + c.charCodeAt(0), 0);
  const skin = who.outfit ? AVATAR_SKINS[who.outfit] : undefined;
  return {
    body: skin?.shell ?? OUTFITS[hash % OUTFITS.length],
    cap: who.isSelf ? ISO.accent : (who.tier ?? 1) >= 7 ? ISO.bright : ISO.steel,
    trim: skin?.trim,
    piping: skin?.piping,
    hand: skin?.hand,
    boot: skin?.boot,
    eyes: skin?.eyes,
    level: who.outfitLevel ?? 0,
    isSelf: who.isSelf,
  };
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

/**
 * The body, in parts.
 *
 * It was one box for the legs and one for the torso, which cannot walk — there
 * is nothing to swing. Limbs are separate groups pivoting at hip and shoulder,
 * and the head carries eyes and a cap peak on its front face so that which way
 * the character is facing is legible from every one of the eight directions the
 * board can send it.
 */
const Body = memo(function Body({ look }: { look: CharacterLook }) {
  const level = Math.max(0, Math.min(5, look.level ?? 0));
  const glow = look.trim ? 0.25 + level * 0.12 : look.isSelf ? 0.3 : 0.1;
  const trim = look.trim;
  return (
    <>
      <mesh name="torso" position={[0, 0.62, 0]} castShadow>
        <boxGeometry args={[0.4, 0.44, 0.3]} />
        {surface(look.body, trim ?? look.body, glow)}
      </mesh>

      {trim && (
        /*
          Collar band — the piece that says "this fund bought something".

          Refinement rank used to ALSO stack one lit cube per level on the right
          shoulder. They read as three floating boxes behind the shoulder rather
          than as insignia, and at this scale anything that small stops being a
          detail and becomes debris. Rank still shows: the band's emissive
          strength climbs with it, which is legible on the silhouette instead of
          fighting it.
        */
        <mesh position={[0, 0.82, 0]} castShadow>
          <boxGeometry args={[0.42, 0.06, 0.32]} />
          {surface(trim, trim, 0.6 + level * 0.14)}
        </mesh>
      )}

      <mesh position={[0, 0.98, 0]} castShadow>
        <boxGeometry args={[0.3, 0.3, 0.3]} />
        {surface(ISO.pale)}
      </mesh>
      {/*
        Eyes: two blocks, not one bar.

        This was a single 0.24-wide strip across the whole face — it did the job
        of showing which way the head pointed, but it read as a visor, and a
        character with a visor is equipment rather than a person. Two separate
        blocks with a gap between them read as a face at a glance and cost one
        extra mesh. They stay square and unshaded, so the style does not drift
        toward detail the rest of the set does not have.

        Set slightly proud of the face (z 0.155 against the head's 0.15 front)
        so they never z-fight with the head at grazing angles.
      */}
      {[-0.062, 0.062].map((x) => (
        <mesh key={x} position={[x, 1.01, 0.155]}>
          <boxGeometry args={[0.075, 0.075, 0.02]} />
          {/* Lit when a cosmetic sets a colour — Laser Eyes has to glow or it is
              just a red square, and the whole point of it is being visible from
              across the room. */}
          {surface(look.eyes ?? '#2b2a24', look.eyes, look.eyes ? 2.2 : 0)}
        </mesh>
      ))}
      <mesh position={[0, 1.19, 0]} castShadow>
        <boxGeometry args={[0.36, 0.1, 0.36]} />
        {surface(look.cap, look.cap, 0.5)}
      </mesh>
      {/* Cap peak, also forward-facing. */}
      <mesh position={[0, 1.17, 0.21]}>
        <boxGeometry args={[0.3, 0.05, 0.12]} />
        {surface(look.cap, look.cap, 0.35)}
      </mesh>
    </>
  );
});

/**
 * One limb, pivoting at its top so it swings from the joint, not the middle.
 *
 * `end` puts a block on the far end — a hand or a boot. A limb that stops in a
 * flat cut looks unfinished at this scale, and because the block sits inside the
 * same pivoting group it swings with the limb for free: the boot leads the
 * stride and the hand trails the arm without a second animation.
 */
function Limb({
  x,
  y,
  color,
  length,
  width,
  trim,
  glow,
  end,
  groupRef,
}: {
  x: number;
  y: number;
  color: string;
  length: number;
  width: number;
  trim?: string;
  glow?: number;
  /** Hands sit square on the wrist; boots are deeper and step forward. */
  end?: { kind: 'hand' | 'boot'; color: string };
  groupRef: React.RefObject<THREE.Group | null>;
}) {
  const boot = end?.kind === 'boot';
  const endHeight = boot ? 0.07 : 0.08;
  return (
    <group ref={groupRef} position={[x, y, 0]}>
      <mesh position={[0, -length / 2, 0]} castShadow>
        <boxGeometry args={[width, length, width * 1.15]} />
        {surface(color, trim, glow ?? 0)}
      </mesh>
      {end && (
        <mesh
          // Sunk a hair into the limb rather than butted against it, so the two
          // never separate into a visible seam mid-swing.
          position={[0, -length + endHeight / 2 - 0.01, boot ? width * 0.28 : 0]}
          castShadow
        >
          <boxGeometry
            args={
              boot
                ? [width * 1.12, endHeight, width * 1.9]
                : [width * 1.05, endHeight, width * 1.2]
            }
          />
          {surface(end.color)}
        </mesh>
      )}
    </group>
  );
}

export interface CharacterProps {
  look: CharacterLook;
  /** Where the character should end up. Peers set this straight from presence. */
  target: Cell;
  /**
   * Route to follow. When present the character walks it waypoint by waypoint;
   * without one it walks straight at `target`, which is what a peer does.
   */
  path?: Cell[];
  /** Fired as each waypoint is reached, so the owner can broadcast position. */
  onStep?: (cell: Cell) => void;
  /** Play the reach animation when standing still. */
  action?: CharacterAction;
  name?: string;
  /** Start position, so a character does not walk in from the origin on mount. */
  spawn?: Cell;
  /**
   * Which way to face on mount, in radians about Y, 0 toward +Z.
   *
   * Needed because facing is otherwise only ever set by movement, so a
   * character who has not walked yet faces +Z regardless of how they got there.
   * Someone arriving through a door was therefore left looking back out of it.
   */
  spawnFacing?: number;
  /**
   * Written every frame with where this character actually is.
   *
   * For the camera, which must not learn the position from `onStep` — that
   * fires on waypoints, so a camera driven by it lurches between the few points
   * a smoothed route has rather than travelling with you. A ref keeps it off the
   * React path entirely: the scene re-renders on position changes and the camera
   * has no reason to be part of that.
   */
  positionRef?: React.MutableRefObject<{ x: number; z: number } | null>;
}

export default function Character({
  look,
  target,
  path,
  onStep,
  action = 'idle',
  name,
  spawn,
  spawnFacing = 0,
  positionRef,
}: CharacterProps) {
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Group>(null);
  const legR = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);

  const start = spawn ?? target;
  const pos = useRef(new THREE.Vector3(start.x, TILE_TOP, start.z));
  // Read once, on mount. Later movement owns this value, so re-reading the prop
  // would snap a walking character back to their entry heading.
  const facing = useRef(spawnFacing);
  const phase = useRef(0);
  /** Index into `path`. Reset whenever a new route arrives. */
  const leg = useRef(0);
  const lastPath = useRef<Cell[] | undefined>(undefined);

  const level = Math.max(0, Math.min(5, look.level ?? 0));
  const armGlow = look.trim ? 0.7 + level * 0.14 : 0;
  const legColour = useMemo(() => ISO.metalDark, []);
  // Limb ends, recoloured by whatever is worn. Memoised because a fresh object
  // every frame would defeat the memo on Body and re-materialise four meshes.
  const handEnd = useMemo(() => (look.hand ? ({ kind: 'hand', color: look.hand } as const) : HAND), [look.hand]);
  const bootEnd = useMemo(() => (look.boot ? ({ kind: 'boot', color: look.boot } as const) : BOOT), [look.boot]);

  useFrame((state, rawDelta) => {
    const group = root.current;
    if (!group) return;
    // A backgrounded tab hands back a delta of several seconds; without a clamp
    // the character teleports the moment you return to it, which is the exact
    // behaviour this component exists to remove.
    const delta = Math.min(rawDelta, 0.1);

    if (path !== lastPath.current) {
      lastPath.current = path;
      leg.current = 0;
    }

    const waypoint = path && leg.current < path.length ? path[leg.current] : target;
    const dx = waypoint.x - pos.current.x;
    const dz = waypoint.z - pos.current.z;
    const distance = Math.hypot(dx, dz);

    let speed = 0;
    if (distance > ARRIVE_EPS) {
      const step = Math.min(distance, WALK_SPEED * delta);
      pos.current.x += (dx / distance) * step;
      pos.current.z += (dz / distance) * step;
      speed = step / delta;
      // Face the direction of travel. atan2(x, z) because the model faces +Z.
      facing.current = dampAngle(facing.current, Math.atan2(dx, dz), TURN_RATE, delta);
    } else if (path && leg.current < path.length) {
      pos.current.x = waypoint.x;
      pos.current.z = waypoint.z;
      leg.current += 1;
      onStep?.(waypoint);
    }

    group.position.set(pos.current.x, TILE_TOP, pos.current.z);
    group.rotation.y = facing.current;

    // Publish the interpolated position, not the waypoint. Anything that wants
    // to track this character — the camera, the minimap — reads it here and gets
    // every frame of the walk rather than the handful of tiles a route stops at.
    if (positionRef) positionRef.current = { x: pos.current.x, z: pos.current.z };

    const moving = speed > 0.15;
    // Phase advances with DISTANCE, not time, so the stride never slides: a
    // character crossing half a tile takes half a step, whatever the framerate.
    phase.current += speed * delta * 3.4;

    const swing = moving ? Math.sin(phase.current) : 0;
    const settle = moving ? 1 : Math.max(0, 1 - delta * 8);
    if (legL.current) legL.current.rotation.x = swing * 0.75;
    if (legR.current) legR.current.rotation.x = -swing * 0.75;

    if (body.current) {
      if (action === 'interact' && !moving) {
        // Lean in over the counter and keep the reach alive with a slow bob,
        // so a character working a stall is not a statue with one arm up.
        const t = state.clock.elapsedTime;
        body.current.rotation.x = 0.14;
        body.current.position.y = 0.02 + Math.sin(t * 2.2) * 0.012;
        if (armR.current) armR.current.rotation.x = -1.15 + Math.sin(t * 3.1) * 0.16;
        if (armL.current) armL.current.rotation.x = -0.2;
      } else {
        // Breathing while idle; a forward lean and counter-swinging arms while
        // walking. The vertical bob is on |sin| so it peaks once per footfall.
        const t = state.clock.elapsedTime;
        body.current.rotation.x = moving ? 0.07 : Math.sin(t * 1.5) * 0.012;
        body.current.position.y = moving ? Math.abs(Math.sin(phase.current)) * 0.045 : 0;
        if (armR.current) armR.current.rotation.x = -swing * 0.55 * settle;
        if (armL.current) armL.current.rotation.x = swing * 0.55 * settle;
      }
    }
  });

  return (
    /**
     * Deliberately out of scale with the room.
     *
     * At true height the character was about twelve pixels on a 23x23 floor —
     * smaller than its own nameplate, with the walk cycle and facing invisible.
     * Isometric games almost always oversize the player for exactly this
     * reason: legibility of the thing you control beats architectural accuracy.
     */
    <group ref={root} position={[start.x, TILE_TOP, start.z]} scale={1.55}>
      {/*
        Your own footprint, and it must be EXACTLY one tile.

        Counter-scaled, because this group is deliberately oversized (see above)
        and the ring is not a part of the character — it is a part of the FLOOR.
        Inherited, the 1.55 made the marker half again wider than the cell it
        claimed to occupy, so the one square a player watches constantly was the
        one square that disagreed with the grid. Everything else on the ground
        comes from components/iso/TileMarker; this is the same geometry, undone.
      */}
      {look.isSelf && (
        <group scale={1 / 1.55}>
          <TileRing x={0} z={0} color={ISO.accent} opacity={0.85} y={0.02} />
        </group>
      )}

      {/* Legs hang off the root so the walk cycle is unaffected by the torso's
          lean and bob — hips stay level, which is what makes a stride read. */}
      <Limb x={-0.1} y={0.42} length={0.4} width={0.15} color={legColour} end={bootEnd} groupRef={legL} />
      <Limb x={0.1} y={0.42} length={0.4} width={0.15} color={legColour} end={bootEnd} groupRef={legR} />

      <group ref={body}>
        <Body look={look} />
        <Limb
          x={-0.25}
          y={0.8}
          length={0.4}
          width={0.11}
          color={look.body}
          trim={look.piping ? look.trim : undefined}
          glow={look.piping ? armGlow : 0}
          end={handEnd}
          groupRef={armL}
        />
        <Limb
          x={0.25}
          y={0.8}
          length={0.4}
          width={0.11}
          color={look.body}
          trim={look.piping ? look.trim : undefined}
          glow={look.piping ? armGlow : 0}
          end={handEnd}
          groupRef={armR}
        />
      </group>

      {/* No distanceFactor: it scales DOM by camera distance, a perspective
          concept. Under an orthographic camera it blows the label up to fill
          the viewport, and a nameplate should stay legible at every zoom. The
          parent's spin does not tilt it — Html only projects a position. */}
      {name && (
        <Html center position={[0, 1.62, 0]} zIndexRange={[10, 0]}>
          <div className={`iso-nameplate ${look.isSelf ? 'is-self' : ''}`}>{name}</div>
        </Html>
      )}
    </group>
  );
}

/** Lerp toward an angle the short way round, so turning never takes the long path. */
function dampAngle(current: number, goal: number, rate: number, delta: number): number {
  let diff = goal - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * Math.min(1, rate * delta);
}
