'use client';

// An idle player for the title-screen board: walks a fixed loop in front of the
// desks and stops now and then to work, so the background reads as a living
// floor rather than a still render.
//
// It drives the same Character the game uses, through the same path/onStep
// contract peers and the local player use — nothing here is a bespoke title-only
// animation system. The loop is a short list of stations; the actor walks to
// each, and at the ones marked `work` it stands and plays the build swing for a
// beat before moving on.
//
// Purely ambient: no pointer handlers, no state that anything else reads. It
// lives inside IsoScene's children slot, so it renders in the same Canvas as the
// board without the title page knowing anything about three.js.

import { useCallback, useMemo, useRef, useState } from 'react';
import Character, { lookFor, type CharacterAction } from './Character';
import type { Cell } from './pathing';

interface Station extends Cell {
  /** Stand and play the build animation here before moving on. */
  work?: boolean;
}

/*
 * The loop, laid out in front of the desks.
 *
 * The showroom desks sit in a row at z = -2. The actor roams the clear ground
 * at z >= 0 so it never stands on a desk, and every `work` station is entered by
 * walking in the -z direction — Character takes its facing from travel, so
 * arriving from directly behind leaves the actor looking AT the desk it is
 * pretending to build, which is the whole point of the shot.
 */
const STATIONS: Station[] = [
  { x: -3, z: 2 },
  { x: -3, z: 0, work: true },
  { x: 0, z: 2 },
  { x: 3, z: 2 },
  { x: 3, z: 0, work: true },
  { x: 0, z: 3 },
];

/** How long the actor dwells at a work station, in ms. */
const WORK_MS = 2400;
/** A short pause at a stroll station, so motion is not perfectly relentless. */
const STROLL_MS = 500;

export default function ShowroomActor() {
  const [index, setIndex] = useState(0);
  const [action, setAction] = useState<CharacterAction>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A stable, pleasant look. A fixed pseudo-wallet so lookFor is deterministic —
  // the title screen should look the same every visit — and a high tier so the
  // cap wears the brand.
  const look = useMemo(() => lookFor({ wallet: '0x6greenwoodshowroomactor0001', tier: 8 }), []);

  // One-element paths, memoised on the index so the array identity only changes
  // when the station does. An inline `[STATIONS[index]]` would be a new array
  // every frame, which resets Character's leg counter and re-fires onStep
  // forever — the bug that makes a walker twitch in place.
  const path = useMemo(() => [STATIONS[index]], [index]);
  const target = STATIONS[index];

  const advance = useCallback(() => {
    setAction('idle');
    setIndex((i) => (i + 1) % STATIONS.length);
  }, []);

  /**
   * Fires when the actor reaches the current station. Work stations pause and
   * play the swing; stroll stations pause briefly and move on. Either way the
   * next station is set by a timer, so the loop is self-perpetuating without a
   * render-loop tick of its own.
   */
  const onStep = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    const station = STATIONS[index];
    if (station.work) {
      setAction('chop');
      timer.current = setTimeout(advance, WORK_MS);
    } else {
      timer.current = setTimeout(advance, STROLL_MS);
    }
  }, [index, advance]);

  return (
    <Character
      look={look}
      spawn={STATIONS[0]}
      target={target}
      path={path}
      onStep={onStep}
      action={action}
      name="Greenwood"
    />
  );
}
