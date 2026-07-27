// The share card, generated as a real PNG.
//
// WHY THIS EXISTS RATHER THAN A STATIC FILE.
//
// The first version pointed og:image at an SVG, which renders fine in a browser
// and is silently dropped by X, Facebook and LinkedIn — all of which require a
// raster image. A share card that 404s on the platform you are actually sharing
// to is worse than no card, because the link degrades to a bare URL and looks
// broken rather than plain.
//
// Next's ImageResponse rasterises this at request time and caches it, so the
// card stays a diffable file instead of a binary somebody has to re-export every
// time the wordmark changes.
//
// WHAT IT IS ALLOWED TO SAY.
//
// docs/greenwood-turn.md: the reveal is environmental, it lands between levels
// three and ten, and it is worth nothing if a player arrives already knowing. So
// this says nothing about what is outside. It sells the game on the tin.
//
// It is composed to be read twice. First pass: a tidy settlement at dusk, warm
// windows, a fence, trees — corporate and calm. Second pass, once you have
// played: the floodlights on that fence all point AWAY from the buildings, the
// treeline past it is darker than the sky should allow, and the only warm light
// in the frame is inside the perimeter. Nothing here states the turn; everything
// here is consistent with it.

import { ImageResponse } from 'next/og';

export const runtime = 'nodejs';
export const alt = 'Greenwood — one of the last lit settlements. Yield never sleeps.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const NEON = '#ccff00';

/** A conifer silhouette. Plain divs, because satori has no SVG polygon support. */
function Tree({ left, h, dark }: { left: number; h: number; dark?: boolean }) {
  return (
    <div
      style={{
        position: 'absolute',
        left,
        bottom: 258,
        width: 0,
        height: 0,
        borderLeft: `${h * 0.34}px solid transparent`,
        borderRight: `${h * 0.34}px solid transparent`,
        borderBottom: `${h}px solid ${dark ? '#141c17' : '#1d2820'}`,
      }}
    />
  );
}

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          background: 'linear-gradient(180deg, #14202b 0%, #243642 52%, #3b4a3a 100%)',
          fontFamily: 'sans-serif',
        }}
      >
        {/* Ground. */}
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 300, background: 'linear-gradient(180deg,#46583a,#2b3725)', display: 'flex' }} />

        {/* The dark past the perimeter — heavier than the sky above it. */}
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 258, height: 76, background: '#1b241d', display: 'flex' }} />

        {[40, 130, 226, 318, 410, 505, 600, 700, 800, 890, 985, 1085, 1160].map((x, i) => (
          <Tree key={x} left={x} h={54 + ((i * 37) % 34)} dark={i % 3 === 0} />
        ))}

        {/* Fence rail. */}
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 268, height: 5, background: '#5d6259', display: 'flex' }} />

        {/* Floodlights, thrown OUTWARD into the trees. Nobody lights a
            perimeter to look at their own car park. */}
        {[120, 540, 960].map((x) => (
          <div
            key={x}
            style={{
              position: 'absolute',
              left: x - 86,
              bottom: 280,
              width: 172,
              height: 92,
              display: 'flex',
              background: 'radial-gradient(ellipse at 50% 100%, rgba(255,233,176,0.36), rgba(255,233,176,0))',
            }}
          />
        ))}

        {/* Two buildings. The only comfortable light in the picture. */}
        {[
          { left: 232, bottom: 96, w: 250, h: 118 },
          { left: 720, bottom: 66, w: 240, h: 112 },
        ].map((b) => (
          <div key={b.left} style={{ position: 'absolute', left: b.left, bottom: b.bottom, display: 'flex', flexDirection: 'column' }}>
            <div style={{ width: b.w, height: 16, background: '#3a3833', display: 'flex' }} />
            <div style={{ width: b.w, height: b.h, background: '#57544d', display: 'flex', alignItems: 'center', justifyContent: 'space-around' }}>
              <div style={{ width: 46, height: 26, background: NEON, opacity: 0.92, display: 'flex' }} />
              <div style={{ width: 46, height: 26, background: NEON, opacity: 0.92, display: 'flex' }} />
              <div style={{ width: 46, height: 26, background: NEON, opacity: 0.92, display: 'flex' }} />
            </div>
          </div>
        ))}

        {/* Wordmark. */}
        <div style={{ position: 'absolute', top: 92, left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ fontSize: 104, fontWeight: 800, letterSpacing: 12, color: '#ffffff', display: 'flex' }}>
            GREENWOOD
          </div>
          <div style={{ marginTop: 14, fontSize: 22, fontWeight: 700, letterSpacing: 8, color: NEON, display: 'flex' }}>
            REAL-WORLD YIELD · $BNTY
          </div>
          <div style={{ marginTop: 20, fontSize: 26, color: '#cfd8d2', opacity: 0.85, display: 'flex' }}>
            One of the last lit settlements. Yield never sleeps.
          </div>
        </div>
      </div>
    ),
    size
  );
}
