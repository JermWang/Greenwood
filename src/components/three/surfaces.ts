// Procedural PBR surface library.
//
// Every surface in the fab was a flat `meshStandardMaterial` colour, which is
// what makes a scene read as "untextured 3D" no matter how good the lighting
// is: real materials break up specular highlights, and a constant roughness
// value cannot. These generators synthesise colour/normal/roughness maps on a
// canvas at runtime instead of shipping texture files — a few hundred KB of
// generated pixels rather than tens of MB of downloads, and they tile perfectly
// because the noise is generated wrapped.
//
// Textures are cached by key: the same surface requested from ten meshes is
// uploaded to the GPU once.

import * as THREE from 'three';

/** Deterministic PRNG so a surface looks identical on every load and machine. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Value noise on a wrapped lattice.
 *
 * The lattice wraps modulo `cells`, so sampling across the texture edge lands
 * back on the opposite edge's gradient — that is what lets these tile without a
 * visible seam. Bilinear with a smoothstep fade; cheap, and at these
 * frequencies indistinguishable from Perlin once it is stacked into fBm.
 */
function valueNoise(cells: number, seed: number) {
  const random = mulberry32(seed);
  const lattice = new Float32Array(cells * cells);
  for (let i = 0; i < lattice.length; i += 1) lattice[i] = random();
  const fade = (t: number) => t * t * (3 - 2 * t);

  return (x: number, y: number) => {
    const fx = x * cells;
    const fy = y * cells;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fade(fx - x0);
    const ty = fade(fy - y0);
    const ix = ((x0 % cells) + cells) % cells;
    const iy = ((y0 % cells) + cells) % cells;
    const jx = (ix + 1) % cells;
    const jy = (iy + 1) % cells;
    const a = lattice[iy * cells + ix];
    const b = lattice[iy * cells + jx];
    const c = lattice[jy * cells + ix];
    const d = lattice[jy * cells + jx];
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  };
}

/** Stacked octaves of wrapped value noise, normalised to 0..1. */
function fbm(size: number, seed: number, octaves: number, baseCells: number) {
  const layers = Array.from({ length: octaves }, (_, i) =>
    valueNoise(baseCells * 2 ** i, seed + i * 977)
  );
  const height = new Float32Array(size * size);
  let peak = 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let value = 0;
      let amplitude = 1;
      for (const layer of layers) {
        value += layer(x / size, y / size) * amplitude;
        amplitude *= 0.5;
      }
      height[y * size + x] = value;
      if (value > peak) peak = value;
    }
  }
  for (let i = 0; i < height.length; i += 1) height[i] /= peak || 1;
  return height;
}

function canvasOf(size: number) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

/**
 * Convert a height field to a tangent-space normal map via Sobel.
 *
 * Neighbour lookups wrap, matching the wrapped noise, so the normals stay
 * continuous across the tile boundary too — otherwise every tile edge would
 * catch the light as a hard crease.
 */
