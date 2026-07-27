'use client';

// The map on the wall, and the compass in your hand.
//
// This is the one concession to UI that the no-nav-rail rule makes room for, and
// the distinction is worth keeping straight because it is easy to erode:
//
//   A NAV RAIL does the walking for you. Click a place, be there. That is what
//   turns a world into a set of web pages, and it is banned.
//
//   A MAP tells you where you are and what is next to what. You still walk.
//   Every settlement in the world has one pinned up somewhere, and a player
//   three regions deep with no orientation is not being immersed, they are lost.
//
// So this diagram never teleports. The one action it offers is "Home", and even
// that only tells you which door to head for — it does not open it.
//
// Collapsed to a compass rose by default, matching the Exchange HUD's shape: the
// thing you glance at is always visible, the detail is one click away.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { MapTrifold, X } from '@phosphor-icons/react';
import { MAP_LINKS, HOME, mapNodes, stepHome } from '@/lib/world-map';
import type { RegionId } from '@/lib/regions';
import { api, type RegionView } from '@/lib/api-client';

/** Diagram cell size, in px. Nodes sit on a grid; links are drawn between them. */
const CELL = 62;
const PAD = 34;

export default function WorldMap({
  wallet,
  at,
}: {
  wallet: string | null;
  /** The region the player is standing in. Null on screens that are not places. */
  at: RegionId | null;
}) {
  const [open, setOpen] = useState(false);
  const [verdicts, setVerdicts] = useState<RegionView[]>([]);

  /**
   * Loaded only when the map is opened.
   *
   * A panel nobody has looked at should not be costing a request on every screen
   * that mounts it. Opening is also the only moment the answer can matter.
   */
  useEffect(() => {
    if (!open || !wallet) return;
    let cancelled = false;
    void api
      .regions(wallet)
      .then((r) => { if (!cancelled) setVerdicts(r.regions); })
      .catch(() => { if (!cancelled) setVerdicts([]); });
    return () => { cancelled = true; };
  }, [open, wallet]);

  const nodes = useMemo(() => mapNodes(at, verdicts), [at, verdicts]);

  /** Grid coordinates are signed and centred on the Grounds; shift them into px. */
  const place = useCallback((x: number, y: number) => {
    const xs = nodes.map((n) => n.x);
    const ys = nodes.map((n) => n.y);
    return {
      left: (x - Math.min(...xs)) * CELL + PAD,
      top: (y - Math.min(...ys)) * CELL + PAD,
    };
  }, [nodes]);

  const size = useMemo(() => {
    const xs = nodes.map((n) => n.x);
    const ys = nodes.map((n) => n.y);
    return {
      width: (Math.max(...xs) - Math.min(...xs)) * CELL + PAD * 2,
      height: (Math.max(...ys) - Math.min(...ys)) * CELL + PAD * 2,
    };
  }, [nodes]);

  const next = at ? stepHome(at) : null;
  const homeName = nodes.find((n) => n.id === HOME)?.name ?? 'the Grounds';

  if (!open) {
    return (
      <button className="wm-tab" onClick={() => setOpen(true)} aria-label="Open map">
        {/* A compass rose, not an icon of a menu. N is always up, because the
            camera never rotates — so "north is up" is true here forever, which
            is what makes it worth printing at all. */}
        <span className="wm-rose" aria-hidden>
          <b>N</b>
        </span>
        <MapTrifold size={15} weight="duotone" />
      </button>
    );
  }

  return (
    <aside className="wm-panel">
      <header>
        <span className="wm-kicker">Greenwood</span>
        <button className="wm-close" onClick={() => setOpen(false)} aria-label="Close map">
          <X size={12} weight="bold" />
        </button>
      </header>

      <div className="wm-diagram" style={size}>
        {/* Links first, so nodes draw on top of them. Each is a rotated bar
            between two centres — cheaper and crisper than an SVG path, and it
            keeps the whole panel as plain DOM. */}
        {MAP_LINKS.map(([a, b]) => {
          const from = nodes.find((n) => n.id === a);
          const to = nodes.find((n) => n.id === b);
          if (!from || !to) return null;
          const p = place(from.x, from.y);
          const q = place(to.x, to.y);
          const dx = q.left - p.left;
          const dy = q.top - p.top;
          return (
            <i
              key={`${a}-${b}`}
              className="wm-link"
              style={{
                left: p.left,
                top: p.top,
                width: Math.hypot(dx, dy),
                transform: `rotate(${Math.atan2(dy, dx)}rad)`,
              }}
            />
          );
        })}

        {nodes.map((n) => {
          const p = place(n.x, n.y);
          return (
            <span
              key={n.id}
              className={`wm-node${n.here ? ' is-here' : ''}${n.open ? '' : ' is-locked'}`}
              style={{ left: p.left, top: p.top }}
              title={n.locked ?? n.name}
            >
              <b>{n.name}</b>
              {n.here && <em>you are here</em>}
            </span>
          );
        })}
      </div>

      {/*
        The way home, as a DIRECTION rather than a destination.

        It names the next region on the route and stops there. Making it a link
        would make this a nav rail with a map drawn on it, which is the thing the
        world-navigation rule exists to prevent — and it would also skip the
        walk, which is where everything in this game actually happens.
      */}
      <footer className="wm-home">
        {at === HOME ? (
          <span>You are at {homeName}. Everywhere else is one walk from here.</span>
        ) : next ? (
          <span>
            Home: head for <b>{nodes.find((n) => n.id === next)?.name ?? homeName}</b>.
          </span>
        ) : (
          <span>Every road leads back to {homeName}.</span>
        )}
      </footer>
    </aside>
  );
}
