'use client';

// ONE canvas for every thumbnail on screen.
//
// The problem this solves is the reason the thumbnails were glyphs to begin
// with, and the glyphs were the wrong answer to it. A crate thumbnail that
// mounts its own <Canvas> is its own WebGL context; seven listings is seven
// contexts, and in the HUD dock that is on top of the context the world is
// already using. Browsers cap those at around sixteen and evict the OLDEST when
// you go over — which here is the region you are standing in.
//
// drei's <View> is the way out: one context, one render loop, and a scissor
// rectangle per tracked element. Ten thumbnails cost ten draw calls instead of
// ten contexts, so the models can be the real ones.
//
// WHERE IT SITS. A shared canvas is a single DOM layer, so it cannot interleave
// with the panels it draws into — it has to be above them. That is fine because
// it is transparent everywhere except inside a tracked box: z-index 30 puts it
// over the dock (26) and the market cards, and under the transaction and leave
// modals (200+), which must cover thumbnails rather than be covered by them.
//
// It is mounted BY the things that use it rather than globally, so a player who
// never opens the market never pays for a canvas.

import { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { View } from '@react-three/drei';
import { ISO_OFFSET } from '@/components/iso/palette';
import { renderTier } from '@/components/iso/render-tier';

/**
 * Pixels per world unit on this canvas.
 *
 * Exported because ListingThumb has to do arithmetic against it. One camera is
 * shared by every View, so a 44px box and a 32px box see DIFFERENT amounts of
 * world at the same zoom — which is why a thumbnail cannot just be handed a
 * model and left to fill the box. See the fit calculation there.
 */
export const THUMB_ZOOM = 74;

export default function ThumbStage() {
  // Read at mount, not at module scope: there is no window during the server
  // render, and a module constant would hand every client the desktop answer.
  const tier = useMemo(() => renderTier(), []);
  return (
    <Canvas
      orthographic
      // Shared by every View: each model is authored at the origin, so one
      // camera frames all of them identically and a thumbnail cannot drift
      // out of frame because somebody moved a mesh.
      camera={{ position: ISO_OFFSET, zoom: THUMB_ZOOM, near: -100, far: 400 }}
      dpr={tier.dpr}
      gl={{ antialias: tier.antialias, alpha: true, powerPreference: 'low-power' }}
      // No shadows. A 34px thumbnail cannot show a contact shadow, and the
      // depth pass would be the most expensive thing on this canvas.
      shadows={false}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 30,
        pointerEvents: 'none',
      }}
    >
      <View.Port />
    </Canvas>
  );
}
