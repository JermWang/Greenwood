'use client';

// Opening an allocation at the desk it goes into.
//
// The second verb out of the dashboard and into the world, and it moved for a
// sharper reason than building did. Opening a crate has ALWAYS taken a target
// desk — `openCrate(wallet, crateId, targetNodeId)` — and on the dashboard that
// argument was filled in from whichever row you happened to have selected in a
// list, which is to say usually from nothing. So the single most consequential
// choice in the loot loop, which desk gets the instrument, was made by accident.
//
// Standing at a desk answers it. The prompt names the desk it is about, the
// instrument lands there, and there is no target to get wrong.
//
// Anchored to the board rather than modal over it, matching BuildPrompt: the
// desk is half the decision and covering it up would hide the half you walked
// over here for.

import { useEffect, useState } from 'react';
import { X } from '@phosphor-icons/react';
import { api, type UserOperation } from '@/lib/api-client';
import { COMPONENT_RARITIES, rarityHex, type Rarity } from '@/lib/rarity';

type Allocation = UserOperation['crates'][number];

export default function AllocationPrompt({
  open,
  wallet,
  deskLabel,
  allocations,
  cost,
  balance,
  busy,
  error,
  onOpen,
  onClose,
}: {
  open: boolean;
  wallet: string | null;
  /** The desk this will fit the instrument to, named so the target is explicit. */
  deskLabel: string;
  allocations: Allocation[];
  /** GREEN charged to open one. */
  cost: number;
  balance: number;
  busy: boolean;
  error: string | null;
  onOpen: (allocation: Allocation) => void;
  onClose: () => void;
}) {
  const [odds, setOdds] = useState<Awaited<ReturnType<typeof api.crateOdds>> | null>(null);

  /**
   * The odds, re-read each time the prompt opens.
   *
   * Bad-luck protection is a running streak, so a cached copy would show a
   * pity counter that stopped moving after the first open of the session — the
   * one number here whose whole purpose is to change.
   */
  useEffect(() => {
    if (!open || !wallet) return;
    let live = true;
    void api
      .crateOdds(wallet)
      .then((result) => {
        if (live) setOdds(result);
      })
      .catch(() => {
        /* The list still opens; only the odds strip is missing. */
      });
    return () => {
      live = false;
    };
  }, [open, wallet]);

  /** Escape closes, the same as every other prompt on this board. */
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const affordable = balance >= cost;

  return (
    <div className="build-prompt is-allocations" role="dialog" aria-label="Open an allocation">
      <header>
        <span>
          <b>Open an allocation</b>
          <em>into {deskLabel}</em>
        </span>
        <button className="build-close" onClick={onClose} aria-label="Cancel">
          <X size={12} weight="bold" />
        </button>
      </header>

      {odds && (
        <div className="alloc-odds">
          {odds.odds.map(({ rarity, chance }) => (
            <span key={rarity} style={{ color: rarityHex(rarity as Rarity) }}>
              <b>{COMPONENT_RARITIES[rarity as Rarity].label.slice(0, 3)}</b>
              <i>{(chance * 100).toFixed(chance < 0.01 ? 1 : 0)}%</i>
            </span>
          ))}
        </div>
      )}

      {allocations.length === 0 ? (
        // Allocations are FOUND, not bought — this says what to do about an
        // empty inventory rather than offering a purchase that does not exist.
        <p className="build-empty">
          Nothing sealed. Your desks turn allocations up while they run, and busier
          floors find them more often.
        </p>
      ) : (
        <div className="build-options">
          {allocations.map((allocation) => (
            <button
              key={allocation.id}
              className={`build-option${affordable ? '' : ' is-poor'}`}
              onClick={() => onOpen(allocation)}
              disabled={busy || !affordable}
            >
              <b>
                {allocation.crateType === 'equity_allocation'
                  ? 'Equity Allocation'
                  : 'Treasury Allocation'}
              </b>
              <span>Recovered {new Date(allocation.foundAt).toLocaleDateString()}</span>
              <em>{Math.round(cost).toLocaleString()} GREEN</em>
            </button>
          ))}
        </div>
      )}

      {odds && (
        <p className="alloc-pity">
          Bad-luck protection: Legendary+ within {odds.guarantees.legendaryPlus} · Mythic+ within{' '}
          {odds.guarantees.mythicPlus} · Divine within {odds.guarantees.divine}.
          {odds.pity && <> {odds.pity.sinceLegendaryPlus} since Legendary+.</>}
        </p>
      )}

      {error && <p className="build-error">{error}</p>}
      {!error && allocations.length > 0 && !affordable && (
        <p className="build-error">
          Opening one costs {Math.round(cost).toLocaleString()} GREEN and you have{' '}
          {Math.floor(balance).toLocaleString()} — route some yield first.
        </p>
      )}
      {busy && <p className="build-empty">Opening…</p>}
    </div>
  );
}