function normalMapFrom(height: Float32Array, size: number, strength: number) {
  const canvas = canvasOf(size);
  const context = canvas.getContext('2d')!;
  const image = context.createImageData(size, size);
  const at = (x: number, y: number) =>
    height[(((y % size) + size) % size) * size + (((x % size) + size) % size)];

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx =
        at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1) -
        (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1));
      const dy =
        at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1) -
        (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1));
      const nx = dx * strength;
      const ny = dy * strength;
      const length = Math.hypot(nx, ny, 1);
      const offset = (y * size + x) * 4;
      image.data[offset] = ((nx / length) * 0.5 + 0.5) * 255;
      image.data[offset + 1] = ((ny / length) * 0.5 + 0.5) * 255;
      image.data[offset + 2] = ((1 / length) * 0.5 + 0.5) * 255;
      image.data[offset + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

/** Write a scalar field to a greyscale canvas, for roughness/AO maps. */
function greyMapFrom(size: number, sample: (x: number, y: number) => number) {
  const canvas = canvasOf(size);
  const context = canvas.getContext('2d')!;
  const image = context.createImageData(size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const value = Math.max(0, Math.min(1, sample(x, y))) * 255;
      const offset = (y * size + x) * 4;
      image.data[offset] = value;
      image.data[offset + 1] = value;
      image.data[offset + 2] = value;
      image.data[offset + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

function textureOf(canvas: HTMLCanvasElement, repeat: number, srgb = false) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.anisotropy = 8;
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export interface Surface {
  map?: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
  normalScale: THREE.Vector2;
}

const cache = new Map<string, Surface>();

function cached(key: string, build: () => Surface): Surface {
  const hit = cache.get(key);
  if (hit) return hit;
  const surface = build();
  cache.set(key, surface);
  return surface;
}

/**
 * Poured epoxy cleanroom floor: fine aggregate speckle with a soft roughness
 * mottle, so overhead lights smear across it instead of landing as a perfect
 * mirror disc. Panel seams are drawn as geometry elsewhere, not baked in here,
 * so the tile can repeat at any density.
 */
export function epoxyFloor(repeat = 14): Surface {
  return cached(`epoxy:${repeat}`, () => {
    const size = 512;
    const grain = fbm(size, 4211, 5, 8);
    const mottle = fbm(size, 991, 3, 3);
    return {
      normalMap: textureOf(normalMapFrom(grain, size, 0.55), repeat),
      roughnessMap: textureOf(
        greyMapFrom(size, (x, y) => {
          const i = y * size + x;
          return 0.52 + mottle[i] * 0.34 + grain[i] * 0.12;
        }),
        repeat
      ),
      normalScale: new THREE.Vector2(0.35, 0.35),
    };
  });
}

/**
 * Brushed stainless: directional streaks. The height field is stretched hard on
 * one axis, which is what gives the anisotropic smear real brushed metal has.
 */
export function brushedMetal(repeat = 3): Surface {
  return cached(`brushed:${repeat}`, () => {
    const size = 512;
    const streaks = fbm(size, 7717, 4, 6);
    const height = new Float32Array(size * size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        // Sample a band of rows and average: smears detail along X only.
        let sum = 0;
        for (let k = -3; k <= 3; k += 1) {
          sum += streaks[(((y + k) % size) + size) % size * size + x];
        }
        height[y * size + x] = sum / 7;
      }
    }
    return {
      normalMap: textureOf(normalMapFrom(height, size, 1.5), repeat),
      roughnessMap: textureOf(
        greyMapFrom(size, (x, y) => 0.22 + height[y * size + x] * 0.3),
        repeat
      ),
      normalScale: new THREE.Vector2(0.5, 0.5),
    };
  });
}

/**
 * Painted equipment panel: near-flat with an orange-peel micro-texture. Subtle
 * by design — it exists to stop large white enclosures reading as untextured
 * blanks under a bright HDRI.
 */
export function paintedPanel(repeat = 4): Surface {
  return cached(`painted:${repeat}`, () => {
    const size = 256;
    const peel = fbm(size, 3313, 3, 16);
    return {
      normalMap: textureOf(normalMapFrom(peel, size, 0.3), repeat),
      roughnessMap: textureOf(
        greyMapFrom(size, (x, y) => 0.4 + peel[y * size + x] * 0.22),
        repeat
      ),
      normalScale: new THREE.Vector2(0.22, 0.22),
    };
  });
}

/**
 * Poured concrete apron used outside the cleanroom envelope — coarser and
 * rougher than the epoxy floor, with visible aggregate.
 */
export function concrete(repeat = 10): Surface {
  return cached(`concrete:${repeat}`, () => {
    const size = 512;
    const coarse = fbm(size, 5501, 5, 6);
    const pits = fbm(size, 8123, 2, 24);
    const height = new Float32Array(size * size);
    for (let i = 0; i < height.length; i += 1) {
      height[i] = coarse[i] * 0.7 + pits[i] * 0.3;
    }
    return {
      normalMap: textureOf(normalMapFrom(height, size, 1.1), repeat),
      roughnessMap: textureOf(
        greyMapFrom(size, (x, y) => 0.72 + height[y * size + x] * 0.22),
        repeat
      ),
      normalScale: new THREE.Vector2(0.6, 0.6),
    };
  });
}

/** Release every generated texture. Call on hot-reload teardown only. */
export function disposeSurfaces() {
  for (const surface of cache.values()) {
    surface.map?.dispose();
    surface.normalMap.dispose();
    surface.roughnessMap.dispose();
  }
  cache.clear();
}
