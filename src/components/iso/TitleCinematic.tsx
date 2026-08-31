'use client';

// The title screen's background: the Deep Forest, live, with the camera on a
// slow rail.
//
// This used to be the whole cinematic — the rail, the zoom curve, the grade and
// the canvas, all written out here for one region. The dashboard then needed the
// same thing for whichever region the player was last standing in, and the honest
// options were to copy two hundred lines or to notice that only the SHOT differs.
//
// So the machinery moved to RegionCinematic and the Deep Forest became a row in
// its table. Everything argued for here is still argued for, in that table and
// around it: the tightened zoom that makes near trees read as foreground rather
// than texture, the start offset that keeps the one live generator in the
// opening frame, the quietened tile grid, and the fill that lifts a region lit
// to be PLAYED into something that survives being composited under a wordmark.
//
// The landing page remains a consumer of DeepForestScene, so a change to the
// region's lighting, props or ground still shows up on the front page — that has
// not changed and is still the thing to know before touching either.

import RegionCinematic from './RegionCinematic';

export default function TitleCinematic() {
  return <RegionCinematic region="deep-forest" />;
}
