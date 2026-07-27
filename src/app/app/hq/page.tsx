'use client';

// Greenwood HQ — the plaza.
//
// Same shape as the Grounds page, which is the point: a region is a scene, a
// player, a door prompt and a map, and adding one should not invent a fourth way
// of doing any of those. What differs is entirely in lib/hq-map.
//
// Walking onto a threshold takes you through it — no confirm step, matching
// every other door in the game. The prompt survives only for a door that will
// NOT open, which right now is the tower: the lobby is declared in the region
// table and has no scene, so the gate refuses it with a sentence. That is
// deliberate. A building whose entrance you can see is one you can plan to get
// into, and "not yet" belongs in the region table rather than in a door that was
// never drawn.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Canvas } from '@react-three/fiber';
import { IsoRig } from '@/components/iso/IsoScene';
import type { DragState } from '@/components/iso/IsoBoard';
import HqScene from '@/components/iso/HqScene';
import RegionPlayer, { type RegionMap } from '@/components/iso/RegionPlayer';
import { ISO_OFFSET } from '@/components/iso/palette';
import { useOperation } from '@/lib/useOperation';
import { DEV_WALLET_BYPASS } from '@/lib/dev-mode';
import {
  ARRIVAL,
  BOUNDS,
  DOORS,
  doorAt,
  doorCells,
  isWalkable,
  type Doorway,
} from '@/lib/hq-map';
import WorldMap from '@/components/ui/WorldMap';
import { api, type RegionsResponse } from '@/lib/api-client';

/** Module-level: an inline literal makes R3F re-apply the camera every render. */
const CAMERA = { position: ISO_OFFSET, zoom: 26, near: -400, far: 600 } as const;

/** Everything RegionPlayer needs to know about this place, in one object. */
const MAP: RegionMap<Doorway> = {
  bounds: BOUNDS,
  isWalkable,
  doors: DOORS,
  doorAt,
  doorCells,
  doorId: (d) => d.id,
};

export default function HqPage() {
  const { wallet } = useOperation();
  const router = useRouter();
  const [regions, setRegions] = useState<RegionsResponse | null>(null);
  const [here, setHere] = useState<{ x: number; z: number }>({ ...ARRIVAL });
  const [door, setDoor] = useState<Doorway | null>(null);
  const [entering, setEntering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dragRef = useRef<DragState>({ dragging: false, moved: 0 });
  /** Live position for the camera, so it travels with the walk. */
  const livePos = useRef<{ x: number; z: number } | null>(null);

  const load = useCallback(() => {
    if (!wallet) return;
    void api.regions(wallet).then(setRegions).catch(() => setRegions(null));
  }, [wallet]);

  useEffect(() => { load(); }, [load]);

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
        setError(e instanceof Error ? e.message : 'That door did not open.');
        load();
      } finally {
        setEntering(false);
      }
    },
    [wallet, entering, router, load]
  );

  // An effect rather than a call inside onDoor: whether a door opens depends on
  // the region verdicts, which arrive asynchronously. See the Grounds page.
  useEffect(() => {
    if (!doorOpen || !door || entering) return;
    void enter(door);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doorOpen, door, entering]);

  if (!wallet && !DEV_WALLET_BYPASS) {
    return <div className="df-gate"><p>Connect your wallet to visit HQ.</p></div>;
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
          zoom={26}
          follow={here}
          followRef={livePos}
          // The tower is tall; pulling back far enough to see the whole plaza is
          // useful here in a way it is not on flat ground.
          minZoom={14}
        />
        <HqScene />
        {(wallet || DEV_WALLET_BYPASS) && (
          <RegionPlayer
            wallet={wallet ?? 'dev'}
            map={MAP}
            start={{ ...ARRIVAL }}
            // Facing the tower, which is north — the thing you came to look at.
            startFacing={Math.PI}
            dragRef={dragRef}
            onMove={onMove}
            onDoor={onDoor}
            positionRef={livePos}
          />
        )}
      </Canvas>

      <WorldMap wallet={wallet} at="greenwood-hq" position={here} />

      {/* A refusal, not a confirmation — an open door takes you through the
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
