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

import { useCallback } from 'react';
import { ThreeEvent } from '@react-three/fiber';
import { Shambler, Wolf } from './Creatures';
import { TileFill, TileRing } from './TileMarker';
import type { CreatureView } from '@/lib/api-client';

/** The one colour in this game that means "this will hurt you". */
const THREAT = '#ff2f2f';

export default function CreatureField({
  creatures,
  playerAt,
  onAttack,
}: {
  creatures: CreatureView[];
  playerAt: { x: number; z: number };
  onAttack: (id: string) => void;
}) {
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
              <mesh position={[c.x, 1, c.z]} onClick={(e) => swing(e, c.id)}>
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
                <TileFill x={c.x} z={c.z} color={THREAT} opacity={c.hunting ? 0.42 : 0.16} />
                <TileRing x={c.x} z={c.z} color={THREAT} opacity={c.hunting ? 1 : 0.75} />
              </>
            )}
          </group>
        );
      })}
    </>
  );
}
