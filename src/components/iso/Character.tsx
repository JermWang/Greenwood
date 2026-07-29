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
import { ISO, OUTFITS, TILE_TOP } from './palette';
import { TileRing } from './TileMarker';
import type { Cell } from './pathing';
import {
  approach,
  chopArm,
  chopLift,
  chopPitch,
} from './chop-curve';
import { AVATAR_SKINS, HAND, BOOT, SKIN_TONES, type HatStyle } from './avatar-skins';
export { OUTFITS } from './palette';

// Re-exported so existing importers of Character keep working unchanged.
export { AVATAR_SKINS, SKIN_TONES, HAT_STYLES, skinToneHex } from './avatar-skins';
export type { AvatarSkin } from './avatar-skins';

/** Tiles per second. Slow enough to read as walking, quick enough to not annoy. */
const WALK_SPEED = 3.2;
/** How close counts as arrived. Below this the character snaps and stops. */
const ARRIVE_EPS = 0.06;
/** Radians per second the body turns. A snap-turn reads as a glitch. */
const TURN_RATE = 9;

export type CharacterAction = 'idle' | 'interact' | 'chop';

/**
 * Swings per second while felling.
 *
 * Slow enough to read as WORK. The temptation with a repeating action is to
 * speed it up until it feels responsive, and that is the wrong instinct here —
 * a fast chop reads as a machine, and the whole appeal of a gathering skill is
 * that a person is doing something effortful. Just over one swing a second is
 * about where a real axe lands.
 */
const CHOP_HZ = 1.15;



export interface CharacterLook {
  /** Glove colour, when a cosmetic overrides bare hands. */
  hand?: string;
  /** Boot colour, when a cosmetic overrides the default. */
  boot?: string;
  /**
   * Head colour. Identity, never sold — see SKIN_TONES in avatar-skins.
   * Defaults to the historical pale so existing callers are unchanged.
   */
  skin?: string;
  /** Head shape. Silhouette is the cheapest identity in a box-built game. */
  hat?: HatStyle;
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

      {/*
        The head, in whatever skin was chosen.
        Defaults to the old hardcoded pale so every existing caller is unchanged.
      */}
      <mesh position={[0, 0.98, 0]} castShadow>
        <boxGeometry args={[0.3, 0.3, 0.3]} />
        {surface(look.skin ?? SKIN_TONES[0].hex)}
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
      <Hat style={look.hat ?? 'cap'} color={look.cap} />
    </>
  );
});

/**
 * Headwear.
 *
 * Everybody wore the same peaked cap, which made the head the one part of the
 * model that could not tell two characters apart — and the head is where the eye
 * lands first. Silhouette is the cheapest identity there is in a game drawn from
 * flat-shaded boxes: a hard hat and a beanie read as different people at a
 * distance where a jacket colour has already washed out.
 *
 * Every style is built from the same primitives as the rest of the set, so a new
 * one is a few boxes rather than an asset. See HAT_STYLES in avatar-skins for
 * the catalogue side.
 */
