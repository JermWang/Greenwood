'use client';

// Serialises every model in the game to .glb, one file per entry.
//
// The models are PROCEDURAL — there is no source mesh on disk anywhere in this
// repo, only JSX that builds primitives at render time. So the only honest way
// to get geometry out is to render the real components and read the scene graph
// back out of three.js. That is what this does: same components, same materials,
// exported through GLTFExporter.
//
// It drives react-three-fiber IMPERATIVELY — createRoot/configure/advance —
// rather than mounting a <Canvas>. That looks like the harder way round and is
// the only one that works here. <Canvas> measures its container with a
// ResizeObserver and refuses to build a root until that reports a non-zero box,
// and it drives frames off requestAnimationFrame, which only ticks in a tab the
// browser is painting. This page is meant to be run headless from a script, and
// under those conditions both assumptions fail silently: the first version sat
// on "Exporting 1/38" with no error in the console, because the R3F root had
// never been created at all. configure({size}) states the size outright and
// advance() steps the clock by hand, so neither layout nor paint is involved.
//
// One root, reused for every model, rather than one per model: browsers cap
// live WebGL contexts somewhere around sixteen and quietly kill the oldest, and
// there are thirty-eight models to get through.
//
// Writes through /api/dev/export-glb rather than triggering downloads — forty
// download prompts is not a workflow, and the files need to land somewhere
// Blender can be pointed at.

import { useCallback, useRef, useState } from 'react';
import { createRoot, advance, extend, type ReconcilerRoot } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import Desk from '@/components/iso/DeskModels';
import Character, { lookFor } from '@/components/iso/Character';
import * as Dressing from '@/components/iso/MapDressing';
import * as Outdoor from '@/components/iso/OutdoorDressing';
import * as Creatures from '@/components/iso/Creatures';
import { ISO, type MachineKind } from '@/components/iso/palette';
import { EXPORT_ITEMS, type ExportItem } from './manifest';

const STAGE = 512;

// <Canvas> does this for you; createRoot does not. Without it every intrinsic
// element the models are built from — boxGeometry, meshStandardMaterial, the
// lot — is an unknown tag, and React throws "BoxGeometry is not part of the
// THREE namespace" during render. R3F swallows that into the reconciler, so
// what you see is not an error but an empty scene and an export of nothing.
extend(THREE as unknown as Parameters<typeof extend>[0]);

/**
 * Draw one manifest entry.
 *
 * The same shape as the asset builder's Preview, and deliberately so — if these
 * two ever disagree, the thing you exported is not the thing you looked at.
 */
function Model({ item }: { item: ExportItem }) {
  const props = item.props;

  if (item.category === 'desk') {
    return <Desk kind={(props.kind as MachineKind) ?? 'equity'} accent={ISO.accent} livery={props.livery as never} />;
  }

  if (item.id === 'character') {
    // Standing still: the walk cycle is derived from velocity, and a pose caught
    // mid-stride exports as a mesh nobody can rig against.
    const look = lookFor({
      wallet: '0x7a3b9c1d4e5f60718293a4b5c6d7e8f901234567',
      outfit: (props.outfit as string) ?? null,
      outfitLevel: 0,
      isSelf: false,
    });
    return <Character look={look} target={{ x: 0, z: 0 }} spawn={{ x: 0, z: 0 }} name={undefined} />;
  }

  if (item.id === 'portal') {
    return <Dressing.Portal position={[0, 0]} facing={(props.facing as number) ?? 0} label="Machine Room" active onEnter={() => {}} />;
  }

  const [prefix, ...rest] = item.id.split('-');
  const name = rest.join('-');
  const namespace = prefix === 'outdoor' ? Outdoor : prefix === 'creature' ? Creatures : Dressing;
  const Component = (namespace as unknown as Record<string, React.ComponentType<Record<string, unknown>>>)[name];
  if (!Component) return null;
  return <Component position={[0, 0]} {...props} />;
}


