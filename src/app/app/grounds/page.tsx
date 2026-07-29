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
import { Lock, Backpack } from '@phosphor-icons/react';
import { Canvas } from '@react-three/fiber';
import { IsoRig } from '@/components/iso/IsoScene';
import type { DragState } from '@/components/iso/IsoBoard';
import GroundsScene from '@/components/iso/GroundsScene';
import GroundsPlayer from '@/components/iso/GroundsPlayer';
import { ISO_OFFSET } from '@/components/iso/palette';
import { useOperation } from '@/lib/useOperation';
import { DEV_WALLET_BYPASS } from '@/lib/dev-mode';
import { allProps, ARRIVAL, BOUNDS, DOORS, type Doorway } from '@/lib/grounds-map';
import { type AxeId } from '@/lib/woodcutting';
import { rememberExit, takeArrival } from '@/components/iso/portals';
import WorldMap from '@/components/ui/WorldMap';
import NpcField from '@/components/iso/NpcField';
import TreeField from '@/components/iso/TreeField';
import NpcDialogue from '@/components/ui/NpcDialogue';
import { npcAt, type Npc } from '@/lib/npcs';
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
 * One full swing, in milliseconds. Matches CHOP_HZ in Character.
 *
 * The request is raced against this rather than simply awaited, so the axe
 * visibly lands before the tree changes. A chop that resolved the instant the
 * server answered would look like the tree fell because you looked at it.
 */
