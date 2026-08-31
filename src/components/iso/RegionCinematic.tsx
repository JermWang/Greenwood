'use client';

// A region, live, with the camera on a slow rail. The moving background behind
// the dashboard, and behind the title screen's lockup.
//
// WHY THE REAL SCENE AND NOT A VIDEO FILE.
//
// The obvious way to put "footage" behind something is to record some and ship
// an mp4. That loses three things worth more than the GPU it saves: the shot
// goes stale the moment anything in the region changes, it costs several
// megabytes before a first-time visitor sees anything at all, and it is a
// recording of the game rather than the game — which matters most here, because
// the whole point of putting the place you were last standing behind the PLAY
// button is that it is the place you are about to walk back into.
//
// So this mounts the region's own scene component. They are the same components
// the regions render, reading the same maps out of lib/*-map, and nothing about
// the world is decided in this file.
//
// WHY THERE IS NO CAMERA IN HERE.
//
// docs/iso-conventions.md opens with the rule and the reason: a second rig got
// built once and cost three sessions of bugs. A cinematic needs a camera that
// MOVES, which looks like the exception that finally justifies a bespoke one,
// and it is not. `IsoRig` already takes a `followRef` it samples every frame and
// damps toward. Driving that ref is the entire cinematic: the rail below says
// where the camera should WANT to be, and the rig's existing damping turns that
// into a glide. No offset, no second coordinate space, no duplicated panning.

import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { IsoRig } from './IsoScene';
import DeepForestScene from './DeepForestScene';
import GroundsScene from './GroundsScene';
import TreelineScene from './TreelineScene';
import HqScene from './HqScene';
import { ISO_OFFSET } from './palette';
import { renderTier } from './render-tier';
import { regionById, type RegionId } from '@/lib/regions';

/**
 * Nothing has been felled, as far as a background is concerned.
 *
 * Module-level so the identity never changes: the scenes are memoised on this
 * prop, and a fresh `new Set()` per render would rebuild every tree in the
 * region on every frame the parent happens to re-render.
 */
const NOTHING_FELLED: Set<string> = new Set();

interface Shot {
  /** The region's own scene component, rendered exactly as the region renders it. */
  render: () => React.ReactNode;
  /** Where the rail wanders around, in tiles. */
  centre: { x: number; z: number };
  /** How far it wanders on each axis. */
  amp: { x: number; z: number };
  /**
   * Where on the rail a cold load starts.
   *
   * Not 0 by default. At t=0 both cosines peak, which for the Deep Forest puts
   * the camera at its furthest north with the one live generator behind it —
   * the single frame on the whole rail with no subject in it, and the frame
   * every first-time visitor would otherwise get.
   */
  start: number;
  /** Pixels per world unit, against the SHORT edge. See the note on zoom below. */
  zoomPerShortEdge: number;
  zoomMin: number;
  zoomMax: number;
  /** Lift a region that is lit to be PLAYED into something readable as a picture. */
  grade?: boolean;
  /** The region's tile grid, quietened. A background does not need to be walkable. */
  gridStrength?: number;
}

/**
 * The shot for each region.
 *
 * The amplitudes are compositions rather than bounds: each one is shaped to keep
 * that region's subject in frame or just out of it — the last lit generator in
 * the Deep Forest, the buildings on the Grounds, the tower at HQ. Wander further
 * and the background becomes scenery with no subject in it.
 *
 * Two sines per axis at frequencies that do not divide into each other, so the
 * path never closes. A circle would have been fewer numbers and is the wrong
 * shape: this sits behind a screen people leave open, and a loop short enough to
 * be cheap is short enough to be noticed, at which point the world stops feeling
 * continuous.
 */
