'use client';

// The lift, as a panel of buttons.
//
// This is the one place in Greenwood where choosing a destination from a LIST is
// the right interaction rather than a violation of the no-nav-rail rule, and the
// distinction is worth being precise about because it is the exact thing that
// rule exists to stop.
//
// A nav rail lets you skip the world. A lift IS part of the world: you walked
// into a tower, you are standing in front of its lifts, and a panel of floor
// buttons is what is physically there. The list is not a shortcut around the
// walk — it is the thing the walk led to. Every other rule still holds: you had
// to get to the building, the gate still refuses floors you have not earned, and
// the ride ends in the same enterRegion call a doorway would.
//
// The tell that this is honest: it is unreachable from anywhere except standing
// at the lifts. A menu you can only open by being somewhere is a place, not a
// menu.

import { useCallback, useEffect, useState } from 'react';
import { CaretUp, X } from '@phosphor-icons/react';
import { directory, floorOf, type Floor } from '@/lib/hq-floors';
import type { RegionView } from '@/lib/api-client';

export default function LiftPanel({
  open,
  /** The region the player is in, so the current floor is marked rather than offered. */
  at,
  /** Gate verdicts, so a floor you cannot reach says why instead of going quiet. */
  regions,
  busy,
  error,
  onRide,
  onClose,
}: {
  open: boolean;
  at: string | null;
  regions: RegionView[];
  busy: boolean;
  error: string | null;
  onRide: (floor: Floor) => void;
  onClose: () => void;
}) {
  const [floors] = useState(() => directory());
  const here = floorOf(at);

  /** Escape closes. A panel you must mouse out of is a modal in disguise. */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const verdictFor = useCallback(
    (floor: Floor) => regions.find((r) => r.id === floor.region) ?? null,
    [regions]
  );

  if (!open) return null;

  return (
    <div className="lift-panel" role="dialog" aria-label="Floor directory">
      <header>
        <span>
          <b>Greenwood HQ</b>
          <em>Floor directory</em>
        </span>
        <button className="lift-close" onClick={onClose} aria-label="Close">
          <X size={12} weight="bold" />
        </button>
      </header>

      {/*
        Top floor first, ground last — the way a lift panel is actually laid out
        and the opposite of the array order. `directory()` returns them climbing;
        reversing here keeps the DATA in the honest order and the PICTURE in the
        familiar one.
      */}
      <ul className="lift-floors">
        {[...floors].reverse().map((floor) => {
          const verdict = verdictFor(floor);
          const locked = verdict != null && !verdict.allowed;
          const current = here?.region === floor.region;
          return (
            <li key={floor.region}>
              <button
                className={`lift-floor${current ? ' is-here' : ''}${locked ? ' is-locked' : ''}`}
                onClick={() => onRide(floor)}
                disabled={busy || current || locked}
              >
                <span className="lift-level">{floor.level}</span>
                <span className="lift-name">
                  <b>{floor.name}</b>
                  {/* The gate's own sentence when shut, the floor's own line
                      when open. Never both, and never a bare disabled button —
                      a control with no reason attached is the most common way an
                      idle game loses somebody. */}
                  <small>{locked ? verdict!.reason : floor.blurb}</small>
                </span>
                {current ? <em className="lift-mark">Here</em> : <CaretUp size={13} weight="bold" />}
              </button>
            </li>
          );
        })}
      </ul>

      {error && <p className="lift-error">{error}</p>}
      {busy && <p className="lift-note">Riding…</p>}
    </div>
  );
}
