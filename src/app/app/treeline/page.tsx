'use client';

// The Treeline — the rung between the settlement and the turn.
//
// Built on RegionPlayer rather than its own movement component, which is the
// whole reason this page is short: a region is a scene, a player, a door prompt
// and a map, and adding one should not invent a fourth way of doing any of them.
// What differs is entirely in lib/treeline-map.
//
// MOVEMENT IS CLIENT-SIDE HERE, like the Grounds and unlike the Deep Forest.
// The rule is that the server owns anything CONTESTED, and this region has
// hostiles but no PvP and no loot piles — nothing another player can take from
// you, so nothing worth cheating your position for. Felling is still validated
// server-side because a tree IS contested: two players can reach for the same
// black pine.
//
// The moment loot lands here, this has to move to the expedition model.
// lib/treeline-map is already written to that contract.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Canvas } from '@react-three/fiber';
import { IsoRig } from '@/components/iso/IsoScene';
import type { DragState } from '@/components/iso/IsoBoard';
import TreelineScene from '@/components/iso/TreelineScene';
import RegionPlayer, { type RegionMap } from '@/components/iso/RegionPlayer';
import TreeField from '@/components/iso/TreeField';
import { ISO_OFFSET } from '@/components/iso/palette';
import { useOperation } from '@/lib/useOperation';
import { DEV_WALLET_BYPASS } from '@/lib/dev-mode';
import {
  ARRIVAL,
  BOUNDS,
  DOORS,
  allProps,
  doorAt,
  doorCells,
  isWalkable,
  type Doorway,
} from '@/lib/treeline-map';
import { type AxeId } from '@/lib/woodcutting';
import WorldMap from '@/components/ui/WorldMap';
import { api, type RegionsResponse } from '@/lib/api-client';

/** Module-level: an inline literal makes R3F re-apply the camera every render. */
const CAMERA = { position: ISO_OFFSET, zoom: 28, near: -400, far: 600 } as const;

/** One full swing, matching CHOP_HZ in Character. */
const CHOP_SWING_MS = 870;

const MAP: RegionMap<Doorway> = {
  bounds: BOUNDS,
  isWalkable,
  doors: DOORS,
  doorAt,
  doorCells,
  doorId: (d) => d.id,
};

