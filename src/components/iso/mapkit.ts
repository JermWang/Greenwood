'use client';

// Procedural surface textures and the seeded noise the maps are dressed with.
//
// Every floor in the game was a flat colour per tile, which is why the rooms
// read as spreadsheets with models parked on them. A real room's floor carries
// most of its character: grout lines, aggregate in the stone, scuffed lanes
// where people walk, a rug under the seating, painted markings on a shop floor.
// None of that needs an artist — it needs a canvas and a seeded random.
//
// Textures are drawn near-white and TINTED by per-instance colour, so one
// texture serves every palette the maps use. Draw them dark and the tint has
// nothing left to work with.
//
// All of them are built once, lazily, and cached: a CanvasTexture per tile would
// be thousands of uploads, and these are created during render.

import * as THREE from 'three';

type Draw = (ctx: CanvasRenderingContext2D, size: number) => void;

const cache = new Map<string, THREE.CanvasTexture>();

/**
 * Build (or return) a cached texture.
 *
 * Guards on `document` so a server render — or a test importing this module —
 * gets a harmless empty texture instead of a crash.
 */
function texture(key: string, size: number, draw: Draw, repeat = 1): THREE.CanvasTexture {
  const hit = cache.get(key);
  if (hit) return hit;
  const canvas =
    typeof document !== 'undefined'
      ? document.createElement('canvas')
      : ({ width: 0, height: 0, getContext: () => null } as unknown as HTMLCanvasElement);
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) draw(ctx, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, tex);
  return tex;
}

