'use client';

// Evergreen HQ — the plaza.
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
import { playSfx } from '@/lib/sfx';
import { useRouter } from 'next/navigation';
import { Canvas } from '@react-three/fiber';
import { IsoRig } from '@/components/iso/IsoScene';
import { renderTier } from '@/components/iso/render-tier';
import type { DragState } from '@/components/iso/IsoBoard';
import HqScene from '@/components/iso/HqScene';
import RegionPlayer, { type RegionMap } from '@/components/iso/RegionPlayer';
import { ISO_OFFSET } from '@/components/iso/palette';
import { useOperation } from '@/lib/useOperation';
import { useRememberRegion } from '@/lib/last-region';
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
import NpcField from '@/components/iso/NpcField';
import NpcDialogue from '@/components/ui/NpcDialogue';
import { npcAt, type Npc } from '@/lib/npcs';
import WorldMap from '@/components/ui/WorldMap';
import LiftPanel from '@/components/ui/LiftPanel';
import { type Floor } from '@/lib/hq-floors';
import { api, type RegionsResponse } from '@/lib/api-client';
import PeerField from '@/components/iso/PeerField';
import { usePresenceIdentity } from '@/components/iso/usePresenceIdentity';
import { useWorldPresence } from '@/components/iso/useWorldPresence';

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
  // Recorded so the dashboard's one button can bring you straight back here
  // instead of to the Grounds. See lib/last-region.
  useRememberRegion(wallet, 'evergreen-hq');
  const router = useRouter();
  const [regions, setRegions] = useState<RegionsResponse | null>(null);
  const [here, setHere] = useState<{ x: number; z: number }>({ ...ARRIVAL });
  const [door, setDoor] = useState<Doorway | null>(null);
  const [entering, setEntering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dragRef = useRef<DragState>({ dragging: false, moved: 0 });
  /** Device render budget, read once per mount. See render-tier. */
  const tier = useMemo(() => renderTier(), []);
  /** Live position for the camera, so it travels with the walk. */
  const livePos = useRef<{ x: number; z: number } | null>(null);

  /** Everybody else on the plaza. See the note in the Grounds page. */
  const identity = usePresenceIdentity();
  const { peers } = useWorldPresence('evergreen-hq', identity, here);

  const load = useCallback(() => {
    if (!wallet) return;
    void api.regions(wallet).then(setRegions).catch(() => setRegions(null));
  }, [wallet]);

  useEffect(() => { load(); }, [load]);

  /** Who you are talking to. Null closes the panel. */
  const [talking, setTalking] = useState<Npc | null>(null);

  /*
   * Walking away ends the conversation — same rule as the Grounds.
   *
   * Without it the panel follows you across the plaza, which turns a person
   * you were talking to into a UI element that has detached from them.
   */
  const onMove = useCallback((cell: { x: number; z: number }) => {
    setHere(cell);
    setTalking((current) => (current && !npcAt('evergreen-hq', cell.x, cell.z) ? null : current));
  }, []);
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
        playSfx('door');
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

  /**
   * The tower door opens the LIFT, not a region.
   *
   * Every other threshold in this game leads to exactly one place, so walking
   * onto it can just take you there. The tower leads to a building with floors,
   * and which floor is a choice that cannot be made by the doorway — so standing
   * in it produces the directory instead.
   *
   * This is also why the lift panel does not violate the no-nav-rail rule: it is
   * unreachable from anywhere except standing at the lifts. A menu you can only
   * open by being somewhere is a place, not a menu.
   */
  const atLift = door?.id === 'lobby';

  // An effect rather than a call inside onDoor: whether a door opens depends on
  // the region verdicts, which arrive asynchronously. See the Grounds page.
  useEffect(() => {
    if (atLift || !doorOpen || !door || entering) return;
    void enter(door);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atLift, doorOpen, door, entering]);

  /**
   * Ride to a floor.
   *
   * Ends in the same enterRegion call a doorway does — the vertical move is a
   * different way of CHOOSING a destination, not a different way of arriving at
   * one. The gate, the quest signal and the arrival cell all behave identically.
   */
  const ride = useCallback(
    async (floor: Floor) => {
      if (!wallet || entering) return;
      setEntering(true);
      setError(null);
      try {
        playSfx('door');
        const result = await api.enterRegion(wallet, floor.region);
        router.push(result.region.href);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'That floor is not answering.');
        load();
      } finally {
        setEntering(false);
      }
    },
    [wallet, entering, router, load]
  );

  if (!wallet && !DEV_WALLET_BYPASS) {
    return <div className="df-gate"><p>Connect your wallet to visit HQ.</p></div>;
  }

  return (
    <main className="df-page">
      <Canvas
        orthographic
        camera={CAMERA}
        shadows
        dpr={tier.worldDpr}
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
        <PeerField peers={peers} />
        <NpcField region="evergreen-hq" playerAt={here} onTalk={setTalking} />
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

      <NpcDialogue npc={talking} totalLevel={regions?.totalLevel ?? 0} onClose={() => setTalking(null)} />

      <WorldMap wallet={wallet} at="evergreen-hq" position={here} />

      <LiftPanel
        open={atLift}
        at="evergreen-hq"
        regions={regions?.regions ?? []}
        busy={entering}
        error={error}
        onRide={(f) => void ride(f)}
        onClose={() => setDoor(null)}
      />

      {/* A refusal, not a confirmation — an open door takes you through the
          moment you stand in it. */}
      {door && !atLift && !doorOpen && (
        <div className="gr-door is-locked">
          <b>{door.label}</b>
          <span>{verdict?.reason ?? door.blurb}</span>
          {error && <em className="gr-door-error">{error}</em>}
        </div>
      )}
    </main>
  );
}
