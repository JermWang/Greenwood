'use client';

// The run HUD: health, what is in your hands, and what is on your back.
//
// Everything here answers a question you ask WHILE moving — am I hurt, what am I
// holding, can I still pick this up. That is the bar for being on screen at all
// times; anything you only ask between runs belongs somewhere you walk to.
//
// The bag is collapsed by default and opens in place. A grid of fifty slots
// permanently covering a third of the screen is not an inventory, it is a wall,
// and in a zone where the thing that kills you is usually off-screen it is an
// actively dangerous one.

import { useCallback, useEffect, useState } from 'react';
import { Backpack, CaretDown, Heart } from '@phosphor-icons/react';
import type { PackState } from '@/lib/api-client';

/** Number keys 1-5 map to these. Five is what a hand can reach without looking. */
export const QUICK_SLOTS = 5;

/**
 * A carried stack, condensed for display.
 *
 * `ref` is a raw key like `generator-core`; the HUD is the wrong place to invent
 * display names, so it title-cases and leaves a proper item table for when items
 * actually have one.
 */
function label(ref: string): string {
  return ref.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export interface ExpeditionHudProps {
  health: number;
  maxHealth: number;
  pack: PackState;
}

export default function ExpeditionHud({ health, maxHealth, pack }: ExpeditionHudProps) {
  const [open, setOpen] = useState(false);
  const [equipped, setEquipped] = useState(0);

  const contents = pack.contents ?? [];
  const quick = contents.slice(0, QUICK_SLOTS);

  /**
   * Number keys select a quick slot.
   *
   * Ignored while a text field has focus, or typing "1" into the Exchange search
   * would also swap your weapon. Bound on window rather than on the HUD because
   * the player's hands are on the world, not on this panel — a shortcut that
   * needs the panel focused is a shortcut nobody uses.
   */
  const onKey = useCallback((e: KeyboardEvent) => {
    const el = document.activeElement;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || (el as HTMLElement).isContentEditable)) return;
    const n = Number(e.key);
    if (!Number.isInteger(n) || n < 1 || n > QUICK_SLOTS) return;
    e.preventDefault();
    setEquipped(n - 1);
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onKey]);

  const pct = maxHealth > 0 ? Math.max(0, Math.min(1, health / maxHealth)) : 0;
  const held = quick[equipped];

  return (
    <div className="xhud">
      {/* Health. Colour shifts with the value rather than staying brand-green:
          a bar you have to read the length of is a bar you read too late. */}
      <div className="xhud-health" role="meter" aria-valuenow={health} aria-valuemax={maxHealth}>
        <Heart size={14} weight="fill" />
        <div className="xhud-bar">
          <i
            style={{
              width: `${pct * 100}%`,
              background: pct > 0.5 ? '#8fe36a' : pct > 0.25 ? '#e3c34a' : '#e35a4a',
            }}
          />
        </div>
        <b>{health}</b>
      </div>

      {/* Quick slots. Always five, filled or not — a row that changes length as
          you pick things up means muscle memory never forms, and the whole point
          of a number shortcut is not having to look. */}
      <div className="xhud-slots">
        {Array.from({ length: QUICK_SLOTS }, (_, i) => {
          const item = quick[i];
          return (
            <button
              key={i}
              className={`xhud-slot ${i === equipped ? 'is-on' : ''} ${item ? '' : 'is-empty'}`}
              onClick={() => setEquipped(i)}
              title={item ? label(item.ref) : 'Empty'}
            >
              <span>{i + 1}</span>
              {item && <em>{item.quantity}</em>}
            </button>
          );
        })}
      </div>

      <div className="xhud-held">
        <small>Holding</small>
        <b>{held ? label(held.ref) : 'Nothing'}</b>
      </div>

      <button className={`xhud-bag ${open ? 'is-open' : ''}`} onClick={() => setOpen((v) => !v)}>
        <Backpack size={15} weight="duotone" />
        <span>{pack.name ?? 'No pack'}</span>
        {/* Used against capacity, always. "How full am I" is the question that
            decides whether you turn back, and it should never need a tap. */}
        <b className={pack.free === 0 ? 'is-full' : ''}>
          {pack.used}/{pack.slots}
        </b>
        <CaretDown size={12} weight="bold" />
      </button>

      {open && (
        <div className="xhud-bag-open">
          {contents.length === 0 && <p>Empty. Everything you find goes in here.</p>}
          <ul>
            {contents.map((c) => (
              <li key={`${c.kind}:${c.ref}`}>
                <span>{label(c.ref)}</span>
                <b>{c.quantity}</b>
              </li>
            ))}
          </ul>
          {pack.free === 0 && <p className="xhud-full">Full — you cannot pick anything else up.</p>}
        </div>
      )}
    </div>
  );
}
