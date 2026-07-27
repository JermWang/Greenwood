// The share card, generated as a real PNG.
//
// WHY THIS EXISTS RATHER THAN A STATIC FILE.
//
// The first version pointed og:image at an SVG, which renders fine in a browser
// and is silently dropped by X, Facebook and LinkedIn — all of which require a
// raster image. A card that 404s on the platform you are sharing to is worse
// than no card, because the link degrades to a bare URL and looks broken rather
// than plain. ImageResponse rasterises this at request time and caches it, so
// the card stays a diffable file instead of a binary somebody re-exports every
// time the wordmark changes.
//
// WHAT SATORI CAN ACTUALLY DRAW.
//
// This renderer is not a browser. It lays out flexbox and paints rectangles,
// gradients and text — and that is close to all. The first attempt built the
// treeline from the CSS border-triangle trick, which every browser draws and
// satori paints as grey blocks; they came out as blurred boxes sitting on top of
// the tagline. So: rectangles only, and depth comes from tone and overlap rather
// than from shape. Anything cleverer than a rect needs checking against the real
// output, not against a mental browser.
//
// WHAT IT IS ALLOWED TO SAY.
//
// docs/greenwood-turn.md: the reveal is environmental, lands between levels
// three and ten, and is worth nothing if a player arrives already knowing. So
// this says nothing about what is outside. It sells the game on the tin.
//
// It is composed to be read twice. First pass: a settlement at dusk, warm
// windows, a fence, a treeline — corporate and calm. Second pass, once you have
// played: every floodlight on that fence throws its light AWAY from the
// buildings, the wood past it is darker than the sky above it should allow, and
// the only warm light in the frame is inside the perimeter. Nothing states the
// turn; everything is consistent with it.

import { ImageResponse } from 'next/og';

export const runtime = 'nodejs';
export const alt = 'Greenwood — one of the last lit settlements. Yield never sleeps.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const NEON = '#ccff00';
/** Horizon: everything above is sky, everything below is inside the fence. */
const HORIZON = 352;

