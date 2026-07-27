'use client';

// Greenwood Grounds — the hub.
//
// This page is the game's navigation. There is no nav rail and no dock by
// design (CLAUDE.md), which for a long time meant there was no navigation at
// all: the Deep Forest existed, was tested, and was reachable only by typing its
// URL. Doors are things you walk to, and this is where they are.
//
// The doorway prompt is the whole interaction and it does three things in one
// place, deliberately:
//
//   OPEN   — walk through.
//   LOCKED — say what is missing, in the sentence lib/regions already wrote.
//   FIX IT — if what is missing is a pack, sell one HERE.
//
// That last one matters more than it looks. Sending a player to a shop screen to
// buy the thing that unlocks the door they are standing at is the exact
// navigate-away-and-lose-the-thread failure the whole no-nav-rail rule exists to
// prevent. The gate says what you need and hands it to you.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Lock, Backpack } from '@phosphor-icons/react';
import { Canvas } from '@react-three/fiber';
import { IsoRig } from '@/components/iso/IsoScene';
import type { DragState } from '@/components/iso/IsoBoard';
import GroundsScene from '@/components/iso/GroundsScene';
import GroundsPlayer from '@/components/iso/GroundsPlayer';
import { ISO_OFFSET } from '@/components/iso/palette';
import { useOperation } from '@/lib/useOperation';
import { DEV_WALLET_BYPASS } from '@/lib/dev-mode';
import { ARRIVAL, BOUNDS, DOORS, type Doorway } from '@/lib/grounds-map';
import { rememberExit, takeArrival } from '@/components/iso/portals';
import WorldMap from '@/components/ui/WorldMap';
import { api, type RegionsResponse } from '@/lib/api-client';

/**
 * How far out of a doorway you land.
 *
 * Two tiles, because DOOR_RADIUS is one: spawn on the threshold itself and the
 * prompt for the door you just walked out of is the first thing you see, asking
 * whether you would like to go back in.
 */
const DOOR_INSET = 2;

/**
 * Where the player appears.
 *
 * The rooms store which door they left by (see components/iso/portals), and this
 * consumes it — you come back out of the door you went in through rather than
 * being teleported to the edge of the map. `takeArrival` clears the value, so a
 * later reload spawns normally instead of re-entering.
 *
 * Read in a lazy initialiser rather than an effect: sessionStorage is only
 * available in the browser, and consuming it twice would give the second read
 * nothing.
 */
function spawnCell(): { x: number; z: number } {
  if (typeof window === 'undefined') return { ...ARRIVAL };
  const from = takeArrival();
  const door = from ? DOORS.find((d) => d.id === from) : null;
  // Outward is +Z for every door here: the settlement is at the south end, so
  // leaving a building and returning from the Treeline are both southward.
  return door ? { x: door.x, z: door.z + DOOR_INSET } : { ...ARRIVAL };
}

/** Module-level: an inline literal makes R3F re-apply the camera every render. */
const CAMERA = { position: ISO_OFFSET, zoom: 26, near: -400, far: 600 } as const;

/**
 * The playable rectangle, so IsoRig frames the world rather than a room.
 *
 * An explicit `zoom` rides alongside: IsoRig's default is to fit the entire
 * bounds on mount, which drops the player to a speck on a map this size. Rooms
 * want to be seen whole; a world wants to be walked.
 */
const WORLD = BOUNDS;