function Hat({ style, color }: { style: HatStyle; color: string }) {
  // Lit, because the cap is the one branded piece by default — the same reason
  // it is Robin Neon on your own character.
  const mat = (i = 0.5) => surface(color, color, i);
  switch (style) {
    case 'bare':
      return null;

    case 'beanie':
      // Taller, rounder, no peak. Sits down over the ears, so the head reads as
      // shorter — which is most of what makes it a different silhouette.
      return (
        <>
          <mesh position={[0, 1.17, 0]} castShadow>
            <boxGeometry args={[0.33, 0.16, 0.33]} />
            {mat(0.4)}
          </mesh>
          <mesh position={[0, 1.27, 0]} castShadow>
            <boxGeometry args={[0.2, 0.08, 0.2]} />
            {mat(0.4)}
          </mesh>
        </>
      );

    case 'hardhat':
      // Wide brim all the way round plus a raised crown rib. Site kit — the
      // shape says "works here" before any colour does.
      return (
        <>
          <mesh position={[0, 1.16, 0]} castShadow>
            <boxGeometry args={[0.44, 0.05, 0.44]} />
            {mat(0.35)}
          </mesh>
          <mesh position={[0, 1.22, 0]} castShadow>
            <boxGeometry args={[0.32, 0.14, 0.32]} />
            {mat(0.45)}
          </mesh>
          <mesh position={[0, 1.3, 0]} castShadow>
            <boxGeometry args={[0.08, 0.05, 0.3]} />
            {mat(0.5)}
          </mesh>
        </>
      );

    case 'visor':
      // A band and a peak, with the crown open. Reads as a dealer's eyeshade
      // from the front and as almost nothing from behind, which is exactly the
      // asymmetry that makes facing legible.
      return (
        <>
          <mesh position={[0, 1.16, 0]} castShadow>
            <boxGeometry args={[0.34, 0.07, 0.34]} />
            {mat(0.5)}
          </mesh>
          <mesh position={[0, 1.15, 0.22]}>
            <boxGeometry args={[0.32, 0.04, 0.14]} />
            {mat(0.35)}
          </mesh>
        </>
      );

    case 'bucket':
      // Brim low and level. The only style with a wider brim than crown, which
      // is what stops it reading as a smaller hard hat.
      return (
        <>
          <mesh position={[0, 1.14, 0]} castShadow>
            <boxGeometry args={[0.5, 0.04, 0.5]} />
            {mat(0.3)}
          </mesh>
          <mesh position={[0, 1.2, 0]} castShadow>
            <boxGeometry args={[0.32, 0.12, 0.32]} />
            {mat(0.4)}
          </mesh>
        </>
      );

    case 'cap':
    default:
      // The original: flat crown, forward peak. Kept as the default so every
      // character that has never chosen anything looks exactly as it did.
      return (
        <>
          <mesh position={[0, 1.19, 0]} castShadow>
            <boxGeometry args={[0.36, 0.1, 0.36]} />
            {mat(0.5)}
          </mesh>
          <mesh position={[0, 1.17, 0.21]}>
            <boxGeometry args={[0.3, 0.05, 0.12]} />
            {mat(0.35)}
          </mesh>
        </>
      );
  }
}

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
  /**
   * Pointed at, right now.
   *
   * Hover feedback has to reach the CHARACTER rather than living only on the
   * ground ring beneath them. A ring says "something is on that tile", which is
   * also what it says for a loot pile, a door and a creature — lighting the
   * person is what confirms the PERSON is the thing about to be clicked.
   */
  highlight?: boolean;
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
  highlight = false,
}: CharacterProps) {
  const root = useRef<THREE.Group>(null);
  /** The footprint square, held square to the grid while the body turns. */
  const marker = useRef<THREE.Group>(null);
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

    /*
     * Hold the footprint square to the GRID while the character turns on it.
     *
     * The marker is a child of this group, so it inherited the facing rotation
     * and span with every turn — a tile-shaped marker sitting at whatever angle
     * you last walked, permanently a few degrees out of true with the floor. It
     * looks like a rounding error and it is actually the character's heading.
     *
     * Counter-rotating is the fix rather than reparenting: the marker still has
     * to follow the interpolated position, and this group is what has it.
     */
    if (marker.current) marker.current.rotation.y = -facing.current;

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
      if (action === 'chop' && !moving) {
        /*
         * Felling. Both arms together, because an axe is two-handed.
         *
         * The parts that make it read as effort rather than as an arm moving:
         *
         *   THE TORSO FOLLOWS THE ARMS, slightly behind them. A character whose
         *   body is still while their shoulders swing looks like a doll with a
         *   hinge. Pitching forward on the strike is where the weight comes
         *   from.
         *
         *   IT RISES ON THE WIND-UP. Half a centimetre, but going up onto the
         *   balls of the feet before coming down is most of what sells a
         *   downward blow.
         *
         *   THE LEGS ARE PLANTED. Nothing below the hip moves — a stance that
         *   shifts would read as stumbling. That is why this branch overwrites
         *   the leg rotations the walk cycle set above.
         */
        const t = state.clock.elapsedTime;
        const p = (t * CHOP_HZ) % 1;
        const arm = chopArm(p);

        // Pitch is DERIVED from the arm, and lift is its own seamless hump —
        // both live in chop-curve so their continuity is asserted by a test
        // rather than trusted. The old version branched on phase at p = 0.62 for
        // each independently and jumped both at that seam.
        const bodyPitch = chopPitch(arm);
        const lift = chopLift(p);

        // Eased toward the targets rather than assigned, so arriving at a desk
        // blends into the swing over a few frames instead of snapping into it.
        const k = 22; // fast enough to keep the strike crisp, soft on entry
        if (armR.current) armR.current.rotation.x = approach(armR.current.rotation.x, arm, k, delta);
        // A hair out of phase, so the two arms are gripping one haft rather
        // than moving as a mirrored pair.
        if (armL.current) armL.current.rotation.x = approach(armL.current.rotation.x, arm + 0.08, k, delta);
        body.current.rotation.x = approach(body.current.rotation.x, bodyPitch, k, delta);
        body.current.position.y = approach(body.current.position.y, lift, k, delta);
        if (legL.current) legL.current.rotation.x = approach(legL.current.rotation.x, 0.12, k, delta);
        if (legR.current) legR.current.rotation.x = approach(legR.current.rotation.x, -0.1, k, delta);
      } else if (action === 'interact' && !moving) {
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
        <group ref={marker} scale={1 / 1.55}>
          <TileRing x={0} z={0} color={ISO.accent} opacity={0.85} y={0.02} />
        </group>
      )}

      {/*
        Hover: a light ON them, not a decal near them.

        A point light inside the figure catches every face of a flat-shaded model
        at once, so the whole silhouette lifts out of the scene from any angle —
        which an outline would not, since there is no post-processing pass here
        and a scaled-up shell would clip through the room. It costs one light
        only while the pointer is actually over somebody.
      */}
      {highlight && (
        <pointLight position={[0, 0.9, 0]} color={ISO.accent} intensity={5} distance={3.2} decay={2} />
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
          <div
            className={`iso-nameplate${look.isSelf ? ' is-self' : ''}${highlight ? ' is-hover' : ''}`}
          >
            {name}
          </div>
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
