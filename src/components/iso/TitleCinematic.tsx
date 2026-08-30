'use client';

// The title screen's background: the Deep Forest, live, with the camera on a
// slow rail.
//
// WHY THE REAL SCENE AND NOT A VIDEO FILE.
//
// The obvious way to put "footage" behind a lockup is to record some and ship an
// mp4. That loses three things worth more than the GPU it saves: the shot goes
// stale the moment anything in the forest changes, it costs several megabytes
// before a first-time visitor sees anything at all, and it is a recording of the
// game rather than the game -- which matters here, because the point of putting
// the Deep Forest on the title screen is that a player who reaches it later
// recognises the place they have already been looking at.
//
// So this mounts `DeepForestScene` itself. It is the same component the region
// renders, reading the same map out of lib/deep-forest-map, and nothing about
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
import { ISO_OFFSET } from './palette';
import { renderTier } from './render-tier';
import { EXTENT } from '@/lib/deep-forest-map';

/**
 * How tight the shot is, in pixels per world unit.
 *
 * The region plays at a flat 30, framed for reading terrain -- you need to see a
 * shambler before it sees you. A title screen has the opposite job: the near
 * trees have to be big enough to cross the frame as foreground rather than as
 * texture, because that is what makes a slow move read as depth instead of as
 * drift.
 *
 * Scaled off the SHORT edge, not fixed and not off the width. Fixed was the
 * first attempt and it framed a desktop shot beautifully and a phone one as a
 * close-up of a single generator housing, because the same pixels-per-unit over
 * a third of the width is a third of the world. Width alone overcorrects the
 * other way: a portrait phone would then show thirty units of forest vertically
 * and the trees shrink to scenery again. The short edge is what actually governs
 * how big a tree looks, so it is what this tracks.
 */
const ZOOM_PER_SHORT_EDGE = 1 / 13;
const ZOOM_MIN = 24;
const ZOOM_MAX = 56;

/** The opening camera's zoom. The rail owns it from the first frame onward. */
const ZOOM_INITIAL = 52;

/** How far the shot breathes, as a fraction of the base zoom, and how slowly. */
const BREATH = 0.045;
const BREATH_RATE = 0.09;

/**
 * The rail.
 *
 * Two sines per axis at frequencies that do not divide into each other, so the
 * path never closes. A circle would have been fewer numbers and is the wrong
 * shape here: a title screen is something people leave open while they read the
 * menu, and a loop short enough to be cheap is short enough to be noticed, at
 * which point the world stops feeling continuous.
 *
 * The amplitudes keep the aim inside roughly 13 units of the origin, and that is
 * the whole composition rather than a bound: the one generator still running
 * sits at (0, 0) and is the only neon in the world besides an extraction gate,
 * so the rail is shaped to keep it in frame or just out of it. Wander further
 * and the background becomes trees -- atmosphere with no subject in it.
 */
function railAt(t: number): { x: number; z: number } {
  return {
    x: Math.sin(t * 0.055) * 5.5 + Math.sin(t * 0.0231) * 2.2,
    z: Math.cos(t * 0.041) * 4.8 + Math.cos(t * 0.0177) * 2,
  };
}

/**
 * Where on the rail a cold load starts.
 *
 * Not 0. At t=0 both cosines peak, which puts the camera at its furthest north
 * with the live generator behind it -- the one frame on the whole rail with no
 * subject in it, and the frame every first-time visitor would otherwise get.
 */
const START = 21;

/**
 * The lift that makes the region legible as a picture.
 *
 * The Deep Forest is lit to be PLAYED. Its ambient level is deliberately
 * miserable (see DeepForestScene) because the tension out there comes from not
 * being able to see, and on the region page that is right: you are moving
 * through it, the near field is what matters, and the dark is the antagonist.
 *
 * A title screen is the opposite situation. Nobody is moving, the whole frame is
 * on screen at once for as long as they leave it there, and it sits under a
 * vignette, scanlines at 12%, and a white wordmark that eats the middle third.
 * At the region's own levels that composites to a black rectangle -- which is
 * not a stylistic choice, it is the forest not arriving.
 *
 * So this adds fill and nothing else. No new light direction, no second key, no
 * colour the region does not already use: a cold hemisphere in the moon's own
 * palette, and enough ambient to pull the tree masses off the background. The
 * shapes, the shadows and the sodium are all still the region's. Robin Neon is
 * untouched and stays where the brand rule puts it -- on the one live generator
 * and the extraction gates, which is precisely what this lift makes visible.
 */
