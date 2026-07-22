// Encode the max-tier in-game warehouse capture as the shared b-roll loop.
//
//   node scripts/build-cinematic-broll.mjs
//
// Ported from the original Python/Pillow version so it runs on the project's own
// toolchain — sharp is already a dependency, Pillow was not, so the old script
// could not actually be run on a machine without a separate Python install.
//
// The capture samples a camera that laps the whole warehouse in 18 seconds, which
// works out at ~16% of the frame changing between adjacent frames. Played back
// straight that reads as a frantic strobe behind the UI, and it cannot be fixed by
// simply lengthening the frame duration — that holds each big jump on screen for
// longer and turns it into a slideshow.
//
// So we interpolate. TWEEN cross-faded frames are inserted between every captured
// pair, and the per-frame duration is left alone: 3x the frames at the same 125 ms
// means the camera takes 3x as long to travel the same path while playback stays at
// 8 fps. Motion per frame drops to ~5%, so the result is both slower and smoother
// than the original. The tweens are dissolves rather than true motion vectors, but
// the backdrop is blurred 5px at 72% opacity (see .gpu-cinematic-broll), so the
// dissolve reads as motion blur rather than ghosting.
//
// Resolution drops to 640x360 to pay for the extra frames. Under that same blur the
// lost detail is invisible, and it keeps the asset near its original weight.

import { mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import sharp from 'sharp';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const FRAME_DIR = join(ROOT, 'design-qa-evidence', 'cinematic-capture-frames');
const OUTPUT_DIR = join(ROOT, 'public', 'media');

const WIDTH = 512;
const HEIGHT = 288;
const FRAME_MS = 125;
/** Cross-faded frames inserted between each captured pair. 2 => 3x slower. */
const TWEEN = 2;
/** The desktop preview overlays a north marker in its bottom strip; crop it off. */
const CAPTURE_CROP_HEIGHT = 480;

/** Match the original Pillow grade: desaturate, lift contrast, soften. */
function grade(pipeline, sourceHeight) {
  return pipeline
    .extract({ left: 0, top: 0, width: 960, height: Math.min(sourceHeight, CAPTURE_CROP_HEIGHT) })
    .resize(WIDTH, HEIGHT, { fit: 'fill' })
    .modulate({ saturation: 0.88 })
    // Pillow's Contrast(1.08) scales around mid-grey; the offset keeps 128 fixed.
    .linear(1.08, -(128 * 0.08))
    .blur(0.55);
}

async function main() {
  const files = readdirSync(FRAME_DIR)
    .filter((f) => f.startsWith('frame-'))
    .sort();
  if (files.length < 24) {
    throw new Error(`Expected a recorded game sequence in ${FRAME_DIR}; found ${files.length} frames`);
  }

  const { height: sourceHeight } = await sharp(join(FRAME_DIR, files[0])).metadata();

  // Graded frames are held as raw pixels so the tweens are a plain lerp.
  const raw = [];
  for (const file of files) {
    raw.push(await grade(sharp(join(FRAME_DIR, file)), sourceHeight).removeAlpha().raw().toBuffer());
  }

  const work = join(tmpdir(), 'gpu-broll-frames');
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });

  // The camera path is a closed loop, so the last frame tweens back into the first
  // and the animation cycles without a visible seam.
  const paths = [];
  for (let i = 0; i < raw.length; i++) {
    const a = raw[i];
    const b = raw[(i + 1) % raw.length];
    for (let step = 0; step <= TWEEN; step++) {
      const t = step / (TWEEN + 1);
      let buffer;
      if (step === 0) {
        buffer = a;
      } else {
        buffer = Buffer.allocUnsafe(a.length);
        for (let p = 0; p < a.length; p++) buffer[p] = a[p] + (b[p] - a[p]) * t;
      }
      const out = join(work, `f-${String(paths.length).padStart(4, '0')}.png`);
      await sharp(buffer, { raw: { width: WIDTH, height: HEIGHT, channels: 3 } }).png().toFile(out);
      paths.push(out);
    }
  }

  mkdirSync(OUTPUT_DIR, { recursive: true });
  const poster = join(OUTPUT_DIR, 'gpu-fab-broll-poster.webp');
  const animation = join(OUTPUT_DIR, 'gpu-fab-broll.webp');

  await sharp(paths[0]).webp({ quality: 80, effort: 6 }).toFile(poster);
  await sharp(paths, { join: { animated: true } })
    .webp({ delay: paths.map(() => FRAME_MS), loop: 0, quality: 46, effort: 6 })
    .toFile(animation);

  rmSync(work, { recursive: true, force: true });

  const { size } = statSync(animation);
  const seconds = ((paths.length * FRAME_MS) / 1000).toFixed(1);
  console.log(
    `Encoded ${files.length} captured frames as ${paths.length} played frames ` +
      `(${seconds}s loop) to public/media/gpu-fab-broll.webp (${(size / 1024 / 1024).toFixed(2)} MiB)`
  );
}

await main();