/**
 * Yield one macrotask WITHOUT a timer.
 *
 * setTimeout is the obvious way to let React commit and it is the wrong one
 * here: Chrome clamps timers to a second in a hidden tab and to once a minute
 * once it has been hidden a while, and this page is driven from a script with
 * the pane in the background. A timer-based version of this loop ran fine while
 * the pane was up and then stalled at eleven models of thirty-eight when it was
 * not. MessageChannel is exempt from that throttling — it is the same escape
 * hatch React's own scheduler uses.
 */
function nextTask(): Promise<void> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      resolve();
    };
    channel.port2.postMessage(0);
  });
}

/** Meshes anywhere under an object — the only proof a React commit landed. */
function countMeshes(o: THREE.Object3D): number {
  let n = 0;
  o.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) n++;
  });
  return n;
}

/** Spin on `predicate` until it holds or the budget runs out. */
async function waitUntil(predicate: () => boolean, budgetMs = 8000): Promise<boolean> {
  const deadline = performance.now() + budgetMs;
  while (!predicate()) {
    if (performance.now() > deadline) return false;
    await nextTask();
  }
  return true;
}

/**
 * Flatten a live scene into a plain group of world-space meshes.
 *
 * Baking `matrixWorld` into each clone rather than copying the hierarchy is what
 * makes the result independent of the nested groups and per-frame rotations the
 * components use for animation — Blender gets the pose you exported, at the
 * origin, with no empties in between. Anything that is not a mesh is dropped:
 * drei's <Html/> leaves empty groups behind, and lights and cameras would ride
 * along into Blender as junk beside every single model.
 */
function bake(scene: THREE.Scene, name: string): THREE.Group {
  const root = new THREE.Group();
  root.name = name;
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const clone = mesh.clone();
    clone.matrixAutoUpdate = false;
    clone.matrix.copy(mesh.matrixWorld);
    root.add(clone);
  });
  return root;
}

type Row = { id: string; status: 'pending' | 'ok' | 'fail'; note?: string; bytes?: number; meshes?: number };

