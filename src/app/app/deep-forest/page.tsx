'use client';

// The Deep Forest, as a place you can stand in.
//
// Gated on the region check, with one exception: the dev wallet bypass also
// opens the gate. Without that, nobody can look at the zone until the level and
// pack systems are fully wired through the UI, and a scene nobody can open is a
// scene that rots. DEV_WALLET is null in every production build, so the gate is
// real everywhere it matters.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { playSfx } from '@/lib/sfx';
import Link from 'next/link';
import { X } from '@phosphor-icons/react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { IsoRig } from '@/components/iso/IsoScene';
import { renderTier } from '@/components/iso/render-tier';
import { EXTENT } from '@/lib/deep-forest-map';
import type { DragState } from '@/components/iso/IsoBoard';
import DeepForestScene from '@/components/iso/DeepForestScene';
import DeepForestPlayer from '@/components/iso/DeepForestPlayer';
import { ISO, ISO_OFFSET } from '@/components/iso/palette';
import { useOperation } from '@/lib/useOperation';
import { useRememberRegion } from '@/lib/last-region';
import { DEV_WALLET_BYPASS } from '@/lib/dev-mode';
import {
  api,
  type CreatureView,
  type ExpeditionState,
  type PlayerView,
  type RegionsResponse,
  type VisiblePile,
} from '@/lib/api-client';
import { gateAt, allProps as forestProps } from '@/lib/deep-forest-map';
import { type AxeId } from '@/lib/woodcutting';
import CreatureField from '@/components/iso/CreatureField';
import NpcField from '@/components/iso/NpcField';
import NpcDialogue from '@/components/ui/NpcDialogue';
import { npcAt, type Npc } from '@/lib/npcs';
import TreeField from '@/components/iso/TreeField';
import PlayerField from '@/components/iso/PlayerField';
import ExpeditionHud from '@/components/ui/ExpeditionHud';
import WorldMap from '@/components/ui/WorldMap';

/** Module-level: an inline literal makes R3F re-apply the camera every render. */
const CAMERA = { position: ISO_OFFSET, zoom: 30, near: -400, far: 600 } as const;

/**
 * The whole map, so IsoRig clamps panning to the world rather than to a room.
 *
 * An explicit `zoom` is passed alongside it: IsoRig's default behaviour is to
 * frame the entire bounds on mount, which for a 93x93 map would drop the player
 * to a speck. Rooms want to be seen whole; a world wants to be walked.
 */
const BOUNDS = { minX: -EXTENT, maxX: EXTENT, minZ: -EXTENT, maxZ: EXTENT } as const;

/** A dropped pack's contents, on the ground. Readable only from beside it. */
function Pile({ pile }: { pile: VisiblePile }) {
  return (
    <group position={[pile.x, 0, pile.z]}>
      <mesh position={[0, 0.16, 0]} castShadow>
        <boxGeometry args={[0.62, 0.32, 0.44]} />
        <meshStandardMaterial color="#4a4034" flatShading roughness={0.95} />
      </mesh>
      {/* Lit only once the viewer is close enough for contents to have been
          sent. An unreadable pile is still visible — you can see that something
          is there, which is what makes walking over to it a decision. */}
      <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.55, 0.7, 4, 1, Math.PI / 4]} />
        <meshBasicMaterial
          color={pile.readable ? ISO.accent : '#8a8378'}
          transparent
          opacity={pile.readable ? 0.75 : 0.3}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

