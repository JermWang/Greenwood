'use client';

// The map on the wall.
//
// This is the one concession to UI that the no-nav-rail rule makes room for, and
// the distinction is worth keeping straight because it is easy to erode:
//
//   A NAV RAIL does the walking for you. Click a place, be there. That is what
//   turns a world into a set of web pages, and it is banned.
//
//   A MAP tells you where you are and what is next to what. You still walk.
//   Every settlement has one pinned up somewhere, and a player three regions
//   deep with no orientation is not being immersed, they are lost.
//
// SO IT HAS TO BE A PICTURE, not a list.
//
// The first pass was a row of labelled boxes joined by lines, which is a
// SITEMAP. It technically encoded the topology and told you nothing you could
// read at a glance — you had to stop and parse five names to answer "where am
// I", which is exactly the question a map exists to answer instantly. Every
// region here is tinted the colour that place actually is, textured with what
// grows there, and the one you are standing in is the one with a light on it.
// You should be able to use this without reading a word.
//
// Drawn as SVG rather than DOM boxes: the roads, the textures, the danger pips
// and the pulsing marker are all shapes, and shapes in markup beat a dozen
// absolutely-positioned divs pretending to be shapes.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { MAP_LINKS, HOME, mapNodes, stepHome } from '@/lib/world-map';
import { REGIONS, type RegionId } from '@/lib/regions';
import { api, type RegionView } from '@/lib/api-client';

/** Grid pitch and node size, in SVG units. */
const CELL_X = 84;
const CELL_Y = 70;
const NODE_W = 62;
const NODE_H = 44;
const PAD = 40;

