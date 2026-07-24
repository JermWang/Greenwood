// Bake the game's procedural fab equipment to GLB files.
//
//   npx tsx scripts/export-fab-glb.tsx
//
// The equipment is react-three-fiber JSX, so it only becomes geometry when
// something renders it. This renders each machine headlessly with the R3F test
// renderer (no GL context, no window), pulls the resulting THREE scene out, and
// writes it through GLTFExporter. The models are pure primitives with no
// textures, which is what makes a headless bake clean.
//
// Output lands in blender/fab-glb/ for import into Blender. Dev-only: it depends
// on @react-three/test-renderer and tsx, both installed with --no-save so the
// deploy is untouched.

// GLTFExporter's binary path reads a Blob through FileReader, which Node has no
// global for. Blob (Node 18+) does expose .arrayBuffer(), so a tiny shim over it
// is enough — there are no textures here, so this is the only browser global the
// exporter reaches for.
if (typeof (globalThis as any).FileReader === 'undefined') {
  (globalThis as any).FileReader = class {
    result: unknown = null;
    onload: ((ev: { target: { result: unknown } }) => void) | null = null;
    onloadend: ((ev: { target: { result: unknown } }) => void) | null = null;
    onerror: ((err: unknown) => void) | null = null;
    private done(buf: unknown) {
      this.result = buf;
      const ev = { target: { result: buf } };
      // GLTFExporter's binary path uses onloadend; support onload too for safety.
      this.onload?.(ev);
      this.onloadend?.(ev);
    }
    readAsArrayBuffer(blob: Blob) {
      blob.arrayBuffer().then((buf) => this.done(buf), (err) => this.onerror?.(err));
    }
    readAsDataURL(blob: Blob) {
      blob.arrayBuffer().then(
        (buf) => this.done('data:application/octet-stream;base64,' + Buffer.from(buf).toString('base64')),
        (err) => this.onerror?.(err)
      );
    }
  };
}

import * as React from 'react';
import * as THREE from 'three';
import { RoundedBox } from '@react-three/drei';
// @ts-expect-error — test-renderer has no bundled types export we need here
import ReactThreeTestRenderer from '@react-three/test-renderer';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { EUVUtilityCore, AcceleratorTestRack } from '../src/components/three/Compound';
import { FabCrate, CRATE_RARITY_ACCENTS } from '../src/components/three/FabCrate';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const OUT = join(ROOT, 'blender', 'fab-glb');

// Cooling and packaging live inside FabSandbox as a private helper; importing
// that whole client component headlessly would drag in the API client and more,
// so the two shapes are reproduced here from src/components/game/FabSandbox.tsx.
function CompactMachine({ kind, accent = '#62e8ff' }: { kind: 'cooling' | 'packaging'; accent?: string }) {
  if (kind === 'cooling') {
    return (
      <group name="liquid-cooling-array">
        <RoundedBox args={[2.8, 2.4, 2]} radius={0.28} smoothness={3} position={[0, 1.2, 0]} castShadow><meshStandardMaterial color="#edf2f1" roughness={0.44} /></RoundedBox>
        {[-0.72, 0, 0.72].map((x) => <mesh key={x} position={[x, 1.3, 1.03]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.32, 0.32, 0.08, 20]} /><meshStandardMaterial color="#1d3145" metalness={0.45} /></mesh>)}
        <mesh position={[0, 2, 1.05]}><boxGeometry args={[1.5, 0.12, 0.05]} /><meshBasicMaterial color={accent} toneMapped={false} /></mesh>
      </group>
    );
  }
  return (
    <group name="chiplet-packaging-line">
      <RoundedBox args={[3.5, 1.8, 2.2]} radius={0.25} smoothness={3} position={[0, 0.9, 0]} castShadow><meshStandardMaterial color="#f0f3f0" roughness={0.5} /></RoundedBox>
      <RoundedBox args={[2.7, 0.72, 0.08]} radius={0.12} smoothness={2} position={[0, 1.12, 1.13]}><meshStandardMaterial color="#123b84" /></RoundedBox>
      {[-0.78, 0, 0.78].map((x) => <mesh key={x} position={[x, 1.12, 1.19]}><boxGeometry args={[0.38, 0.18, 0.04]} /><meshBasicMaterial color={accent} toneMapped={false} /></mesh>)}
      <RoundedBox args={[4.5, 0.24, 1.05]} radius={0.1} smoothness={2} position={[0, 0.2, 0]}><meshStandardMaterial color="#293442" metalness={0.42} /></RoundedBox>
    </group>
  );
}

const MODELS: Array<{ slug: string; element: React.ReactElement }> = [
  { slug: 'euv-utility-core', element: <EUVUtilityCore review /> },
  { slug: 'ai-accelerator-test-rack', element: <AcceleratorTestRack review /> },
  { slug: 'liquid-cooling-array', element: <CompactMachine kind="cooling" /> },
  { slug: 'chiplet-packaging-line', element: <CompactMachine kind="packaging" /> },
  // Fab-style supply pods, one per rarity, tinted by the game's rarity accent.
  ...Object.entries(CRATE_RARITY_ACCENTS).map(([rarity, accent]) => ({
    slug: `crate-${rarity}`,
    element: <FabCrate accent={accent} />,
  })),
];

/** Reach the real THREE.Scene behind the test renderer's wrapper. */
function threeScene(renderer: any): THREE.Scene {
  const candidates = [
    renderer?.scene?.instance,
    renderer?.scene?._fiber,
    renderer?.getInstance?.(),
    renderer?.scene,
  ];
  for (const c of candidates) {
    if (c && (c as THREE.Object3D).isObject3D) return c as THREE.Scene;
  }
  throw new Error('could not locate the THREE scene on the test renderer');
}

function exportGlb(scene: THREE.Object3D): Promise<Buffer> {
  const exporter = new GLTFExporter();
  return new Promise((resolve, reject) => {
    exporter.parse(
      scene,
      (result) => {
        if (result instanceof ArrayBuffer) resolve(Buffer.from(result));
        else reject(new Error('exporter returned JSON, expected binary GLB'));
      },
      (err) => reject(err),
      { binary: true, onlyVisible: false }
    );
  });
}

async function main() {
  const create =
    (ReactThreeTestRenderer as any)?.create ?? (ReactThreeTestRenderer as any)?.default?.create;
  if (typeof create !== 'function') throw new Error('test renderer has no create()');

  mkdirSync(OUT, { recursive: true });
  for (const { slug, element } of MODELS) {
    const renderer = await create(element);
    const scene = threeScene(renderer);
    const glb = await exportGlb(scene);
    writeFileSync(join(OUT, `${slug}.glb`), glb);
    console.log(`baked ${slug.padEnd(26)} ${(glb.length / 1024).toFixed(1)} KB`);
    await renderer.unmount?.();
  }
  console.log(`\n${MODELS.length} models -> blender/fab-glb/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