const CHOP_SWING_MS = 870;

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
  /** Who you are talking to. Null closes the panel. */
  const [talking, setTalking] = useState<Npc | null>(null);
  const [buying, setBuying] = useState(false);
  const [entering, setEntering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Shared with IsoRig so a pan that ends over a tile is not read as a click. */
  const dragRef = useRef<DragState>({ dragging: false, moved: 0 });
  /**
   * The character's live position, written every frame by Character.
   *
   * Kept out of React state on purpose. `here` below still exists — the door
   * prompt and the map want a tile, not a fractional position — but the CAMERA
   * reads this, so it travels with the walk instead of being told where the
   * character finished arriving once per waypoint.
   */
  const livePos = useRef<{ x: number; z: number } | null>(null);

  /**
   * Every tree the map puts in this region.
   *
   * Computed once — it is a pure function of the seed and never changes. What
   * changes is which of them are STANDING, and that is `felled` below.
   */
  const trees = useMemo(
    () => allProps().filter((p) => p.kind === 'tree').map((p) => ({ x: p.x, z: p.z, seed: p.seed })),
    []
  );

  /**
   * Stumps, from the server.
   *
   * Kept as the server's list rather than anything this client believes, so two
   * players in the same clearing see the same ground. `felled` is derived from
   * it for the scene, which needs a set to test membership against per tree.
   */
  const [stumps, setStumps] = useState<Array<{ id: string; x: number; z: number }>>([]);
  const felled = useMemo(() => new Set(stumps.map((s) => `${s.x}:${s.z}`)), [stumps]);

  const [axe, setAxe] = useState<AxeId | null>(null);
  /** The next rung, from the server. Null once the ladder is topped out. */
  const [nextAxe, setNextAxe] = useState<{ id: string; name: string; scripCost: number; blurb: string } | null>(null);
  const [buyingAxe, setBuyingAxe] = useState(false);
  /** The tile being felled. Drives both the swing and the busy tint. */
  const [chopping, setChopping] = useState<{ x: number; z: number } | null>(null);
  const [woodNote, setWoodNote] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!wallet) return;
    void api.regions(wallet).then(setRegions).catch(() => setRegions(null));
    void api
      .axe(wallet)
      .then((r) => {
        setAxe((r.axe?.id as AxeId) ?? null);
        setNextAxe(r.next);
      })
      .catch(() => setAxe(null));
  }, [wallet]);

  /**
   * Buy the next axe up, without leaving the conversation.
   *
   * Reloads rather than assuming: the server decides which rung is next, and
   * guessing here would mean a stale panel offering a tool that has already been
   * bought.
   */
  const buyAxe = useCallback(async () => {
    if (!wallet || !nextAxe || buyingAxe) return;
    setBuyingAxe(true);
    try {
      const result = await api.buyAxe(wallet, nextAxe.id);
      setWoodNote(`${result.tool.name} — you can work now.`);
      load();
    } catch (e) {
      setWoodNote(e instanceof Error ? e.message : 'She shakes her head.');
    } finally {
      setBuyingAxe(false);
    }
  }, [wallet, nextAxe, buyingAxe, load]);

  /**
   * Fell the tree that was clicked.
   *
   * The swing plays for its own duration BEFORE the request resolves, which is
   * deliberate: a chop that completed the instant the server answered would look
   * like the tree fell over because you looked at it. `CHOP_SWING_MS` is one full
   * cycle of the animation, so the axe visibly lands before anything changes.
   *
   * Errors are shown rather than swallowed — "your hatchet will not cut oak" is
   * the single most useful sentence in the whole skill, and it is the one that
   * sells the next axe.
   */
  const chop = useCallback(
    async (tree: { x: number; z: number }) => {
      if (!wallet || chopping) return;
      setChopping({ x: tree.x, z: tree.z });
      setWoodNote(null);
      try {
        const [result] = await Promise.all([
          api.chopTree(wallet, 'grounds', tree.x, tree.z),
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

  useEffect(() => { load(); }, [load]);

  /**
   * Stumps, on arrival and on a slow timer.
   *
   * Slow on purpose. A chop already returns the fresh list, so this only exists
   * to catch trees felled by OTHER players and ones that have quietly regrown —
   * neither of which is urgent, and both of which would be an odd thing to poll
   * hard for. Twenty seconds is under the fastest respawn, so a pine is never
   * missing for longer than it is actually down.
   */
  useEffect(() => {
    if (!wallet) return;
    let live = true;
    const pull = () => {
      void api
        .stumps(wallet, 'grounds')
        .then((r) => { if (live) setStumps(r.stumps); })
        .catch(() => {});
    };
    pull();
    const timer = setInterval(pull, 20_000);
    return () => { live = false; clearInterval(timer); };
  }, [wallet]);

  /** The note clears itself; one every few seconds would otherwise pile up. */
  useEffect(() => {
    if (!woodNote) return;
    const timer = setTimeout(() => setWoodNote(null), 3200);
    return () => clearTimeout(timer);
  }, [woodNote]);

  /**
   * Walking away ends the conversation.
   *
   * Without this the panel follows you across the map, which turns a person you
   * were talking to into a UI element that has detached from them.
   */
  const onMove = useCallback((cell: { x: number; z: number }) => {
    setHere(cell);
    setTalking((current) => (current && !npcAt('grounds', cell.x, cell.z) ? null : current));
  }, []);
  /**
   * Stepped onto a threshold.
   *
   * WALKING THROUGH IS WHAT OPENS A DOOR. There is no confirm step, and that
   * matches how the rooms have always worked — you walk into the Machine Room's
   * north door and you are on the Trading Floor. A button here made the Grounds
   * the one place in the game where a doorway asked permission first, which is
   * both inconsistent and a worse thing to do: the whole point of navigating in
   * the world is that arriving somewhere is a consequence of walking there.
   *
   * The prompt survives only for a door that will NOT open. A refusal has to be
   * read, and it is the one case where stopping the player is the correct
   * outcome rather than an extra click.
   */
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

  /** True while the door under the player is one they may actually walk through. */
  const doorOpen = door != null && (verdict == null || verdict.allowed);

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
   * Standing in an open doorway takes you through it.
   *
   * An effect rather than a call inside `onDoor`, because whether the door opens
   * depends on the region verdicts, which arrive asynchronously — a player who
   * walks onto a threshold before that response lands would otherwise be stuck
   * there until they stepped off and back on. This re-evaluates when either the
   * door or the verdict changes, so it fires as soon as both are known.
   *
   * `entering` guards it: setting state from inside the transition would
   * otherwise re-run this and post the same door twice.
   */
  useEffect(() => {
    if (!doorOpen || !door || entering) return;
    void enter(door);
    // `enter` is intentionally out of the dependency list — it closes over
    // `entering`, so including it would re-run this the instant the flag flips
    // and fire a second transition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doorOpen, door, entering]);

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
        <p>Connect your wallet to step outside.</p>
      </div>
    );
  }

  const pack = regions?.pack;

  return (
    <main className="df-page">
      {/*
        gl flags, in order of what they buy:

        powerPreference asks the browser for the discrete BNTY on dual-BNTY
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
        <IsoRig
          dragRef={dragRef}
          interactive
          bounds={WORLD}
          zoom={26}
          // Stops the player pulling back until the region is a small diamond
          // adrift in empty ground, which is the impression the tightened
          // bounds exist to avoid.
          minZoom={16}
          // `follow` is the fallback for the first frames, before the character
          // has written a live position; `followRef` takes over from then on.
          follow={here}
          followRef={livePos}
        />
        <GroundsScene felled={felled} />
        <NpcField region="grounds" playerAt={here} onTalk={setTalking} />
        <TreeField
          region="grounds"
          trees={trees}
          stumps={stumps}
          playerAt={here}
          axe={axe}
          busyAt={chopping}
          onChop={chop}
        />
        {(wallet || DEV_WALLET_BYPASS) && (
          <GroundsPlayer
            wallet={wallet ?? 'dev'}
            start={spawn}
            dragRef={dragRef}
            onMove={onMove}
            onDoor={onDoor}
            action={chopping ? 'chop' : 'idle'}
            positionRef={livePos}
          />
        )}
      </Canvas>

      {/* Where you are, and which way home. Not a nav rail — it never walks you
          anywhere, it just tells you what is next to what. See WorldMap. */}
      <WorldMap wallet={wallet} at="grounds" position={here} />

      {/*
        What the last swing was worth, or why it was refused.

        Above the HUD rail and away from the bottom-centre prompts, because it
        fires while you are standing at a tree and those fire while you are
        standing at a door — two things that must never cover each other. It
        clears itself, since a gathering skill produces one of these every few
        seconds and a log that piled up would become the loudest thing on screen.
      */}
      {woodNote && <div className="chop-note">{woodNote}</div>}

      {/* Which lines exist depends on Total Level, so the same five people say
          different things as you get further in. `regions` already carries it. */}
      <NpcDialogue
        npc={talking}
        totalLevel={regions?.totalLevel ?? 0}
        onClose={() => setTalking(null)}
        /*
         * Marta sells the axes, and only Marta.
         *
         * She is the Quartermaster and she already sells packs, so tools are
         * hers by the same logic — and putting the purchase inside the
         * conversation means the sentence that explains why you want one and the
         * button that gets you one are the same moment. A shop screen would make
         * a player leave the person who just told them about it.
         */
        action={
          talking?.id === 'marta' && nextAxe ? (
            <button className="npc-buy" onClick={() => void buyAxe()} disabled={buyingAxe}>
              {buyingAxe
                ? 'Handing it over…'
                : `Buy the ${nextAxe.name} · ${nextAxe.scripCost.toLocaleString()} Scrip`}
              <em>{nextAxe.blurb}</em>
            </button>
          ) : null
        }
      />

      {/*
        A REFUSAL, not a confirmation.

        This only appears for a door that will not open — an open one takes you
        through the moment you stand in it, so there is nothing to say about it.
        Being stopped is the one case where interrupting the player is the right
        outcome rather than an extra click, because the reason has to be read and
        the fix is usually something they can do right here.

        Hidden while talking: both live bottom-centre, and a refusal stacked on a
        conversation is two things shouting from one spot.
      */}
      {door && !doorOpen && !talking && (
        <div className="gr-door is-locked">
          <b>{door.label}</b>
          <span>{verdict?.reason ?? door.blurb}</span>

          {error && <em className="gr-door-error">{error}</em>}

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