export default function WorldMap({
  wallet,
  at,
  position,
}: {
  wallet: string | null;
  /** The region the player is standing in. Null on screens that are not places. */
  at: RegionId | null;
  /**
   * The player's tile, so the marker sits where they actually are inside the
   * region rather than at its centre. Optional — a region with no live position
   * still gets a marker, just a centred one.
   */
  position?: { x: number; z: number } | null;
}) {
  const [open, setOpen] = useState(false);
  const [verdicts, setVerdicts] = useState<RegionView[]>([]);

  /**
   * Loaded only when the map is opened.
   *
   * A panel nobody has looked at should not cost a request on every screen that
   * mounts it, and opening is the only moment the answer can matter.
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

  const origin = useMemo(() => ({
    x: Math.min(...nodes.map((n) => n.x)),
    y: Math.min(...nodes.map((n) => n.y)),
  }), [nodes]);

  const place = useCallback(
    (x: number, y: number) => ({
      cx: (x - origin.x) * CELL_X + PAD,
      cy: (y - origin.y) * CELL_Y + PAD,
    }),
    [origin]
  );

  const view = useMemo(() => ({
    w: (Math.max(...nodes.map((n) => n.x)) - origin.x) * CELL_X + PAD * 2,
    h: (Math.max(...nodes.map((n) => n.y)) - origin.y) * CELL_Y + PAD * 2,
  }), [nodes, origin]);

  /**
   * Where inside its region rectangle to put the marker.
   *
   * The region's own tile bounds map onto the little rectangle, so walking north
   * in the Grounds visibly moves the dot north on the map. It is a small thing
   * and it is the difference between a diagram of the world and a picture of
   * where you are in it.
   */
  const marker = useMemo(() => {
    const node = nodes.find((n) => n.here);
    if (!node) return null;
    const { cx, cy } = place(node.x, node.y);
    const region = REGIONS.find((r) => r.id === node.id);
    if (!position || !region) return { cx, cy };
    const b = region.bounds;
    const fx = (position.x - b.minX) / Math.max(1, b.maxX - b.minX);
    const fz = (position.z - b.minZ) / Math.max(1, b.maxZ - b.minZ);
    // Inset so the marker never sits on the border and read as being outside.
    const clamp = (v: number) => Math.min(0.88, Math.max(0.12, v));
    return {
      cx: cx + (clamp(fx) - 0.5) * NODE_W,
      cy: cy + (clamp(fz) - 0.5) * NODE_H,
    };
  }, [nodes, position, place]);

  const next = at ? stepHome(at) : null;
  const homeName = nodes.find((n) => n.id === HOME)?.name ?? 'the Grounds';

  if (!open) {
    return (
      <button className="wm-tab" onClick={() => setOpen(true)} aria-label="Open map">
        {/* A compass rose. North is always up because the isometric camera never
            rotates, so this is true forever rather than true right now — which
            is the only reason a fixed compass is worth printing at all. */}
        <svg viewBox="0 0 40 40" aria-hidden>
          <circle className="wm-rose-ring" cx="20" cy="20" r="17" />
          {[0, 90, 180, 270].map((a) => (
            <line
              key={a}
              className={a === 0 ? 'wm-rose-n' : 'wm-rose-tick'}
              x1="20" y1="20" x2="20" y2={a === 0 ? '6' : '9'}
              transform={`rotate(${a} 20 20)`}
            />
          ))}
          <polygon className="wm-rose-needle" points="20,7 24,21 20,18 16,21" />
          <circle className="wm-rose-hub" cx="20" cy="20" r="2.4" />
        </svg>
        <span>MAP</span>
      </button>
    );
  }

  return (
    <aside className="wm-panel">
      <header>
        <span className="wm-kicker">Greenwood</span>
        <button className="wm-close" onClick={() => setOpen(false)} aria-label="Close map">
          ✕
        </button>
      </header>

      <svg className="wm-svg" viewBox={`0 0 ${view.w} ${view.h}`} width={view.w} height={view.h}>
        <defs>
          {/* Texture per motif. Subtle enough to read as ground cover at this
              size, which is what keeps five rectangles from looking like five
              buttons. */}
          <pattern id="wm-trees" width="8" height="8" patternUnits="userSpaceOnUse">
            <path d="M4 1.5 L6 5 L2 5 Z" fill="rgba(255,255,255,0.16)" />
          </pattern>
          <pattern id="wm-dense" width="6" height="6" patternUnits="userSpaceOnUse">
            <path d="M3 1 L4.6 4 L1.4 4 Z" fill="rgba(160,200,255,0.2)" />
          </pattern>
          <pattern id="wm-grid" width="7" height="7" patternUnits="userSpaceOnUse">
            <path d="M7 0 L0 0 0 7" fill="none" stroke="rgba(255,255,255,0.13)" strokeWidth="1" />
          </pattern>
        </defs>

        {/* Roads first, so regions draw over their ends. */}
        {MAP_LINKS.map(([a, b]) => {
          const from = nodes.find((n) => n.id === a);
          const to = nodes.find((n) => n.id === b);
          if (!from || !to) return null;
          const p = place(from.x, from.y);
          const q = place(to.x, to.y);
          return (
            <line
              key={`${a}-${b}`}
              className="wm-road"
              x1={p.cx} y1={p.cy} x2={q.cx} y2={q.cy}
            />
          );
        })}

        {nodes.map((n) => {
          const { cx, cy } = place(n.x, n.y);
          const x = cx - NODE_W / 2;
          const y = cy - NODE_H / 2;
          return (
            <g key={n.id} className={`wm-region${n.here ? ' is-here' : ''}${n.open ? '' : ' is-locked'}`}>
              <title>{n.locked ?? n.name}</title>
              <rect x={x} y={y} width={NODE_W} height={NODE_H} rx="6" fill={n.fill} />
              <rect x={x} y={y} width={NODE_W} height={NODE_H} rx="6" fill={`url(#wm-${n.motif})`} />
              <rect
                className="wm-region-edge"
                x={x} y={y} width={NODE_W} height={NODE_H} rx="6"
                fill="none" stroke={n.here ? '#ccff00' : n.edge}
              />

              {/* Danger pip. Somewhere that can kill you should look like it on
                  the map, not only once you are standing in it. */}
              {n.dangerous && (
                <g className="wm-danger">
                  <circle cx={x + NODE_W - 9} cy={y + 9} r="5.5" />
                  <text x={x + NODE_W - 9} y={y + 11.6}>!</text>
                </g>
              )}

              {/* Locked regions keep a padlock rather than vanishing: a gate you
                  cannot see is a gate you cannot work toward, and the Deep
                  Forest existing at all is most of what makes level 10 worth
                  reaching. */}
              {!n.open && (
                <g className="wm-lock" transform={`translate(${cx - 5} ${cy - 6})`}>
                  <rect x="0" y="4.5" width="10" height="7.5" rx="1.5" />
                  <path d="M2.2 4.5 V2.8 a2.8 2.8 0 0 1 5.6 0 V4.5" fill="none" />
                </g>
              )}

              <text className="wm-label" x={cx} y={y + NODE_H + 11}>
                {n.name}
              </text>
            </g>
          );
        })}

        {/* You. A pulsing marker, drawn last so nothing covers it. */}
        {marker && (
          <g className="wm-you" transform={`translate(${marker.cx} ${marker.cy})`}>
            <circle className="wm-you-pulse" r="9" />
            <circle className="wm-you-dot" r="4" />
          </g>
        )}
      </svg>

      {/*
        The way home, as a DIRECTION rather than a destination.

        It names the next region on the route and stops there. Making it a link
        would make this a nav rail with a map drawn on it — and it would skip the
        walk, which is where everything in this game actually happens.
      */}
      <footer className="wm-home">
        {at === HOME ? (
          <span>You are at {homeName}. Everywhere else is one walk from here.</span>
        ) : next ? (
          <span>
            Home — head for <b>{nodes.find((n) => n.id === next)?.name ?? homeName}</b>.
          </span>
        ) : (
          <span>Every road leads back to {homeName}.</span>
        )}
      </footer>
    </aside>
  );
}
