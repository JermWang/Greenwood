'use client';

// What a machine does, wherever a machine is shown.
//
// Reads lib/floor-rules, which is the same module the server's layout scorer
// reads, so a figure quoted here is by construction the figure the engine pays.
// Rendered in the desk book, the inspector, the marketplace and the parts list —
// anywhere a player is deciding whether a machine is worth owning or placing.

import { MACHINE_SPECS, isSupport, type MachineKind } from '@/lib/floor-rules';

export default function MachineSpec({
  kind,
  compact = false,
  className = '',
}: {
  kind: MachineKind;
  /** Summary line only — for dense lists like marketplace rows. */
  compact?: boolean;
  className?: string;
}) {
  const spec = MACHINE_SPECS[kind];
  if (!spec) return null;

  return (
    <div className={`machine-spec ${className}`}>
      <div className="machine-spec-head">
        <b>{spec.name}</b>
        <span className={isSupport(kind) ? 'is-support' : 'is-yield'}>{spec.role}</span>
      </div>
      <p>{spec.summary}</p>
      {!compact && (
        <dl>
          {spec.facts.map((fact) => (
            <div key={fact.label}>
              <dt>{fact.label}</dt>
              <dd className={fact.tone === 'good' ? 'is-good' : fact.tone === 'bad' ? 'is-bad' : ''}>
                {fact.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