export default function TreelinePage() {
  const { wallet } = useOperation();
  const router = useRouter();
  const [regions, setRegions] = useState<RegionsResponse | null>(null);
  const [here, setHere] = useState<{ x: number; z: number }>({ ...ARRIVAL });
  const [door, setDoor] = useState<Doorway | null>(null);
  const [entering, setEntering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dragRef = useRef<DragState>({ dragging: false, moved: 0 });
  const livePos = useRef<{ x: number; z: number } | null>(null);

  const trees = useMemo(
    () => allProps().filter((p) => p.kind === 'tree').map((p) => ({ x: p.x, z: p.z, seed: p.seed })),
    []
  );
  const [stumps, setStumps] = useState<Array<{ id: string; x: number; z: number }>>([]);
  const felled = useMemo(() => new Set(stumps.map((s) => `${s.x}:${s.z}`)), [stumps]);
  const [axe, setAxe] = useState<AxeId | null>(null);
  const [chopping, setChopping] = useState<{ x: number; z: number } | null>(null);
  const [woodNote, setWoodNote] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!wallet) return;
    void api.regions(wallet).then(setRegions).catch(() => setRegions(null));
  }, [wallet]);

  useEffect(() => { load(); }, [load]);

  /** Stumps and the axe. The slow poll catches other players' work and regrowth. */
  useEffect(() => {
    if (!wallet) return;
    let live = true;
    void api.axe(wallet).then((r) => { if (live) setAxe((r.axe?.id as AxeId) ?? null); }).catch(() => {});
    const pull = () => {
      void api.stumps(wallet, 'treeline').then((r) => { if (live) setStumps(r.stumps); }).catch(() => {});
    };
    pull();
    const timer = setInterval(pull, 20_000);
    return () => { live = false; clearInterval(timer); };
  }, [wallet]);

  useEffect(() => {
    if (!woodNote) return;
    const timer = setTimeout(() => setWoodNote(null), 3200);
    return () => clearTimeout(timer);
  }, [woodNote]);

  const onMove = useCallback((cell: { x: number; z: number }) => setHere(cell), []);
  const onDoor = useCallback((d: Doorway | null) => { setDoor(d); setError(null); }, []);

  const verdict = useMemo(
    () => (door ? regions?.regions.find((r) => r.id === door.region) ?? null : null),
    [door, regions]
  );
  const doorOpen = door != null && (verdict == null || verdict.allowed);

  const enter = useCallback(
    async (target: Doorway) => {
      if (!wallet) { router.push(target.href); return; }
      if (entering) return;
      setEntering(true);
      setError(null);
      try {
        const result = await api.enterRegion(wallet, target.region);
        router.push(result.region.href);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'That gate did not open.');
        load();
      } finally {
        setEntering(false);
      }
    },
    [wallet, entering, router, load]
  );

  // An effect, because whether a door opens depends on verdicts that arrive
  // asynchronously — see the Grounds page for the full reasoning.
  useEffect(() => {
    if (!doorOpen || !door || entering) return;
    void enter(door);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doorOpen, door, entering]);

  /**
   * Fell the tree that was clicked.
   *
   * The request is RACED against the swing rather than awaited, so the axe
   * visibly lands before the tree changes.
   */
  const chop = useCallback(
    async (tree: { x: number; z: number }) => {
      if (!wallet || chopping) return;
      setChopping({ x: tree.x, z: tree.z });
      setWoodNote(null);
      try {
        const [result] = await Promise.all([
          api.chopTree(wallet, 'treeline', tree.x, tree.z),
          new Promise((r) => setTimeout(r, CHOP_SWING_MS)),
        ]);
        setStumps(result.stumps);
        setWoodNote(`+${result.logs} ${result.species} · +${result.xp} scouting`);
      } catch (e) {
        setWoodNote(e instanceof Error ? e.message : 'That did not come down.');
      } finally {
        setChopping(null);
      }
    },
    [wallet, chopping]
  );

  if (!wallet && !DEV_WALLET_BYPASS) {
    return <div className="df-gate"><p>Connect your wallet to go past the fence.</p></div>;
  }

  return (
    <main className="df-page">
      <Canvas
        orthographic
        camera={CAMERA}
        shadows
        dpr={[1, 1.75]}
        gl={{ powerPreference: 'high-performance', antialias: false, stencil: false, depth: true }}
      >
        <IsoRig
          dragRef={dragRef}
          interactive
          bounds={BOUNDS}
          zoom={28}
          follow={here}
          followRef={livePos}
          minZoom={16}
        />
        <TreelineScene felled={felled} />
        <TreeField
          region="treeline"
          trees={trees}
          stumps={stumps}
          playerAt={here}
          axe={axe}
          busyAt={chopping}
          onChop={chop}
        />
        {(wallet || DEV_WALLET_BYPASS) && (
          <RegionPlayer
            wallet={wallet ?? 'dev'}
            map={MAP}
            start={{ ...ARRIVAL }}
            // Facing east, down the track — the way the region runs.
            startFacing={Math.PI / 2}
            dragRef={dragRef}
            onMove={onMove}
            onDoor={onDoor}
            action={chopping ? 'chop' : 'idle'}
            positionRef={livePos}
          />
        )}
      </Canvas>

      <WorldMap wallet={wallet} at="treeline" position={here} />

      {woodNote && <div className="chop-note">{woodNote}</div>}

      {/* A refusal, not a confirmation — an open gate takes you through the
          moment you stand in it. */}
      {door && !doorOpen && (
        <div className="gr-door is-locked">
          <b>{door.label}</b>
          <span>{verdict?.reason ?? door.blurb}</span>
          {error && <em className="gr-door-error">{error}</em>}
        </div>
      )}
    </main>
  );
}
