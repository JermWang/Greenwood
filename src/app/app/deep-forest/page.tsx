'use client';

// The Deep Forest, as a place you can stand in.
//
// Gated on the region check, with one exception: the dev wallet bypass also
// opens the gate. Without that, nobody can look at the zone until the level and
// pack systems are fully wired through the UI, and a scene nobody can open is a
// scene that rots. DEV_WALLET is null in every production build, so the gate is
// real everywhere it matters.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { X } from '@phosphor-icons/react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { IsoRig } from '@/components/iso/IsoScene';
import { EXTENT } from '@/lib/deep-forest-map';
import type { DragState } from '@/components/iso/IsoBoard';
import DeepForestScene from '@/components/iso/DeepForestScene';
import DeepForestPlayer from '@/components/iso/DeepForestPlayer';
import { ISO, ISO_OFFSET } from '@/components/iso/palette';
import { useOperation } from '@/lib/useOperation';
import { DEV_WALLET_BYPASS } from '@/lib/dev-mode';
import {
  api,
  type CreatureView,
  type ExpeditionState,
  type PlayerView,
  type VisiblePile,
} from '@/lib/api-client';
import { gateAt } from '@/lib/deep-forest-map';
import CreatureField from '@/components/iso/CreatureField';
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
  const [state, setState] = useState<ExpeditionState | null>(null);
  const [piles, setPiles] = useState<VisiblePile[]>([]);
  const [creatures, setCreatures] = useState<CreatureView[]>([]);
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

  const onMove = useCallback((cell: { x: number; z: number }) => setPosition(cell), []);
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
  const onAttack = useCallback(
    (id: string) => {
      if (!wallet) return;
      void api
        .attack(wallet, id)
        .then((r) => {
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

  const open = useMemo(() => DEV_WALLET_BYPASS || state?.allowed === true, [state]);

  // The bypass short-circuits the connect prompt as well as the region gate.
  if (!wallet && !DEV_WALLET_BYPASS) {
    return <div className="df-gate"><p>Connect a fund to go outside.</p></div>;
  }

  if (state && !open) {
    return (
      <div className="df-gate">
        <span className="df-gate-kicker">The Deep Forest</span>
        <p>{state.reason}</p>
        <Link className="btn-secondary" href="/app">Back to the fund</Link>
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

        powerPreference asks the browser for the discrete GPU on dual-GPU
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
        dpr={[1, 1.75]}
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
        <IsoRig dragRef={dragRef} interactive bounds={BOUNDS} zoom={30} follow={here} />
        <DeepForestScene />
        {piles.map((p) => (
          <Pile key={p.id} pile={p} />
        ))}
        <CreatureField creatures={creatures} playerAt={here} onAttack={onAttack} />
        <PlayerField players={players} onStrike={onStrike} />
        {wallet && state && (
          <DeepForestPlayer
            wallet={wallet}
            start={state.position}
            dragRef={dragRef}
            onMove={onMove}
            onPiles={onPiles}
            onCreatures={onCreatures}
            onPlayers={onPlayers}
          />
        )}
      </Canvas>

      {state && (
        <ExpeditionHud health={health ?? state.health} maxHealth={state.maxHealth} pack={state.pack} />
      )}

      {/* Orientation matters most where it is easiest to lose: fog hides the far
          half of this map, so "which way is the settlement" is a real question
          out here in a way it never is indoors. */}
      <WorldMap wallet={wallet} at="deep-forest" />

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
