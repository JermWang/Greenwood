'use client';

// Building a desk where you are standing.
//
// This is the first verb moved out of the dashboard and into the world, and it
// is the one that mattered most: opening a desk is the first and most important
// thing anybody does in Greenwood, and it was a card on a summary screen that
// opened a modal. The Machine Room already exists, already holds your desks, and
// is already where you go to arrange them — so it is where one should be built.
//
// The interaction is: click bare floor, choose, confirm. The desk appears ON THE
// TILE YOU CLICKED, which is the part the dashboard could never do — there, a
// new desk went into a list and you went to the floor afterwards to find out
// where it had landed.
//
// It is a prompt anchored to the board rather than a modal over it. A modal
// would cover the room you are choosing a spot in, and the spot is half the
// decision.

import { useEffect, useMemo, useState } from 'react';
import { X } from '@phosphor-icons/react';
import { api } from '@/lib/api-client';

export interface DeskFamily {
  key: string;
  name: string;
  description: string;
  family: 'oil' | 'mine';
  burnCostOsr: number;
}

/**
 * The catalogue request, made at most once.
 *
 * Held as the PROMISE rather than the result, so two prompts opening in the
 * same tick share one request instead of racing. Cleared on failure so a
 * transient error is retryable — a permanently-cached rejection would leave the
 * build prompt broken for the rest of the session.
 */
let familiesOnce: Promise<DeskFamily[]> | null = null;
function loadFamilies(): Promise<DeskFamily[]> {
  if (!familiesOnce) {
    familiesOnce = api.families().catch((e) => {
      familiesOnce = null;
      throw e;
    });
  }
  return familiesOnce.catch(() => []);
}

export default function BuildPrompt({
  cell,
  balance,
  busy,
  error,
  onBuild,
  onClose,
}: {
  /** The tile that was clicked. Null closes the prompt. */
  cell: { x: number; z: number } | null;
  /** Spendable BNTY, so a desk you cannot afford says so before you press it. */
  balance: number;
  busy: boolean;
  error: string | null;
  onBuild: (family: DeskFamily) => void;
  onClose: () => void;
}) {
  const [families, setFamilies] = useState<DeskFamily[]>([]);

  /**
   * Loaded once per session, then shared.
   *
   * The catalogue is the server's, not a copy: cost and family come from the
   * same payload the mint route charges against, so what this quotes and what
   * the engine takes cannot disagree.
   *
   * Cached at module level rather than fetched per-open, and that is a fix
   * rather than an optimisation. The per-open version used the usual
   * `cancelled` flag, and React's development double-mount runs the effect,
   * tears it down and runs it again — so the response that arrived belonged to
   * an effect whose flag was already set, the result was thrown away, and the
   * prompt sat on "Reading the catalogue…" forever with a 200 in the network
   * panel. A promise shared across mounts cannot be cancelled by one of them.
   */
  useEffect(() => {
    if (!cell) return;
    let live = true;
    void loadFamilies().then((list) => { if (live) setFamilies(list); });
    return () => { live = false; };
  }, [cell]);

  /** Escape closes. A prompt you have to mouse out of is a modal in disguise. */
  useEffect(() => {
    if (!cell) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cell, onClose]);

  const cheapest = useMemo(
    () => (families.length ? Math.min(...families.map((f) => f.burnCostOsr)) : 0),
    [families]
  );

  if (!cell) return null;

  return (
    <div className="build-prompt" role="dialog" aria-label="Build a desk">
      <header>
        <span>
          <b>Build here</b>
          {/* The coordinates are the point of doing this in the room rather than
              on a dashboard: you chose the spot, so it should say which. */}
          <em>
            {cell.x}, {cell.z}
          </em>
        </span>
        <button className="build-close" onClick={onClose} aria-label="Cancel">
          <X size={12} weight="bold" />
        </button>
      </header>

      {families.length === 0 ? (
        <p className="build-empty">Reading the catalogue…</p>
      ) : (
        <div className="build-options">
          {families.map((f) => {
            const affordable = balance >= f.burnCostOsr;
            return (
              <button
                key={f.key}
                className={`build-option${affordable ? '' : ' is-poor'}`}
                onClick={() => onBuild(f)}
                disabled={busy || !affordable}
              >
                <b>{f.name}</b>
                <span>{f.description}</span>
                <em>{f.burnCostOsr.toLocaleString()} BNTY</em>
              </button>
            );
          })}
        </div>
      )}

      {error && <p className="build-error">{error}</p>}
      {!error && families.length > 0 && balance < cheapest && (
        // Says WHY rather than only greying the buttons out. A disabled control
        // with no reason attached is the most common way an idle game loses
        // somebody in their first ten minutes.
        <p className="build-error">
          You have {Math.floor(balance).toLocaleString()} BNTY. The cheapest desk is{' '}
          {cheapest.toLocaleString()} — route some yield first.
        </p>
      )}
      {busy && <p className="build-empty">Building…</p>}
    </div>
  );
}
