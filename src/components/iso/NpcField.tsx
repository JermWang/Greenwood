'use client';

// The people standing around, and walking up to one.
//
// NPCs are drawn with the same Character model as players and peers, which is
// the point rather than a shortcut: the residents of Greenwood are not a
// different class of thing from you. What separates them is a nameplate that
// carries a role and a quiet marker underfoot — enough to read as "you can talk
// to this one" from across the forecourt, not enough to look like a quest icon.
//
// Deliberately NOT solid. Walking through somebody is a small lie; a person
// standing on a paved tile who blocks the only route to a door is a much bigger
// one, and pathfinding around a moving cast is a whole system for no gain.

import { memo, useCallback } from 'react';
import { ThreeEvent } from '@react-three/fiber';
import Character from './Character';
import { TileRing } from './TileMarker';
import { ISO } from './palette';
import { npcsIn, TALK_RADIUS, type Npc } from '@/lib/npcs';

export default memo(function NpcField({
  region,
  playerAt,
  onTalk,
}: {
  region: string;
  playerAt: { x: number; z: number };
  onTalk: (npc: Npc) => void;
}) {
  const click = useCallback(
    (event: ThreeEvent<MouseEvent>, npc: Npc) => {
      event.stopPropagation();
      onTalk(npc);
    },
    [onTalk]
  );

  return (
    <>
      {npcsIn(region).map((npc) => {
        const near = Math.hypot(playerAt.x - npc.x, playerAt.z - npc.z) <= TALK_RADIUS;
        return (
          <group key={npc.id}>
            <Character
              look={{ body: npc.outfit, cap: npc.cap }}
              target={{ x: npc.x, z: npc.z }}
              spawn={{ x: npc.x, z: npc.z }}
              // Faces the way players arrive from. A row of people all looking
              // the same direction reads as staff on a shift, which is what
              // they are.
              spawnFacing={npc.facing}
              name={npc.name}
            />

            {/* Footprint. Brightens within talking distance, which is the whole
                affordance — you learn the rule by walking toward somebody once. */}
            <TileRing
              x={npc.x}
              z={npc.z}
              color={near ? ISO.accent : ISO.steel}
              opacity={near ? 0.85 : 0.3}
            />

            {/* Hitbox, so clicking anywhere on a person starts the conversation
                rather than only their torso. Transparent rather than invisible:
                three.js skips invisible objects when raycasting, which would
                make this a click target nothing can click. */}
            <mesh position={[npc.x, 0.9, npc.z]} onClick={(e) => click(e, npc)}>
              <boxGeometry args={[1.1, 2, 1.1]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
          </group>
        );
      })}
    </>
  );
});