function TitleGrade() {
  return (
    <>
      <hemisphereLight args={['#8fa8ba', '#26301f', 0.32]} />
      <ambientLight intensity={0.12} color="#93a6b5" />
    </>
  );
}

function CameraRail({
  aim,
  moving,
}: {
  aim: React.MutableRefObject<{ x: number; z: number } | null>;
  moving: boolean;
}) {
  const { camera, size } = useThree();
  const t = useRef(START);

  const base = THREE.MathUtils.clamp(
    Math.min(size.width, size.height) * ZOOM_PER_SHORT_EDGE,
    ZOOM_MIN,
    ZOOM_MAX
  );

  // The opening frame, set before the first paint: a still -- reduced motion, or
  // simply the frame before the rig's first damp -- should be the composed shot
  // rather than wherever the rig's mount default left the camera.
  if (aim.current === null) aim.current = railAt(START);

  useFrame((_, delta) => {
    if (moving) t.current += delta;
    aim.current = railAt(t.current);

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

/** The map's own bounds, so the rig frames against the real world. */
const BOUNDS = { minX: -EXTENT, maxX: EXTENT, minZ: -EXTENT, maxZ: EXTENT };

/**
 * ISO_OFFSET, not a distance of this file's own choosing.
 *
 * The rig rewrites the camera to target-plus-ISO_OFFSET every frame, so a
 * different starting offset only survives until the first one -- but it matters
 * far more than that makes it sound. Under an orthographic camera almost the
 * whole scene sits at the same depth, and that depth is the offset's own length,
 * so exponential fog is applied nearly uniformly and the offset IS the fog dial.
 * The first draft used 55 instead of 26, which took the forest from a third
 * fogged to over four fifths: no near field, no far field, one flat grey-green
 * sheet with tree silhouettes in it.
 */
const CAMERA = { position: ISO_OFFSET, zoom: ZOOM_INITIAL, near: -400, far: 600 } as const;

export default function TitleCinematic() {
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
      // walk around in it. This one sits behind a wordmark, under a vignette and
      // scanlines, where a phone would pay a whole extra depth pass for contact
      // shadows nobody can pick out. Desktop keeps them.
      shadows={!tier.mobile}
      dpr={tier.worldDpr}
      orthographic
      camera={CAMERA}
      // Pure background. Without this the canvas swallows clicks in every gap
      // between the menu tiles, which on a title screen is most of the screen.
      style={{ pointerEvents: 'none' }}
      gl={{
        antialias: tier.antialias,
        powerPreference: 'high-performance',
        toneMapping: THREE.ACESFilmicToneMapping,
        // Lifted from the 1.06 every other scene uses. See TitleGrade -- this
        // is the same trade, applied where it is cheapest.
        toneMappingExposure: 1.5,
      }}
      onCreated={({ gl }) => {
        gl.outputColorSpace = THREE.SRGBColorSpace;
      }}
    >
      {/* interactive={false}: the rig's pan and wheel handlers would otherwise
          bind to a canvas the player is not meant to be able to grab, and a
          title screen that drags the forest around is a bug, not a feature. */}
      <IsoRig dragRef={dragRef} interactive={false} bounds={BOUNDS} zoom={ZOOM_INITIAL} followRef={aim} />
      <CameraRail aim={aim} moving={moving} />
      {/* Background colour and fog come with the scene -- it attaches its own,
          which is why the region and the title screen cannot drift apart on the
          one setting that defines how this place feels. */}
      <DeepForestScene gridStrength={0.1} />
      <TitleGrade />
    </Canvas>
  );
}