export default function GlbExporter() {
  const [rows, setRows] = useState<Row[]>(EXPORT_ITEMS.map((i) => ({ id: i.id, status: 'pending' })));
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [current, setCurrent] = useState('');
  const holder = useRef<HTMLDivElement>(null);

  const run = useCallback(async () => {
    setRunning(true);
    setDone(false);
    setRows(EXPORT_ITEMS.map((i) => ({ id: i.id, status: 'pending' })));

    const canvas = document.createElement('canvas');
    canvas.width = STAGE;
    canvas.height = STAGE;
    holder.current?.replaceChildren(canvas);

    let root: ReconcilerRoot<HTMLCanvasElement> | null = null;
    try {
      root = createRoot(canvas);
      // configure() is async — it may be resolving a renderer. Rendering into an
      // unconfigured root gives you a store with no scene and an export of
      // nothing, which is indistinguishable from a model that failed to build.
      await root.configure({
        size: { width: STAGE, height: STAGE, top: 0, left: 0 },
        frameloop: 'never',
        gl: { antialias: false, preserveDrawingBuffer: false },
      });

      for (const item of EXPORT_ITEMS) {
        setCurrent(item.id);
        let note: string | undefined;
        let status: Row['status'] = 'fail';
        let bytes = 0;
        let meshes = 0;

        try {
          // Empty the shared root FIRST, and wait for it to actually empty.
          // The scene is reused across all thirty-eight models, so without this
          // the wait below is satisfied instantly by the previous model's meshes
          // and each entry exports its predecessor — under a name that says
          // otherwise, which nothing about the resulting file list would reveal.
          const cleared = root.render(null).getState();
          if (!(await waitUntil(() => countMeshes(cleared.scene) === 0))) {
            throw new Error('scene did not clear');
          }

          const store = root.render(<Model item={item} />);
          const state = store.getState();
          if (!state?.scene) throw new Error('no R3F root state');

          // Wait for the commit rather than sleeping a guessed amount. React 19
          // schedules concurrent work off the main task, and no fixed delay is
          // reliable — a flat 60ms exported an empty scene for the first two
          // desks and then started passing once the machine warmed up, which is
          // the worst failure mode available: an exporter that silently writes
          // fewer models on a slow run.
          if (!(await waitUntil(() => countMeshes(state.scene) > 0))) {
            throw new Error('no meshes produced');
          }

          // Step the clock by hand. Geometry exists after the commit, but
          // `useFrame` transforms land on the tick after it — exporting before
          // that catches creatures at their rest pose, limbs at the origin.
          for (let f = 0; f < 3; f++) {
            advance(performance.now() / 1000 + f * 0.016, true, state);
          }

          const group = bake(state.scene, item.id);
          meshes = group.children.length;
          if (meshes === 0) throw new Error('no meshes produced');

          const glb = await new Promise<ArrayBuffer>((resolve, reject) => {
            new GLTFExporter().parse(
              group,
              (result) => resolve(result as ArrayBuffer),
              (error) => reject(new Error(String(error))),
              { binary: true, onlyVisible: false }
            );
          });

          bytes = glb.byteLength;
          const res = await fetch(`/api/dev/export-glb?id=${encodeURIComponent(item.id)}`, {
            method: 'POST',
            headers: { 'content-type': 'application/octet-stream' },
            body: glb,
          });
          if (!res.ok) throw new Error(`write failed: ${res.status} ${await res.text()}`);
          status = 'ok';
        } catch (e) {
          note = e instanceof Error ? e.message : String(e);
        }

        setRows((prev) => prev.map((r) => (r.id === item.id ? { ...r, status, note, bytes, meshes } : r)));
      }
    } catch (e) {
      setRows((prev) => prev.map((r) => (r.status === 'pending' ? { ...r, status: 'fail', note: String(e) } : r)));
    } finally {
      try { root?.unmount(); } catch { /* already gone */ }
      holder.current?.replaceChildren();
      setRunning(false);
      setCurrent('');
      setDone(true);
    }
  }, []);

  const ok = rows.filter((r) => r.status === 'ok').length;
  const failed = rows.filter((r) => r.status === 'fail');

  return (
    <div style={{ padding: 20, background: '#16150f', color: '#e8e6dd', font: '13px ui-monospace, monospace', minHeight: '100vh' }}>
      <h1 style={{ font: 'bold 16px ui-monospace, monospace', margin: '0 0 12px' }}>GLB export · {EXPORT_ITEMS.length} models</h1>

      <button
        id="export-run"
        onClick={run}
        disabled={running}
        style={{ background: '#CCFF00', color: '#16150f', border: 0, padding: '8px 16px', font: 'bold 13px ui-monospace, monospace', cursor: 'pointer' }}
      >
        {running ? `Exporting… ${current}` : 'Export all'}
      </button>

      {/* The stage is off-layout on purpose: nothing measures it, so nothing can
          collapse it to zero and stall the run. */}
      <div ref={holder} style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', opacity: 0, pointerEvents: 'none' }} />

      <p id="export-status" data-done={done && !running ? 'yes' : 'no'} data-ok={ok} data-failed={failed.length} style={{ marginTop: 12 }}>
        {ok} written · {failed.length} failed · {rows.filter((r) => r.status === 'pending').length} pending
      </p>

      <table style={{ marginTop: 8, borderCollapse: 'collapse', width: '100%', maxWidth: 900 }}>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} style={{ borderBottom: '1px solid #2a2822' }}>
              <td style={{ padding: '3px 8px 3px 0', color: r.status === 'ok' ? '#CCFF00' : r.status === 'fail' ? '#ff6b6b' : '#7a7870' }}>
                {r.status === 'ok' ? '✓' : r.status === 'fail' ? '✕' : '·'}
              </td>
              <td style={{ padding: '3px 8px 3px 0' }}>{r.id}</td>
              <td style={{ padding: '3px 8px 3px 0', color: '#7a7870' }}>{r.meshes ? `${r.meshes} meshes` : ''}</td>
              <td style={{ padding: '3px 8px 3px 0', color: '#7a7870' }}>{r.bytes ? `${(r.bytes / 1024).toFixed(1)} kB` : ''}</td>
              <td style={{ padding: '3px 0', color: '#ff6b6b' }}>{r.note ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