export default function DeepForestPage() {
  const { wallet } = useOperation();
  // Recorded so the dashboard's one button can bring you straight back here
  // instead of to the Grounds. See lib/last-region.
  useRememberRegion(wallet, 'deep-forest');
  const [state, setState] = useState<ExpeditionState | null>(null);
  const [piles, setPiles] = useState<VisiblePile[]>([]);
  const [creatures, setCreatures] = useState<CreatureView[]>([]);

  /**
   * Woodcutting, out where it is worth doing.
   *
   * Same shape as the Grounds, with one difference that matters: this region is
   * CONTESTED, so the reach check on the server reads the recorded expedition
   * position rather than trusting anything sent from here. A client that could
   * name its own position could fell every ironbark on the map without moving.
   */
  const trees = useMemo(
    () => forestProps().filter((p) => p.kind === 'tree').map((p) => ({ x: p.x, z: p.z, seed: p.seed })),
    []
  );
  const [stumps, setStumps] = useState<Array<{ id: string; x: number; z: number }>>([]);
  const felled = useMemo(() => new Set(stumps.map((s) => `${s.x}:${s.z}`)), [stumps]);
  const [axe, setAxe] = useState<AxeId | null>(null);
  const [chopping, setChopping] = useState<{ x: number; z: number } | null>(null);
  const [woodNote, setWoodNote] = useState<string | null>(null);
  const [players, setPlayers] = useState<PlayerView[]>([]);
  const [health, setHealth] = useState<number | null>(null);
  const [position, setPosition] = useState<{ x: number; z: number } | null>(null);
  /**
   * Gates the player has dismissed the prompt at.
   *
   * Keyed by gate name rather than a single boolean: dismissing the South Gate
   * should not silence the North one, and walking back to a gate you dismissed
   * should not re-nag. Cleared on leaving the zone with the rest of the state.
   */
  const [dismissed, setDismissed] = useState<string[]>([]);
  /** Shared with IsoRig so a pan that ends over a tile is not read as a click. */
  const dragRef = useRef<DragState>({ dragging: false, moved: 0 });
  /** Device render budget, read once per mount. See render-tier. */
  const tier = useMemo(() => renderTier(), []);
  /** Live character position for the camera. See IsoRig's `followRef`. */
  const livePos = useRef<{ x: number; z: number } | null>(null);

  useEffect(() => {
    if (!wallet) return;
    void api
      .expeditionState(wallet)
      .then((s) => {
        setState(s);
        setPiles(s.piles);
        setCreatures(s.creatures);
        setPlayers(s.players);
        setHealth(s.health);
        setPosition(s.position);
      })
      .catch(() => setState(null));
  }, [wallet]);

  /*
   * Total Level, purely so the two people at the gate say the right things.
   *
   * Every other region already had this to hand for its door prompts; this one
   * never needed it, because the gate that let you out here had already been
   * checked server-side. Fetching it rather than assuming a high level keeps
   * one definition of which lines a player has earned.
   */
  const [regions, setRegions] = useState<RegionsResponse | null>(null);
  useEffect(() => {
    if (!wallet) return;
    void api.regions(wallet).then(setRegions).catch(() => setRegions(null));
  }, [wallet]);

  /** Who you are talking to. Null closes the panel. */
  const [talking, setTalking] = useState<Npc | null>(null);

  /* Walking away ends it, same as everywhere else — and out here it matters
     more, because a dialogue panel left open over a zone with hostiles in it
     is covering the thing you need to be looking at. */
  const onMove = useCallback((cell: { x: number; z: number }) => {
    setPosition(cell);
    setTalking((current) => (current && !npcAt('deep-forest', cell.x, cell.z) ? null : current));
  }, []);
  const onPiles = useCallback((next: VisiblePile[]) => setPiles(next), []);
  const onCreatures = useCallback((next: CreatureView[]) => setCreatures(next), []);
  const onPlayers = useCallback((next: PlayerView[]) => setPlayers(next), []);

  /**
   * Swing at another player.
   *
   * Entering the zone is the consent, so there is no flag to check here — the
   * gate said so on the way in. The whole world comes back because a kill
   * changes all of it at once: their body is gone and a pile is on the ground
   * where they stood.
   */
  const onStrike = useCallback(
    (target: string) => {
      if (!wallet) return;
      void api
        .strike(wallet, target)
        .then((r) => {
          setPlayers(r.players);
          setCreatures(r.creatures);
          setPiles(r.piles);
          setHealth(r.health);
        })
        .catch(() => {});
    },
    [wallet]
  );

  /**
   * Swing at a creature.
   *
   * The server decides everything — whether you are in range, what the hit is
   * worth, and whether it hits back — and returns the whole creature list, so a
   * kill disappears immediately rather than on the next poll.
   */
  /**
   * The health the last response reported.
   *
   * A ref rather than the state, because onAttack is memoised on [wallet] and
   * would otherwise compare against whatever health was current when the
   * callback was built — which after the first bite is permanently stale, and
   * would either play the hurt cue forever or never again.
   */
  const healthRef = useRef(100);

  const onAttack = useCallback(
    (id: string) => {
      if (!wallet) return;
      // The swing is heard immediately; whether it CONNECTED is the server's
      // answer, and the two are separate sounds for a reason — a hit you gave
      // and a hit you took have to be told apart without looking, which is the
      // whole job of the strike/hurt pair.
      playSfx('strike');
      void api
        .attack(wallet, id)
        .then((r) => {
          // Health only ever falls out here, so a drop is a bite landing.
          if (r.health < healthRef.current) playSfx('hurt');
          healthRef.current = r.health;
          setCreatures(r.creatures);
          setHealth(r.health);
          // A bite can kill. The server has already spilled the pack and moved
          // us back to the gate, so re-read rather than guessing at any of it.
          if (r.died) void api.expeditionState(wallet).then((s) => {
            setState(s);
            setPiles(s.piles);
            setPosition(s.position);
            setHealth(s.health);
          });
        })
        .catch(() => {});
    },
    [wallet]
  );

  /**
   * One full swing, matching CHOP_HZ in Character.
   *
   * The request is RACED against this rather than awaited, so the axe visibly
   * lands before the tree changes. Resolving the instant the server answered
   * looked like the tree fell because you looked at it.
   */
  const chop = useCallback(
    async (tree: { x: number; z: number }) => {
      if (!wallet || chopping) return;
      setChopping({ x: tree.x, z: tree.z });
      setWoodNote(null);
      // On the swing, not on the answer. The request is already raced against
      // CHOP_SWING_MS so the axe lands on time; a thud that waited for the
      // network would arrive after the animation that earned it.
      playSfx('chop');
      try {
        const [result] = await Promise.all([
          api.chopTree(wallet, 'deep-forest', tree.x, tree.z),
          new Promise((r) => setTimeout(r, 870)),
        ]);
        playSfx('timber');
        setStumps(result.stumps);
        setWoodNote(`+${result.logs} ${result.species} · +${result.xp} scouting`);
      } catch (e) {
        playSfx('error');
        setWoodNote(e instanceof Error ? e.message : 'That did not come down.');
      } finally {
        setChopping(null);
      }
    },
    [wallet, chopping]
  );

  /** Stumps, and what this fund carries. Slow poll catches other players' work. */
  useEffect(() => {
    if (!wallet) return;
    let live = true;
    void api.axe(wallet).then((r) => { if (live) setAxe((r.axe?.id as AxeId) ?? null); }).catch(() => {});
    const pull = () => {
      void api.stumps(wallet, 'deep-forest').then((r) => { if (live) setStumps(r.stumps); }).catch(() => {});
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

  const open = useMemo(() => DEV_WALLET_BYPASS || state?.allowed === true, [state]);

  // The bypass short-circuits the connect prompt as well as the region gate.
  if (!wallet && !DEV_WALLET_BYPASS) {
    return <div className="df-gate"><p>Connect your wallet to go outside.</p></div>;
  }

  if (state && !open) {
    return (
      <div className="df-gate">
        <span className="df-gate-kicker">The Deep Forest</span>
        <p>{state.reason}</p>
        {/* Back to the GROUNDS, not to /app.
            This screen is what a player sees when they reach for a region they
            cannot enter yet, and its only action used to be a link to the
            dashboard — so being told "come back at level 10" ended with the
            game closing. The Grounds are the hub every outdoor region hangs
            off; sending them there leaves them standing in Evergreen with the
            other doors in front of them, which is the correct answer to a door
            that will not open. */}
        <Link className="btn-secondary" href="/app/grounds">Back to the Grounds</Link>
      </div>
    );
  }

  const here = position ?? state?.position ?? { x: 0, z: 43 };
  const onGate = gateAt(here.x, here.z);
  const readable = piles.find((p) => p.readable);

  return (
    <main className="df-page">
      {/*
        gl flags, in order of what they buy:

        powerPreference asks the browser for the discrete GREEN on dual-GREEN
        laptops — without it a machine with a real card can quietly render this
        on integrated graphics.

        antialias is OFF deliberately. The art is flat-shaded blocks with hard
        silhouettes, so MSAA costs a full extra resolve every frame to soften
        edges the style wants sharp. The dpr ceiling of 1.75 does more for edge
        quality here than MSAA would, for less.

        A dpr FLOOR of 1 and a ceiling below the device ratio is the standard
        resolution guard: a 3x phone would otherwise render nine times the
        pixels of a 1x screen for a scene nobody is inspecting at that density.
      */}
      <Canvas
        orthographic
        camera={CAMERA}
        shadows
        dpr={tier.worldDpr}
        gl={{ powerPreference: 'high-performance', antialias: false, stencil: false, depth: true }}
      >
        {/*
          The same rig every other room uses: hold left-click to pan, wheel to
          zoom, and a dragRef so releasing after a pan does not also count as a
          click on the tile underneath.

          This was a bespoke camera before — a fixed transform that recentred on
          the player, plus a hand-rolled wheel handler. It made the one zone
          where the controls should feel most familiar the one zone where they
          did not, and it is the reason clicks kept resolving to the wrong tile:
          the recentring group meant world coordinates were offset from map
          coordinates, so every hit had to be converted and every conversion was
          another chance to get it wrong. With the shared rig there is no offset
          at all — world x/z ARE map x/z.
        */}
        <IsoRig
          dragRef={dragRef}
          interactive
          bounds={BOUNDS}
          zoom={30}
          follow={here}
          followRef={livePos}
        />
        <DeepForestScene felled={felled} />
        {piles.map((p) => (
          <Pile key={p.id} pile={p} />
        ))}
        {/* Trees within reach become click targets. This is where the axe ladder
            pays off — oak, black pine and ironbark only grow out here. */}
        <TreeField
          region="deep-forest"
          trees={trees}
          stumps={stumps}
          playerAt={here}
          axe={axe}
          busyAt={chopping}
          onChop={chop}
        />
        {/* Two of them, at the south gate. See the note in lib/npcs — a crowd
            out here would undo the one region whose point is that it is empty. */}
        <NpcField region="deep-forest" playerAt={here} onTalk={setTalking} />
        {/* Both fields take the weapon as well as the position: what is in your
            hand decides how far a swing carries, so it also decides which of
            these light up when you point at them. */}
        <CreatureField
          creatures={creatures}
          playerAt={here}
          weapon={state?.weapon ?? null}
          onAttack={onAttack}
        />
        <PlayerField
          players={players}
          playerAt={here}
          weapon={state?.weapon ?? null}
          onStrike={onStrike}
        />
        {wallet && state && (
          <DeepForestPlayer
            wallet={wallet}
            start={state.position}
            dragRef={dragRef}
            onMove={onMove}
            onPiles={onPiles}
            onCreatures={onCreatures}
            onPlayers={onPlayers}
            action={chopping ? 'chop' : 'idle'}
            weapon={state.weapon}
            positionRef={livePos}
          />
        )}
      </Canvas>

      <NpcDialogue npc={talking} totalLevel={regions?.totalLevel ?? 0} onClose={() => setTalking(null)} />

      {/* What the last swing was worth, or why it was refused. */}
      {woodNote && <div className="chop-note">{woodNote}</div>}

      {state && (
        <ExpeditionHud health={health ?? state.health} maxHealth={state.maxHealth} pack={state.pack} />
      )}

      {/* Orientation matters most where it is easiest to lose: fog hides the far
          half of this map, so "which way is the settlement" is a real question
          out here in a way it never is indoors. */}
      <WorldMap wallet={wallet} at="deep-forest" position={here} />

      {/* Contextual prompts, only when they apply. A HUD that always shows every
          action teaches players to stop reading it. */}
      {onGate && !dismissed.includes(onGate.name) && (
        <div className="df-prompt is-gate">
          <b>{onGate.name}</b>
          <span>Extract here to keep what you are carrying.</span>
          {/* Dismissible: the gate itself is lit, signed and unmissable, so once
              a player knows what it does the prompt is just something covering
              the ground they are trying to click on. */}
          <button
            className="df-prompt-close"
            onClick={() => setDismissed((d) => [...d, onGate.name])}
            aria-label="Dismiss"
          >
            <X size={12} weight="bold" />
          </button>
        </div>
      )}
      {readable && !onGate && (
        <div className="df-prompt">
          <b>Dropped pack</b>
          <span>
            {readable.contents?.length
              ? readable.contents.map((c) => `${c.quantity}x ${c.ref}`).join(' · ')
              : 'Empty'}
          </span>
        </div>
      )}
    </main>
  );
}