/** Deterministic jitter, so the card is identical on every render. */
const wobble = (i: number, spread: number) => ((i * 977) % spread) - spread / 2;

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          position: 'relative',
          background: 'linear-gradient(180deg, #101b25 0%, #1e2f3b 46%, #34434a 100%)',
          fontFamily: 'sans-serif',
        }}
      >
        {/* ── Outside the fence ───────────────────────────────────────────── */}

        {/* The wood. Deliberately darker than the sky it stands against — the
            single most-repeated note in the art direction for this world. */}
        {Array.from({ length: 46 }).map((_, i) => {
          const h = 46 + ((i * 53) % 62);
          return (
            <div
              key={`t${i}`}
              style={{
                position: 'absolute',
                left: i * 27 + wobble(i, 12),
                top: HORIZON - h,
                width: 26,
                height: h,
                background: i % 3 === 0 ? '#0e1712' : '#141f18',
                borderRadius: '13px 13px 0 0',
                display: 'flex',
              }}
            />
          );
        })}

        {/* Ground haze where the wood meets the fence, so the treeline sits in
            the scene rather than being pasted onto it. */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: HORIZON - 46,
            height: 46,
            background: 'linear-gradient(180deg, rgba(16,27,37,0) 0%, rgba(13,22,18,0.72) 100%)',
            display: 'flex',
          }}
        />

        {/* ── The perimeter ───────────────────────────────────────────────── */}

        {/* Light thrown OUTWARD, into the trees. Drawn above the rail and fading
            upward, which is the whole tell. */}
        {[150, 450, 750, 1050].map((x) => (
          <div
            key={`l${x}`}
            style={{
              position: 'absolute',
              left: x - 105,
              top: HORIZON - 112,
              width: 210,
              height: 112,
              background:
                'linear-gradient(0deg, rgba(255,231,168,0.30) 0%, rgba(255,231,168,0.07) 55%, rgba(255,231,168,0) 100%)',
              display: 'flex',
            }}
          />
        ))}

        <div style={{ position: 'absolute', left: 0, right: 0, top: HORIZON, height: 7, background: '#666b60', display: 'flex' }} />
        <div style={{ position: 'absolute', left: 0, right: 0, top: HORIZON + 7, height: 3, background: '#3d423a', display: 'flex' }} />
        {Array.from({ length: 25 }).map((_, i) => (
          <div key={`p${i}`} style={{ position: 'absolute', left: i * 50 + 12, top: HORIZON - 26, width: 7, height: 33, background: '#4c5148', display: 'flex' }} />
        ))}
        {[150, 450, 750, 1050].map((x) => (
          <div key={`h${x}`} style={{ position: 'absolute', left: x - 9, top: HORIZON - 32, width: 18, height: 7, borderRadius: 2, background: '#ffe7a8', display: 'flex' }} />
        ))}

        {/* ── Inside ──────────────────────────────────────────────────────── */}

        <div style={{ position: 'absolute', left: 0, right: 0, top: HORIZON + 10, bottom: 0, background: 'linear-gradient(180deg,#3f5136 0%,#26311f 100%)', display: 'flex' }} />

        {/* Two buildings, warm inside. The only comfortable light in the frame. */}
        {[
          { left: 186, top: 404, w: 300, h: 132 },
          { left: 700, top: 436, w: 286, h: 122 },
        ].map((b) => (
          <div key={b.left} style={{ position: 'absolute', left: b.left, top: b.top, display: 'flex', flexDirection: 'column' }}>
            {/* Parapet, then the face. A darker cap is what stops a rectangle
                reading as a poster and starts it reading as a roof. */}
            <div style={{ width: b.w, height: 15, background: '#2f2d29', borderRadius: '5px 5px 0 0', display: 'flex' }} />
            <div style={{ width: b.w, height: 9, background: '#6d6960', display: 'flex' }} />
            <div
              style={{
                width: b.w,
                height: b.h,
                background: 'linear-gradient(180deg,#5c584f 0%,#46433c 100%)',
                display: 'flex',
                alignItems: 'center',
                // NOT space-evenly: satori accepts only center, flex-start,
                // flex-end, space-between and space-around, and throws on
                // anything else at render time rather than at build time.
                justifyContent: 'space-around',
              }}
            >
              {[0, 1, 2, 3].map((w) => (
                <div key={w} style={{ width: 42, height: 30, borderRadius: 3, background: NEON, opacity: 0.9, display: 'flex' }} />
              ))}
            </div>
            {/* Light spilling onto the ground in front of the door. */}
            <div style={{ width: b.w, height: 26, background: 'linear-gradient(180deg, rgba(204,255,0,0.20), rgba(204,255,0,0))', display: 'flex' }} />
          </div>
        ))}

        {/*
          Scrim, so the wordmark never has to compete with the treeline.

          Painted after the trees and before the text — satori draws in document
          order, so this is the only place it works. Without it the tagline sits
          directly on the tree tops and the contrast depends on which trees the
          jitter happened to make tall, which is not a thing to leave to chance
          on the one image most people will ever see of this game. It also adds
          the aerial haze the top of the frame wanted anyway.
        */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            height: 330,
            background: 'linear-gradient(180deg, rgba(10,17,24,0.62) 0%, rgba(10,17,24,0.34) 62%, rgba(10,17,24,0) 100%)',
            display: 'flex',
          }}
        />

        {/* ── Wordmark ────────────────────────────────────────────────────── */}
        <div
          style={{
            position: 'absolute',
            top: 74,
            left: 0,
            right: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <div style={{ fontSize: 100, fontWeight: 800, letterSpacing: 10, color: '#ffffff', display: 'flex' }}>
            GREENWOOD
          </div>
          <div style={{ marginTop: 12, fontSize: 21, fontWeight: 700, letterSpacing: 8, color: NEON, display: 'flex' }}>
            REAL-WORLD YIELD · $BNTY
          </div>
          <div style={{ marginTop: 16, fontSize: 25, color: '#d5ded8', opacity: 0.86, display: 'flex' }}>
            One of the last lit settlements. Yield never sleeps.
          </div>
        </div>
      </div>
    ),
    size
  );
}
