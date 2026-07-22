// Cut the backdrop stills out of the recorded warehouse fly-through.
//
//   node scripts/build-cinematic-stills.mjs
//
// The backdrop used to be an animated WebP of the whole fly-through. The capture
// samples a camera that laps the room in seconds, so ~18% of the frame changed
// between adjacent frames: played straight it strobed, and slowing it down only
// turned the strobe into a slideshow. Interpolating the gaps fixed the timing but
// the tweens are cross-dissolves, not real motion, so moving edges ghosted.
//
// So the motion moved to CSS instead. These are single clean frames — no tweening,
// nothing to ghost — and globals.css drifts and cross-fades between them. The pan
// is a compositor transform, so it is smooth by construction at any speed, and the
// whole set costs a fraction of the 4.1 MB animation it replaces.
//
// FRAMES are hand-picked for composition: equipment in shot, a conveyor leading the
// eye in, and enough depth to survive being blurred. Frames of empty floor are
// skipped. Re-pick by eye if the scene changes.

import { mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const FRAME_DIR = join(ROOT, 'design-qa-evidence', 'cinematic-capture-frames');
const OUTPUT_DIR = join(ROOT, 'public', 'media');

const FRAMES = [12, 36, 84, 108, 132];
/** Wider than any sane viewport needs, because the pan zooms in on it. */
const WIDTH = 1440;
const HEIGHT = 810;
/** The desktop preview overlays a north marker in its bottom strip; crop it off. */
const CAPTURE_CROP_HEIGHT = 480;

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  let total = 0;

  for (const [index, frame] of FRAMES.entries()) {
    const source = join(FRAME_DIR, `frame-${String(frame).padStart(3, '0')}.png`);
    const name = `gpu-fab-still-${String(index + 1).padStart(2, '0')}.webp`;
    const output = join(OUTPUT_DIR, name);

    await sharp(source)
      .extract({ left: 0, top: 0, width: 960, height: CAPTURE_CROP_HEIGHT })
      .resize(WIDTH, HEIGHT, { fit: 'fill', kernel: 'lanczos3' })
      // A light grade only. The backdrop is blurred and dimmed in CSS, so baking in
      // more than this just throws away detail the pan would otherwise reveal.
      .modulate({ saturation: 0.9 })
      .linear(1.06, -(128 * 0.06))
      .webp({ quality: 82, effort: 6 })
      .toFile(output);

    const { size } = statSync(output);
    total += size;
    console.log(`frame ${String(frame).padStart(3)} -> public/media/${name} (${(size / 1024).toFixed(0)} KiB)`);
  }

  console.log(`\n${FRAMES.length} stills, ${(total / 1024 / 1024).toFixed(2)} MiB total`);
}

await main();
