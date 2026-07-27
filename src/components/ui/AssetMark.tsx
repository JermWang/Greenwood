'use client';

// A real piece of the game, sitting in the page chrome.
//
// WHY NOT A GLB.
//
// There are none, and that is the art direction rather than an omission: every
// model in Greenwood is procedural three.js — flat-shaded boxes, cones and
// cylinders assembled in components under components/iso. Exporting them to GLB
// to put one on a page would add a build step, a binary in the repo, and a
// second copy of every desk that goes stale the first time somebody adjusts the
// real one. Mounting the actual component is strictly better: it is the same
// desk, from the same file, lit by the same rig, and it cannot drift.
//
// WHAT IT REPLACES.
//
// An animated bar chart pretending to be a market tape, which itself replaced a
// rotating radar sweep. Both were abstract motion standing in for a brand — CSS
// that could belong to any product with a green accent. A page header carrying
// an actual Treasury Desk is doing the same decorative job while also being the
// only thing on screen that could not possibly belong to another game.
//
// Deliberately still. It rotates only on the title screen; in page chrome it
// holds a fixed three-quarter angle, because a spinning object next to a heading
// pulls the eye off the heading — which is the failure the tape had.

import { memo, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import Desk from '@/components/iso/DeskModels';
import { ISO, ISO_OFFSET, type MachineKind } from '@/components/iso/palette';

/** Module-level: an inline literal makes R3F re-apply the camera every render. */
const CAMERA = { position: ISO_OFFSET, zoom: 74, near: -100, far: 200 } as const;

export default memo(function AssetMark({
  kind = 'rack',
  className = 'gpu-page-mark',
}: {
  kind?: MachineKind;
  className?: string;
}) {
  return (
    <div className={className} aria-hidden>
      <Canvas
        orthographic
        camera={CAMERA}
        dpr={[1, 1.75]}
        // No shadow map: one prop on a transparent background has nothing to
        // cast onto, and the map is the expensive half of a small canvas.
        gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
      >
        {/*
          The room's lighting, trimmed to one object.

          Same warm key, cool bounce and neutral fill the world uses — a desk lit
          differently here would read as a render of the game rather than as a
          piece of it, which is the exact opposite of the point.
        */}
        <ambientLight color="#ffffff" intensity={0.62} />
        <hemisphereLight color="#cfe0ee" groundColor="#6d6154" intensity={0.9} />
        <directionalLight color="#fff4e2" intensity={1.9} position={[16, 24, 10]} />
        <directionalLight color="#9fbcd6" intensity={0.5} position={[-14, 9, -12]} />
        <Suspense fallback={null}>
          <group position={[0, -0.6, 0]}>
            {/* Brand colour on the accent, because this one IS branding — the
                use Robin Neon is unambiguously for. `selected` is what lights
                the emissive trim on a desk model. */}
            <Desk kind={kind} accent={ISO.accent} selected />
          </group>
        </Suspense>
      </Canvas>
    </div>
  );
});