/** Deterministic 0..1 from a pair of integers. Same cell, same speckle, forever. */
export function hash2(x: number, z: number, salt = 0): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263) ^ Math.imul(salt, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/** Smooth-ish value noise off hash2, for patches that are larger than one cell. */
export function patchNoise(x: number, z: number, scale = 5, salt = 0): number {
  const fx = x / scale;
  const fz = z / scale;
  const x0 = Math.floor(fx);
  const z0 = Math.floor(fz);
  const tx = fx - x0;
  const tz = fz - z0;
  const sx = tx * tx * (3 - 2 * tx);
  const sz = tz * tz * (3 - 2 * tz);
  const a = hash2(x0, z0, salt);
  const b = hash2(x0 + 1, z0, salt);
  const c = hash2(x0, z0 + 1, salt);
  const d = hash2(x0 + 1, z0 + 1, salt);
  return (a * (1 - sx) + b * sx) * (1 - sz) + (c * (1 - sx) + d * sx) * sz;
}

function speckle(ctx: CanvasRenderingContext2D, size: number, count: number, min: number, max: number, seed: number) {
  for (let i = 0; i < count; i += 1) {
    const x = hash2(i, seed, 1) * size;
    const y = hash2(i, seed, 2) * size;
    const r = 0.6 + hash2(i, seed, 3) * 2.4;
    const l = Math.round(min + hash2(i, seed, 4) * (max - min));
    ctx.fillStyle = `rgb(${l},${l},${l})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Polished terrazzo: aggregate chips in a pale binder, with a grout channel at
 * the tile edge. The grout is what makes a grid of these read as laid tile
 * rather than as one continuous surface.
 */
export const terrazzoTexture = () =>
  texture('terrazzo', 256, (ctx, s) => {
    ctx.fillStyle = '#efece6';
    ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, 900, 150, 235, 11);
    // A few larger chips, so the aggregate has more than one grade.
    for (let i = 0; i < 70; i += 1) {
      const x = hash2(i, 21, 5) * s;
      const y = hash2(i, 21, 6) * s;
      const w = 3 + hash2(i, 21, 7) * 7;
      const l = Math.round(140 + hash2(i, 21, 8) * 90);
      ctx.fillStyle = `rgb(${l},${l - 3},${l - 8})`;
      ctx.beginPath();
      ctx.ellipse(x, y, w, w * 0.62, hash2(i, 21, 9) * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    // Grout: inset, soft, and doubled at the very edge so adjacent tiles meet
    // in a single darker line rather than two faint ones.
    ctx.strokeStyle = 'rgba(96,94,88,.42)';
    ctx.lineWidth = 7;
    ctx.strokeRect(3.5, 3.5, s - 7, s - 7);
    ctx.strokeStyle = 'rgba(150,147,140,.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(11, 11, s - 22, s - 22);
  });

/** Loop-pile carpet for the lounge zones: fibre noise plus a woven cross-hatch. */
export const carpetTexture = () =>
  texture('carpet', 256, (ctx, s) => {
    ctx.fillStyle = '#dedad2';
    ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, 2600, 175, 232, 31);
    ctx.globalAlpha = 0.16;
    for (let i = 0; i < s; i += 5) {
      ctx.fillStyle = i % 10 === 0 ? '#8d8a83' : '#ffffff';
      ctx.fillRect(i, 0, 2, s);
      ctx.fillRect(0, i, s, 2);
    }
    ctx.globalAlpha = 1;
  });

/** Sealed concrete: mottled patches, a faint pour line, the odd stain. */
/**
 * Poured concrete. Clean, not weathered.
 *
 * This used to lay 26 radial blobs at 50% alpha over the base and then 700
 * speckles on top, which is a recipe for grime rather than concrete — at tile
 * scale it read as a floor nobody had cleaned in a decade, and it dominated the
 * title screen.
 *
 * Real poured concrete is remarkably uniform. What varies is FINE grain, not
 * large patches: a slab is one tone with a slightly different tone stippled
 * through it, plus the seam where two pours meet. So the blobs are down to six,
 * very wide and very faint — enough to stop the surface being a flat fill —
 * and the speckle is halved and tightened to a narrow band around the base
 * colour instead of ranging across it.
 */
export const concreteTexture = () =>
  texture('concrete', 256, (ctx, s) => {
    ctx.fillStyle = '#dedbd6';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 6; i += 1) {
      const x = hash2(i, 5, 1) * s;
      const y = hash2(i, 5, 2) * s;
      const r = 70 + hash2(i, 5, 3) * 70;
      const l = Math.round(214 + hash2(i, 5, 4) * 18);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${l},${l},${l},.14)`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // Fine aggregate. Narrow lightness band and low alpha: grain you notice only
    // when you look for it, which is what stops a flat fill reading as plastic.
    speckle(ctx, s, 340, 205, 224, 22);
    // The pour seam. Thin and pale — a control joint, not a crack.
    ctx.strokeStyle = 'rgba(150,148,142,.22)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, s * 0.5);
    ctx.lineTo(s, s * 0.5);
    ctx.stroke();
  });

/** Steel grating: bearing bars over a dark void, with cross rods and rivets. */
export const grateTexture = () =>
  texture('grate', 256, (ctx, s) => {
    ctx.fillStyle = '#4a4842';
    ctx.fillRect(0, 0, s, s);
    const bar = s / 8;
    for (let i = 0; i < 8; i += 1) {
      ctx.fillStyle = i % 2 === 0 ? '#cbc8c1' : '#bfbcb5';
      ctx.fillRect(i * bar + 3, 0, bar - 6, s);
    }
    ctx.fillStyle = 'rgba(190,187,180,.85)';
    for (let i = 0; i < 4; i += 1) ctx.fillRect(0, i * (s / 4) + 6, s, 7);
    ctx.fillStyle = 'rgba(255,255,255,.5)';
    for (let i = 0; i < 8; i += 1) {
      for (let j = 0; j < 4; j += 1) {
        ctx.beginPath();
        ctx.arc(i * bar + bar / 2, j * (s / 4) + 9.5, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  });

/** Brushed metal panel, for walls and machine housings. */
export const brushedTexture = () =>
  texture('brushed', 256, (ctx, s) => {
    ctx.fillStyle = '#dcd9d3';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 900; i += 1) {
      const y = hash2(i, 7, 1) * s;
      const l = Math.round(196 + hash2(i, 7, 2) * 55);
      ctx.strokeStyle = `rgba(${l},${l},${l},.5)`;
      ctx.lineWidth = 0.6 + hash2(i, 7, 3) * 1.3;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(s, y + (hash2(i, 7, 4) - 0.5) * 4);
      ctx.stroke();
    }
  });

/**
 * Painted hazard stripe, used along the edge of the build area.
 *
 * Drawn on transparent so it can lie over whatever floor it is applied to
 * instead of needing a matching base colour.
 */
export const hazardTexture = () =>
  texture(
    'hazard',
    128,
    (ctx, s) => {
      ctx.clearRect(0, 0, s, s);
      ctx.fillStyle = 'rgba(255,255,255,.92)';
      ctx.save();
      ctx.translate(-s, 0);
      for (let i = 0; i < 6; i += 1) {
        ctx.beginPath();
        ctx.moveTo(i * s * 0.5, 0);
        ctx.lineTo(i * s * 0.5 + s * 0.24, 0);
        ctx.lineTo(i * s * 0.5 + s * 0.24 + s, s);
        ctx.lineTo(i * s * 0.5 + s, s);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
      // Worn through in places: a perfectly crisp painted line reads as a decal.
      ctx.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < 40; i += 1) {
        ctx.globalAlpha = 0.1 + hash2(i, 3, 1) * 0.45;
        ctx.beginPath();
        ctx.arc(hash2(i, 3, 2) * s, hash2(i, 3, 3) * s, 2 + hash2(i, 3, 4) * 6, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    1
  );

/**
 * A ground arrow marking a way out of the room.
 *
 * Three chevrons plus a worn painted bar, on transparent, so it lies on the
 * floor like a marking rather than hovering as a sprite.
 */
export const arrowTexture = () =>
  texture('arrow', 256, (ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 3; i += 1) {
      const y = s * 0.2 + i * s * 0.21;
      const a = 0.4 + i * 0.3;
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.moveTo(s * 0.5, y);
      ctx.lineTo(s * 0.82, y + s * 0.15);
      ctx.lineTo(s * 0.68, y + s * 0.15);
      ctx.lineTo(s * 0.5, y + s * 0.062);
      ctx.lineTo(s * 0.32, y + s * 0.15);
      ctx.lineTo(s * 0.18, y + s * 0.15);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  });

/**
 * The floor medallion at the centre of the Trading Floor: a ring inlay with the
 * evergreen mark. Every room worth walking across has something at its middle.
 */
export const medallionTexture = () =>
  texture('medallion', 512, (ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    const c = s / 2;
    ctx.strokeStyle = 'rgba(255,255,255,.5)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(c, c, s * 0.46, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(c, c, s * 0.4, 0, Math.PI * 2);
    ctx.stroke();

    // Tick marks around the ring, like a compass inlay.
    ctx.strokeStyle = 'rgba(255,255,255,.34)';
    ctx.lineWidth = 3;
    for (let i = 0; i < 32; i += 1) {
      const a = (i / 32) * Math.PI * 2;
      const long = i % 8 === 0;
      ctx.beginPath();
      ctx.moveTo(c + Math.cos(a) * s * 0.4, c + Math.sin(a) * s * 0.4);
      ctx.lineTo(c + Math.cos(a) * s * (long ? 0.32 : 0.36), c + Math.sin(a) * s * (long ? 0.32 : 0.36));
      ctx.stroke();
    }

    // The mark itself: two chevrons and a trunk, matching public/eg-mark.svg.
    ctx.fillStyle = 'rgba(255,255,255,.62)';
    const tree = (topY: number, halfW: number, h: number) => {
      ctx.beginPath();
      ctx.moveTo(c, topY);
      ctx.lineTo(c + halfW, topY + h);
      ctx.lineTo(c - halfW, topY + h);
      ctx.closePath();
      ctx.fill();
    };
    tree(c - s * 0.2, s * 0.12, s * 0.15);
    tree(c - s * 0.09, s * 0.16, s * 0.18);
    ctx.fillRect(c - s * 0.022, c + s * 0.09, s * 0.044, s * 0.09);
  });

/**
 * The tile grid, for the outdoor regions.
 *
 * Outdoors there is no IsoBoard. That renders one InstancedMesh per tile and
 * recolours all of them in an effect, which is comfortable over the Machine
 * Room's ~825 tiles and a frame hazard over a map with tens of thousands. So the
 * ground is a single plane and the grid is a TEXTURE repeated once per tile,
 * which costs exactly one draw call whatever the map's size.
 *
 * Three things here are load-bearing and each cost a debugging session:
 *
 *   ONE CELL PER REPEAT, not a 2x2 chequer. The repeat is one world unit, so a
 *   chequer drew four squares per tile and every visible square was HALF a tile.
 *   Tile markers, correctly one unit across, then covered a 2x2 block of what
 *   looked like grid cells and lined up with nothing — the floor was lying about
 *   the grid it existed to represent.
 *
 *   COLOURS ARE PARAMETERS, not the module's usual draw-white-and-tint. `map` is
 *   MULTIPLIED by the material's `color`, so a dark grid times a dark earth tone
 *   came out effectively black: the texture generated correctly, uploaded
 *   correctly, and rendered invisibly. Baking the tone in lets the material stay
 *   white and get out of the way.
 *
 *   NEAREST filtering. A one-pixel border line mipmapped down to a grey haze at
 *   any distance, which read as fog rather than as a grid.
 */
export function gridTexture(fill: string, line: string, repeat: number): THREE.CanvasTexture {
  // `repeat` is part of the cache KEY, not just applied after the fact. Textures
  // here are shared objects, so two regions asking for the same colours at
  // different map sizes would otherwise be handed one texture and set its repeat
  // in turn — whichever mounted last would win and the other region's grid would
  // silently stop matching its own tiles.
  const tex = texture(`grid:${fill}:${line}:${repeat}`, 64, (ctx, s) => {
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = line;
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, s - 2, s - 2);
  }, repeat);
  // Nearest, not the default trilinear: a one-pixel border line mipmaps down to
  // a grey haze at any distance, which reads as fog rather than as a grid.
  tex.magFilter = THREE.NearestFilter;
  return tex;
}

/** Warm pool of light cast on the floor under a pendant lamp. */
export const lightPoolTexture = () =>
  texture('lightpool', 256, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,244,225,.5)');
    g.addColorStop(0.45, 'rgba(255,240,215,.22)');
    g.addColorStop(1, 'rgba(255,238,210,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  });
