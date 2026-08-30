// The favicon, as a real PNG.
//
// `/favicon.ico` was a 404 and the only declared icon was the mark SVG.
// Modern browsers do accept an SVG favicon, so tabs looked right — but Safari
// does not, and neither does anything that falls back to requesting
// /favicon.ico by convention, which is why that 404 was being served on every
// cold load.
//
// Generated rather than committed as a binary, for the same reason
// opengraph-image.tsx is: the mark is a file in the repo that somebody will
// edit, and an exported PNG beside it is a copy that silently goes stale. This
// rasterises the actual SVG, so there is one definition of the mark and the
// icon cannot drift from it.

import { ImageResponse } from 'next/og';
import { markDataUri } from '@/lib/brand-mark';

export const runtime = 'nodejs';
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';


export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: '100%',
          alignItems: 'center',
          justifyContent: 'center',
          // The tile already carries the brand colour edge to edge, so the
          // backdrop only shows through the corner radius.
          background: '#17160f',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={markDataUri()} width={size.width} height={size.height} alt="" />
      </div>
    ),
    size
  );
}