const SHOTS: Partial<Record<RegionId, Shot>> = {
  'deep-forest': {
    render: () => <DeepForestScene gridStrength={0.1} />,
    centre: { x: 0, z: 0 },
    amp: { x: 5.5, z: 4.8 },
    start: 21,
    zoomPerShortEdge: 1 / 13,
    zoomMin: 24,
    zoomMax: 56,
    grade: true,
  },
  grounds: {
    render: () => <GroundsScene felled={NOTHING_FELLED} />,
    // South of centre, where the settlement is: the Machine Room and the
    // Trading Floor are the two things on the Grounds worth looking at.
    centre: { x: 0, z: 6 },
    amp: { x: 7, z: 5 },
    start: 8,
    zoomPerShortEdge: 1 / 17,
    zoomMin: 20,
    zoomMax: 44,
  },
  treeline: {
    render: () => <TreelineScene felled={NOTHING_FELLED} />,
    centre: { x: 0, z: 0 },
    amp: { x: 6, z: 5 },
    start: 13,
    zoomPerShortEdge: 1 / 16,
    zoomMin: 20,
    zoomMax: 46,
    grade: true,
  },
  'evergreen-hq': {
    render: () => <HqScene />,
    centre: { x: 0, z: 2 },
    amp: { x: 6, z: 4.5 },
    start: 5,
    zoomPerShortEdge: 1 / 16,
    zoomMin: 20,
    zoomMax: 46,
  },
};

/**
 * The shot to use for a region that has none of its own.
 *
 * The Machine Room and the Trading Floor are the two rooms without a standalone
 * scene — they are interactive components that own their board, their catalogue
 * and their prompts, and mounting one as wallpaper would mean mounting the whole
 * room. The Grounds are the honest substitute rather than a filler: both rooms
 * are BUILDINGS ON THE GROUNDS that you walk into, so this is the outside of the
 * place the player is standing in.
 */
const FALLBACK: RegionId = 'grounds';

function shotFor(region: RegionId | null | undefined): Shot {
  return (region && SHOTS[region]) || SHOTS[FALLBACK]!;
}

/** How far the shot breathes, as a fraction of the base zoom, and how slowly. */
const BREATH = 0.045;
const BREATH_RATE = 0.09;

function railAt(shot: Shot, t: number): { x: number; z: number } {
  return {
    x: shot.centre.x + Math.sin(t * 0.055) * shot.amp.x + Math.sin(t * 0.0231) * (shot.amp.x * 0.4),
    z: shot.centre.z + Math.cos(t * 0.041) * shot.amp.z + Math.cos(t * 0.0177) * (shot.amp.z * 0.42),
  };
}

/**
 * The lift that makes a dark region legible as a picture.
 *
 * The Deep Forest and the Treeline are lit to be PLAYED. Their ambient level is
 * deliberately miserable because the tension out there comes from not being able
 * to see, and in the region that is right: you are moving through it, the near
 * field is what matters, and the dark is the antagonist.
 *
 * A background is the opposite situation. Nobody is moving, the whole frame is
 * on screen for as long as they leave it there, and it sits under a scrim with
 * UI over the middle of it. At the region's own levels that composites to a
 * black rectangle — which is not a stylistic choice, it is the region not
 * arriving.
 *
 * So this adds fill and nothing else. No new light direction, no second key, no
 * colour the region does not already use: a cold hemisphere in the moon's own
 * palette, and enough ambient to pull the tree masses off the background. The
 * shapes, the shadows and the sodium are all still the region's. Robin Neon is
 * untouched and stays where the brand rule puts it — on working equipment and
 * the extraction gates, which is precisely what this lift makes visible.
 */
function Grade() {
  return (
    <>
      <hemisphereLight args={['#8fa8ba', '#26301f', 0.32]} />
      <ambientLight intensity={0.12} color="#93a6b5" />
    </>
  );
}

function CameraRail({
  shot,
  aim,
  moving,
}: {
  shot: Shot;
  aim: React.MutableRefObject<{ x: number; z: number } | null>;
  moving: boolean;
}) {
  const { camera, size } = useThree();
  const t = useRef(shot.start);

  /*
   * Zoom is scaled off the SHORT edge, not fixed and not off the width.
   *
   * Fixed was the first attempt and it framed a desktop shot beautifully and a
   * phone one as a close-up of a single generator housing, because the same
   * pixels-per-unit over a third of the width is a third of the world. Width
   * alone overcorrects the other way: a portrait phone would then show thirty
   * units of forest vertically and the trees shrink to scenery again. The short
   * edge is what actually governs how big a tree looks, so it is what this
   * tracks.
   */
  const base = THREE.MathUtils.clamp(
    Math.min(size.width, size.height) * shot.zoomPerShortEdge,
    shot.zoomMin,
    shot.zoomMax
  );

  // The opening frame, set before the first paint: a still — reduced motion, or
  // simply the frame before the rig's first damp — should be the composed shot
  // rather than wherever the rig's mount default left the camera.
  if (aim.current === null) aim.current = railAt(shot, shot.start);

  useFrame((_, delta) => {
    if (moving) t.current += delta;
    aim.current = railAt(shot, t.current);

    // Zoom is written here rather than left to the rig. The rig sets it once on
    // mount and on resize and never touches it again, so there is nothing to
    // fight; owning it outright is simpler than trying to offset a value
    // somebody else writes.
    const cam = camera as THREE.OrthographicCamera;
    const want = base * (1 + Math.sin(t.current * BREATH_RATE) * BREATH);
    if (Math.abs(cam.zoom - want) > 0.0005) {
      cam.zoom = want;
      cam.updateProjectionMatrix();
    }
  });

  return null;
}

