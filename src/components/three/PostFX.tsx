'use client';

// Shared post-processing stack.
//
// Currently unreferenced: its only consumers were the old free-camera floor
// scene, which has been deleted. Kept because it is entirely procedural and
// drops straight into IsoScene if the isometric board ever wants AO and bloom.
//
// Ambient occlusion does more for perceived production value than any other
// single change here: without it every object floats, because nothing darkens
// where surfaces meet. N8AO is the ground-truth variant — it traces against the
// depth buffer rather than smearing a screen-space blur, so corners and the
// gaps under equipment darken the way they should instead of haloing.
//
// Bloom is deliberately threshold-gated well above 1.0 so it only catches the
// emissive strips and status LEDs, which are already `toneMapped={false}` and
// therefore render above white. A lower threshold would bloom the bright HDRI
// sky and the white equipment panels into mush.
//
// Antialiasing moves from MSAA to SMAA here. Once a composer is in play the
// scene renders into a float target, where the canvas-level `antialias: true`
// no longer applies, so dropping SMAA in is what stops every panel edge
// crawling.

import { HalfFloatType } from 'three';
import { EffectComposer, N8AO, Bloom, SMAA, Vignette } from '@react-three/postprocessing';

export type PostQuality = 'high' | 'balanced';

interface Props {
  /** Scales AO sampling. 'balanced' halves the AO resolution for weaker GPUs. */
  quality?: PostQuality;
  /** AO strength. Interiors want more than open exteriors. */
  aoIntensity?: number;
  /** World-space AO radius; should roughly match the scene's smallest gap. */
  aoRadius?: number;
  bloomIntensity?: number;
  vignette?: number;
}

export default function PostFX({
  quality = 'high',
  aoIntensity = 2.1,
  aoRadius = 1.35,
  bloomIntensity = 0.62,
  vignette = 0.26,
}: Props) {
  const half = quality === 'balanced';
  return (
    // multisampling 0: MSAA on the composer's target is redundant with SMAA and
    // costs real bandwidth on integrated GPUs.
    //
    // HalfFloatType is load-bearing, not a nicety. An 8-bit buffer clamps every
    // pixel at 1.0, so a bloom threshold above 1.0 would match nothing and the
    // emissive strips would not glow at all. The float buffer is what lets
    // `toneMapped={false}` materials render above white and be picked out.
    //
    // No enableNormalPass: it is only consumed by SSGI, and N8AO reconstructs
    // normals from depth itself — leaving it on renders the whole scene a second
    // time for a buffer nothing in this stack reads.
    <EffectComposer multisampling={0} frameBufferType={HalfFloatType}>
      <N8AO
        aoRadius={aoRadius}
        intensity={aoIntensity}
        distanceFalloff={0.9}
        quality={half ? 'medium' : 'high'}
        halfRes={half}
        color="#06140d"
      />
      <Bloom
        intensity={bloomIntensity}
        luminanceThreshold={1.05}
        luminanceSmoothing={0.22}
        mipmapBlur
        radius={0.72}
      />
      <SMAA />
      <Vignette offset={0.32} darkness={vignette} eskil={false} />
    </EffectComposer>
  );
}
