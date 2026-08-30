// The Evergreen mark, as something an image generator can draw.
//
// Server-only: reads from disk. Imported by the icon routes, never by a client
// component.
//
// It lives here rather than in either route because both need it and the pair
// were written identically — which is the exact duplication codebase.test.ts
// exists to catch, and it only slipped through because the helper was private
// to each file rather than exported.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MARK_SRC } from './brand-assets';

/**
 * The mark file as a base64 data URI.
 *
 * Handed to satori as an `<img>` rather than rebuilt as JSX, deliberately.
 * Satori paints rectangles, gradients and text and very little else — the
 * header of opengraph-image.tsx records a treeline built from CSS
 * border-triangles coming out as grey blocks. The evergreen in this mark is two
 * triangular paths, which is precisely that failure case. Passing the file
 * through sidesteps satori's layout engine: the rasteriser draws the SVG.
 *
 * Read at request time rather than inlined at build, so editing the mark
 * changes every icon without anything needing to be regenerated. There is one
 * definition of the logo in this repo and this is how the icons stay tied to it.
 */
export function markDataUri(): string {
  // Resolved from MARK_SRC rather than typed out again, so the icons follow
  // the art wherever it moves. MARK_SRC is a URL path, hence the leading slash
  // being dropped before it is joined onto public/.
  const svg = readFileSync(join(process.cwd(), 'public', MARK_SRC.replace(/^\//, '')), 'utf8');
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}