/**
 * ISO_OFFSET, not a distance of this file's own choosing.
 *
 * The rig rewrites the camera to target-plus-ISO_OFFSET every frame, so a
 * different starting offset only survives until the first one — but it matters
 * far more than that makes it sound. Under an orthographic camera almost the
 * whole scene sits at the same depth, and that depth is the offset's own length,
 * so exponential fog is applied nearly uniformly and the offset IS the fog dial.
 * An early draft used 55 instead of 26, which took the forest from a third
 * fogged to over four fifths: no near field, no far field, one flat grey-green
 * sheet with tree silhouettes in it.
 */
const CAMERA = { position: ISO_OFFSET, zoom: 52, near: -400, far: 600 } as const;

export default function RegionCinematic({ region }: { region: RegionId | null }) {
  const shot = shotFor(region);
  // The rig clamps panning to the region's own extent. Taken from the region
  // table rather than from each map module, which keeps this file free of four
  // imports for one rectangle — grounds-map.test already asserts the two agree.
  const bounds = useMemo(() => {
    const b = regionById(region ?? FALLBACK)?.bounds ?? regionById(FALLBACK)!.bounds;
    return { minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ };
  }, [region]);

  // Read at mount, not at module scope: there is no window during the server
  // render, and a module constant would hand every client the desktop answer.
  const tier = useMemo(() => renderTier(), []);
  const aim = useRef<{ x: number; z: number } | null>(null);
  const dragRef = useRef({ dragging: false, moved: 0 });

  /**
   * Somebody who has asked the OS for less motion gets the composed frame and no
   * move. Deliberately a still rather than a slower move: "reduce" is a request
   * to stop, and a background that creeps is the exact thing the setting exists
   * to turn off.
   */
  const [moving, setMoving] = useState(true);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setMoving(!query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  return (
    <Canvas
      // Shadows are the one render-tier rule bent here, and only on phones.
      // render-tier keeps them everywhere because they are what tells you the
      // world is a place, which is true of a scene you are reading in order to
      // walk around in it. This one sits behind a scrim and a button, where a
      // phone would pay a whole extra depth pass for contact shadows nobody can
      // pick out. Desktop keeps them.
      shadows={!tier.mobile}
      dpr={tier.worldDpr}
      orthographic
      camera={CAMERA}
      // Pure background. Without this the canvas swallows clicks in every gap
      // around the UI over it, which on a screen this empty is most of it.
      style={{ pointerEvents: 'none' }}
      gl={{
        antialias: tier.antialias,
        powerPreference: 'high-performance',
        toneMapping: THREE.ACESFilmicToneMapping,
        // Lifted from the 1.06 every other scene uses. See Grade — this is the
        // same trade, applied where it is cheapest.
        toneMappingExposure: shot.grade ? 1.5 : 1.15,
      }}
      onCreated={({ gl }) => {
        gl.outputColorSpace = THREE.SRGBColorSpace;
      }}
    >
      {/* interactive={false}: the rig's pan and wheel handlers would otherwise
          bind to a canvas the player is not meant to be able to grab, and a
          background that drags the world around is a bug, not a feature. */}
      <IsoRig
        dragRef={dragRef}
        interactive={false}
        bounds={bounds}
        zoom={CAMERA.zoom}
        followRef={aim}
      />
      <CameraRail shot={shot} aim={aim} moving={moving} />
      {/* Background colour and fog come with the scene — it attaches its own,
          which is why the region and this cannot drift apart on the one setting
          that defines how the place feels. */}
      {shot.render()}
      {shot.grade && <Grade />}
    </Canvas>
  );
}
