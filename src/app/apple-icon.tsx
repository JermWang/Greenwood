// The iOS home-screen icon.
//
// SEPARATE FROM icon.tsx BECAUSE iOS IS SEPARATE.
//
// The metadata declared `apple: '/eg-mark.svg'`, and iOS does not support SVG
// for apple-touch-icon at all — it ignores the declaration and screenshots the
// page instead, so "Add to Home Screen" produced a tile showing a shrunken
// screengrab of whatever was on screen. That is the one icon a player looks at
// every day if they keep the game, and it was the only one nobody had checked,
// because it cannot be seen from a desktop browser.
//
// 180x180 is the size current iPhones ask for. iOS also applies its own corner
// radius and does NOT respect alpha — a transparent background is composited
// against black, so the mark is drawn on its own opaque tile rather than
// floating.

import { ImageResponse } from 'next/og';
import { markDataUri } from '@/lib/brand-mark';

export const runtime = 'nodejs';
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';


export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: '100%',
          alignItems: 'center',
          justifyContent: 'center',
          // Robin Neon edge to edge. iOS rounds the corners itself, so the mark
          // is drawn slightly inset — its own 30/128 radius rounded a second
          // time by the OS reads as a shrunken sticker rather than an app icon.
          background: '#ccff00',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={markDataUri()} width={168} height={168} alt="" />
      </div>
    ),
    size
  );
}
