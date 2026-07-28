'use client';

// The craft bench, as a panel you get by standing at it.
//
// It shows EVERY recipe, including the ones you cannot make, and that is the
// whole point rather than an oversight. A bench that listed only what you can
// afford would hide the ladder from exactly the player who most needs to see
// it — you cannot work toward a recipe you have never been shown. Each locked
// row carries the server's own sentence about why, so the panel never invents
// a reason of its own.

import { useEffect } from 'react';
import { X } from '@phosphor-icons/react';
// The wire type, imported rather than redeclared. The codebase guard caught the
// duplicate the moment it was written -- which is what it is for.
import type { BenchRecipe } from '@/lib/api-client';
export type { BenchRecipe };

/** Log refs read as 'log-blackpine'; the bench should say 'black pine'. */
const woodName = (ref: string) =>
  ref.replace(/^log-/, '').replace('blackpine', 'black pine').replace('ironbark', 'ironbark');

export default function BenchPanel({
  open,
  bench,
  busy,
  note,
  onCraft,
  onClose,
}: {
  open: boolean;
  bench: BenchRecipe[];
  busy: string | null;
  note: string | null;
  onCraft: (recipe: BenchRecipe) => void;
  onClose: () => void;
}) {
  /** Escape closes. A panel you must mouse out of is a modal in disguise. */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="bench-panel" role="dialog" aria-label="Craft bench">
      <header>
        <span>
          <b>Craft Bench</b>
          <em>Timber into tools</em>
        </span>
        <button className="bench-close" onClick={onClose} aria-label="Close">
          <X size={12} weight="bold" />
        </button>
      </header>

      {bench.length === 0 ? (
        <p className="bench-note">Reading the bench…</p>
      ) : (
        <ul className="bench-list">
          {bench.map((r) => (
            <li key={r.id}>
              <button
                className={`bench-row${r.ok ? '' : ' is-locked'}`}
                onClick={() => onCraft(r)}
                disabled={!r.ok || busy != null}
              >
                <span className="bench-tier">T{r.tier}</span>
                <span className="bench-what">
                  <b>
                    {r.name}
                    {r.yields && r.yields > 1 ? ` ×${r.yields}` : ''}
                  </b>
                  {/* The server's sentence when locked, the item's own line when
                      not. Never both, and never a bare disabled row — a control
                      with no reason attached is how a player gives up. */}
                  <small>{r.ok ? r.blurb : r.reason}</small>
                </span>
                <span className="bench-cost">
                  {busy === r.id ? (
                    '…'
                  ) : (
                    <>
                      {r.logs}
                      <i>
                        {r.plan.length
                          ? ` ${woodName(r.plan[0].ref)}`
                          : ' logs'}
                      </i>
                    </>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {note && <p className="bench-note">{note}</p>}
    </div>
  );
}
