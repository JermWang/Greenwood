'use client';

// A conversation with somebody who works here.
//
// The panel opens on the line they most want to tell you — see greetingFor —
// and lets you page through the rest. What it does NOT do is present the whole
// list at once, and that is a content decision rather than a layout one: read as
// a list, the tips and the hints sit at the same weight and the player scans
// them all in four seconds. One line at a time, each with a face and a name
// attached, is how somebody telling you something reads.
//
// Nothing here is marked as a hint. The kinds exist in the data so the ordering
// can put useful things first, but the player never sees a label — the moment a
// line is badged "LORE" it stops being a person mentioning their lighting budget
// and becomes the game pointing at its own secret.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CaretLeft, CaretRight, X } from '@phosphor-icons/react';
import { greetingFor, linesFor, type Npc } from '@/lib/npcs';

export default function NpcDialogue({
  npc,
  totalLevel,
  onClose,
  action,
}: {
  npc: Npc | null;
  /** Gates which lines exist. The world gets stranger as you get further in. */
  totalLevel: number;
  onClose: () => void;
  /**
   * A thing this person will sell or do, rendered under the line.
   *
   * A slot rather than a shop system, because the alternative is a screen. The
   * whole no-nav-rail rule exists so that buying the thing somebody just told
   * you about happens WHERE they told you — walking to a menu to act on a
   * conversation is the exact break the rule is guarding.
   */
  action?: React.ReactNode;
}) {
  const lines = useMemo(() => (npc ? linesFor(npc, totalLevel) : []), [npc, totalLevel]);

  /** Opens on the greeting rather than at index zero. */
  const opening = useMemo(() => {
    if (!npc) return 0;
    const greeting = greetingFor(npc, totalLevel);
    const at = greeting ? lines.indexOf(greeting) : 0;
    return at < 0 ? 0 : at;
  }, [npc, totalLevel, lines]);

  const [index, setIndex] = useState(opening);
  useEffect(() => setIndex(opening), [opening, npc?.id]);

  /** Escape closes, arrows page. A dialogue you must mouse out of is a menu. */
  const onKey = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowRight') setIndex((i) => Math.min(lines.length - 1, i + 1));
      if (event.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1));
    },
    [onClose, lines.length]
  );

  useEffect(() => {
    if (!npc) return;
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [npc, onKey]);

  if (!npc) return null;
  const line = lines[index];

  return (
    <div className="npc-panel" role="dialog" aria-label={`Talking to ${npc.name}`}>
      <header>
        <span className="npc-avatar" style={{ background: npc.outfit }} aria-hidden>
          <i style={{ background: npc.cap }} />
        </span>
        <span className="npc-who">
          <b>{npc.name}</b>
          <em>{npc.role}</em>
        </span>
        <button className="npc-close" onClick={onClose} aria-label="End conversation">
          <X size={12} weight="bold" />
        </button>
      </header>

      <p className="npc-line">{line ? line.text : 'They nod at you and carry on working.'}</p>

      {/* What they will sell you, if anything. Sits between the line and the
          pager so it reads as part of the conversation rather than as chrome. */}
      {action && <div className="npc-action">{action}</div>}

      <footer>
        {/* Dots rather than "3 of 7": the count is not information a player
            needs, and a progress number turns a conversation into a checklist. */}
        <span className="npc-dots" aria-hidden>
          {lines.map((l, i) => (
            <i key={i} className={i === index ? 'is-on' : undefined} />
          ))}
        </span>
        <span className="npc-nav">
          <button onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0} aria-label="Previous">
            <CaretLeft size={13} weight="bold" />
          </button>
          <button
            onClick={() => setIndex((i) => Math.min(lines.length - 1, i + 1))}
            disabled={index >= lines.length - 1}
            aria-label="Next"
          >
            <CaretRight size={13} weight="bold" />
          </button>
        </span>
      </footer>
    </div>
  );
}