export default function GroundsPage() {
  const { wallet } = useOperation();
  const router = useRouter();
  const [regions, setRegions] = useState<RegionsResponse | null>(null);
  const [spawn] = useState(spawnCell);
  const [here, setHere] = useState<{ x: number; z: number }>(spawn);
  const [door, setDoor] = useState<Doorway | null>(null);
  const [buying, setBuying] = useState(false);
  const [entering, setEntering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Shared with IsoRig so a pan that ends over a tile is not read as a click. */
  const dragRef = useRef<DragState>({ dragging: false, moved: 0 });

  const load = useCallback(() => {
    if (!wallet) return;
    void api.regions(wallet).then(setRegions).catch(() => setRegions(null));
  }, [wallet]);

  useEffect(() => { load(); }, [load]);

  const onMove = useCallback((cell: { x: number; z: number }) => setHere(cell), []);
  const onDoor = useCallback((d: Doorway | null) => {
    setDoor(d);
    setError(null);
  }, []);

  /**
   * The server's verdict on the door being stood in.
   *
   * Read from the regions response rather than recomputed here. `canEnter` is
   * pure and the client COULD answer it, but then there would be two answers to
   * "may I be here" and they would eventually differ — which is the failure the
   * region table exists to prevent. This is a courtesy display of the fact; the
   * route being navigated to checks again for itself.
   */
  const verdict = useMemo(
    () => (door ? regions?.regions.find((r) => r.id === door.region) ?? null : null),
    [door, regions]
  );

  /**
   * Go through.
   *
   * Asks the server first, then navigates. The destination route checks the gate
   * for itself, so this is not what protects it — what the call buys is the
   * REFUSAL arriving at the door instead of on the far side, and going outside
   * being an event the introduction can see rather than a URL change nothing
   * observes.
   *
   * A failure leaves the player standing at the door with the reason on it,
   * which is the correct place to be told no.
   */
  const enter = useCallback(
    async (target: Doorway) => {
      if (!wallet || entering) {
        // No wallet means the dev bypass is carrying the page. Nothing to record
        // and nothing to check, so just go.
        if (!wallet) router.push(target.href);
        return;
      }
      setEntering(true);
      setError(null);
      try {
        const result = await api.enterRegion(wallet, target.region);
        // Tell the destination which door to put us at, so we walk in through
        // the matching threshold rather than materialising in the middle of the
        // room. Set only after the gate said yes — remembering an exit we were
        // refused would place us oddly the next time we did get in.
        if (target.arriveAt) rememberExit(target.arriveAt);
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
   * Buy the pack the gate is asking for, without leaving the gate.
   *
   * Reloads the region verdicts rather than assuming success unlocked anything —
   * a Satchel opens the Treeline, but the same button at a higher tier does not
   * open the Deep Forest, and guessing which would be inventing a rule the
   * server owns.
   */
  const buyPack = useCallback(async () => {
    if (!wallet || buying) return;
    setBuying(true);
    setError(null);
    try {
      await api.upgradePack(wallet);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not go through.');
    } finally {
      setBuying(false);
    }
  }, [wallet, buying, load]);

  if (!wallet && !DEV_WALLET_BYPASS) {
    return (
      <div className="df-gate">
        <p>Connect a fund to step outside.</p>
      </div>
    );
  }

  const pack = regions?.pack;

  return (
    <main className="df-page">
      {/*
        gl flags, in order of what they buy:

        powerPreference asks the browser for the discrete GPU on dual-GPU
        laptops — without it a machine with a real card can quietly render this
        on integrated graphics.

        antialias is OFF deliberately. The art is flat-shaded blocks with hard
        silhouettes, so MSAA costs a full extra resolve every frame to soften
        edges the style wants sharp; the dpr ceiling does more for edge quality
        here than MSAA would, for less.
      */}
      <Canvas
        orthographic
        camera={CAMERA}
        shadows
        dpr={[1, 1.75]}
        gl={{ powerPreference: 'high-performance', antialias: false, stencil: false, depth: true }}
      >
        {/* The same rig every other region uses: hold left-click to pan, wheel
            to zoom, and a dragRef so releasing after a pan is not also a click
            on the tile underneath. `follow` glides back to the player on
            release — the map is far larger than the viewport, and a camera
            parked wherever you last dragged it means walking off the edge of
            your own view. */}
        <IsoRig dragRef={dragRef} interactive bounds={WORLD} zoom={26} follow={here} />
        <GroundsScene />
        {(wallet || DEV_WALLET_BYPASS) && (
          <GroundsPlayer
            wallet={wallet ?? 'dev'}
            start={spawn}
            dragRef={dragRef}
            onMove={onMove}
            onDoor={onDoor}
          />
        )}
      </Canvas>

      {/* Where you are, and which way home. Not a nav rail — it never walks you
          anywhere, it just tells you what is next to what. See WorldMap. */}
      <WorldMap wallet={wallet} at="grounds" />

      {/* Standing in a doorway. Contextual, because a HUD that always shows
          every action teaches players to stop reading it. */}
      {door && (
        <div className={`gr-door${verdict && !verdict.allowed ? ' is-locked' : ''}`}>
          <b>{door.label}</b>
          <span>{verdict && !verdict.allowed ? verdict.reason : door.blurb}</span>

          {error && <em className="gr-door-error">{error}</em>}

          {/* Open: go through. */}
          {(!verdict || verdict.allowed) && (
            <button className="gr-door-go" onClick={() => void enter(door)} disabled={entering}>
              {entering ? '…' : <>Enter <ArrowRight size={13} weight="bold" /></>}
            </button>
          )}

          {/* Locked on a pack, and one is affordable: sell it here. */}
          {verdict?.code === 'pack' && pack?.nextTier && (
            <button className="gr-door-go" onClick={buyPack} disabled={buying}>
              {buying ? (
                '…'
              ) : (
                <>
                  <Backpack size={14} weight="duotone" /> Buy a {pack.nextTier.name} ·{' '}
                  {pack.nextTier.scripCost.toLocaleString()} Scrip
                </>
              )}
            </button>
          )}

          {/* Locked on something that cannot be bought at a gate — a level, or a
              desk that has to be raised. Nothing to sell here, so point at where
              the work happens rather than leaving a dead end. Both routes go to
              the fund, but the label has to name the right one: "come back at
              level 10" and "raise a desk to level 8" are different jobs and
              telling a player the wrong one costs them a session. */}
          {(verdict?.code === 'level' || verdict?.code === 'desk') && (
            <Link className="gr-door-go is-quiet" href="/app">
              <Lock size={13} weight="bold" />{' '}
              {verdict.code === 'desk' ? 'Go and level a desk' : 'Back to the fund'}
            </Link>
          )}
        </div>
      )}
    </main>
  );
}
