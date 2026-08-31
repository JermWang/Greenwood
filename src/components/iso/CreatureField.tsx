'use client';

// The creatures on the map, and clicking one to fight it.
//
// Positions come from the server's list, not from lib/creatures directly: spawn
// POINTS are deterministic and both halves agree on them, but health and aggro
// are mutable server state, and a client that decided for itself whether
// something was dead would show corpses walking.
//
// A creature is a click target with a small hitbox above it rather than a
// clickable model — the models are irregular, and a swing that lands only when
// you hit an arm is a swing that reads as broken.
//
// IT ALSO HAS TO SAY THAT IT IS ONE. For a long time it did not: the hitbox took
// clicks in silence, with no cursor change and no highlight, so the only way to
// learn that a shambler could be attacked was to click one on a hunch. Pointing
// at a creature now answers the question the pointer is asking, in the language
// TreeField already established — NEON WHEN YOUR WEAPON REACHES IT, AMBER WHEN
// IT DOES NOT. The reach comes from the weapon in your hand, which is the whole
// point of carrying a crossbow: hover a shambler four tiles off and it lights
// green with a bow and amber with an axe, before you have spent a swing finding
// out.
//
// It stays clickable either way. An out-of-reach swing is refused by the server
// with "Too far away.", and a refusal that names the reason teaches more than a
// dead click that does nothing.

import { useCallback, useState } from 'react';
import { ThreeEvent } from '@react-three/fiber';
import { Shambler, Wolf } from './Creatures';
import { TileFill, TileRing } from './TileMarker';
import { ISO } from './palette';
import { PLAYER_REACH } from '@/lib/creatures';
import { weaponById } from '@/lib/weapons';
import type { CreatureView } from '@/lib/api-client';

/** The one colour in this game that means "this will hurt you". */
const THREAT = '#ff2f2f';

export default function CreatureField({
  creatures,
  playerAt,
  weapon,
  onAttack,
}: {
  creatures: CreatureView[];
  playerAt: { x: number; z: number };
  /**
   * What the server says is in this player's hand, by weapon id.
   *
   * Null is bare hands, not "unknown" — which is why the fallback is
   * PLAYER_REACH rather than nothing. Same value attackCreature falls back to,
   * so the highlight and the swing agree about what counts as too far.
   */
  weapon: string | null;
  onAttack: (id: string) => void;
}) {
  /** Which creature the pointer is over. Null when it is over none of them. */
  const [hover, setHover] = useState<string | null>(null);
  const reach = weaponById(weapon)?.reach ?? PLAYER_REACH;

  const swing = useCallback(
    (event: ThreeEvent<MouseEvent>, id: string) => {
      event.stopPropagation();
      onAttack(id);
    },
    [onAttack]
  );

  return (
    <>
      {creatures.map((c) => {
        // Face the player when hunting; keep its spawn facing otherwise. Turning
        // to look at you is the clearest possible signal that it has noticed.
        const facing = c.hunting ? Math.atan2(playerAt.x - c.x, playerAt.z - c.z) : c.seed % 4;
        const state = c.dead ? 'dead' : c.hunting ? 'hunting' : 'idle';
        const hurt = c.health < c.maxHealth && !c.dead;
        const hovered = hover === c.id && !c.dead;
        // Chebyshev, like every other adjacency rule in this game and like the
        // tilesApart the server resolves the swing with.
        const inReach = Math.max(Math.abs(c.x - playerAt.x), Math.abs(c.z - playerAt.z)) <= reach;

        return (
          <group key={c.id}>
            {c.kind === 'wolf' ? (
              <Wolf position={[c.x, c.z]} seed={c.seed} state={state} facing={facing} />
            ) : (
              <Shambler position={[c.x, c.z]} seed={c.seed} state={state} facing={facing} />
            )}

            {/* Health bar, only once it has been hit. Showing a full bar over
                every creature turns the forest into a spreadsheet. */}
            {hurt && (
              <mesh position={[c.x, 1.9, c.z]}>
                <planeGeometry args={[0.9 * (c.health / c.maxHealth), 0.09]} />
                <meshBasicMaterial color="#e35a4a" toneMapped={false} depthTest={false} />
              </mesh>
            )}

            {/* Hitbox. Invisible would remove it from raycasting entirely, so it
                is transparent instead — the same trap the ground click plane
                already hit once. Sized to the taller shambler. */}
            {!c.dead && (
              <mesh
                position={[c.x, 1, c.z]}
                onPointerOver={() => { setHover(c.id); document.body.style.cursor = 'pointer'; }}
                onPointerOut={() => {
                  setHover((h) => (h === c.id ? null : h));
                  document.body.style.cursor = '';
                }}
                onClick={(e) => swing(e, c.id)}
              >
                <boxGeometry args={[1.1, 2.2, 1.1]} />
                <meshBasicMaterial transparent opacity={0} depthWrite={false} />
              </mesh>
            )}

            {/*
              A RED SQUARE on the ground, always — not amber-until-it-notices.

              The old marker was a quiet amber ring that only went red once the
              thing was already hunting you, which is exactly one moment too
              late: by then the information you needed was "there is a creature
              over there", and you needed it while you still had the option to
              walk around. Danger is a property of the creature, not of its mood.
              Hunting now shows as a brighter, fuller square rather than as a
              different colour.
            */}
            {!c.dead && (
              <>
                <TileFill
                  x={c.x}
                  z={c.z}
                  color={THREAT}
                  opacity={hovered ? 0.5 : c.hunting ? 0.42 : 0.16}
                />
                <TileRing x={c.x} z={c.z} color={THREAT} opacity={c.hunting ? 1 : 0.75} />
              </>
            )}

            {/* The answer to "can I hit this from here". Drawn OVER the threat
                ring rather than instead of it — the red is what the thing is,
                and the neon is what your weapon can do about it; replacing one
                with the other would make a creature stop looking dangerous the
                moment you pointed at it. Raised a hair so the two squares do
                not fight for the same depth. */}
            {hovered && (
              <TileRing
                x={c.x}
                z={c.z}
                y={0.019}
                color={inReach ? ISO.accent : ISO.amber}
                opacity={1}
              />
            )}
          </group>
        );
      })}
    </>
  );
}
