'use client';

// A location name, floating over the thing it names.
//
// A plain billboard: <Html> with no transform, so it is a DOM node pinned to a
// projected point and rendered at fixed CSS pixel size. It always faces the
// viewer and never changes size, which means it stays readable at every zoom.
//
// The alternative — <Html transform>, angled into the isometric plane so a sign
// looks bolted to its structure — was tried and reverted. It looks better
// standing still and worse in every other way: a plane has a front and a back,
// so gates facing away from the camera got signs facing away too, and a
// world-space label shrinks to nothing as you zoom out. Readability wins for
// anything carrying words. Grid alignment still governs the WORLD — props,
// markers, geometry — but a label is UI that happens to be positioned in 3D.

import { Html } from '@react-three/drei';

export default function PlaceLabel({
  children,
  position,
  className = 'iso-place-tag',
}: {
  children: React.ReactNode;
  /** World position of the label's anchor. */
  position: [number, number, number];
  className?: string;
}) {
  return (
    <Html
      position={position}
      center
      // Signage is scenery: it must never eat a click meant for the tile below.
      pointerEvents="none"
      zIndexRange={[8, 0]}
    >
      <div className={className}>{children}</div>
    </Html>
  );
}
