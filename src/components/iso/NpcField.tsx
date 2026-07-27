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

import { memo, useCallback, useState } from 'react';
import { ThreeEvent } from '@react-three/fiber';
import Character from './Character';
import { TileRing } from './TileMarker';
import type { HatStyle } from './avatar-skins';
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
  /** Who the pointer is over. Null when it is over nobody. */
  const [hover, setHover] = useState<string | null>(null);

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
        const hovered = hover === npc.id;
        return (
          <group key={npc.id}>
            <Character
              highlight={hovered}
              look={{
                body: npc.outfit,
                cap: npc.cap,
                // The uniform. See the Npc type for why residents wear trim,
                // gloves and boots that a player's generated look never has.
                trim: npc.trim,
                hand: npc.hand,
                boot: npc.boot,
                skin: npc.skin,
                hat: npc.hat as HatStyle,
              }}
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
              color={near || hovered ? ISO.accent : ISO.steel}
              opacity={near ? 0.85 : hovered ? 0.6 : 0.3}
            />

            {/*
              CLICKABLE ONLY WHEN YOU ARE STANDING THERE.

              Talking used to work from anywhere on the map, which made these
              people menus that happened to be rendered in 3D — you could read
              every hint in the game from the entrance without walking a step.
              Requiring the walk is most of what makes them feel like residents
              rather than kiosks, and it is the same rule every other
              interaction in this world already follows: doors open when you
              stand in them, desks are worked at, loot is read from beside it.

              The hitbox exists at ANY distance so hovering still highlights
              them — you should be able to tell a person from scenery before you
              have committed to walking over. It simply does not act on a click
              from out of range, and because it never calls stopPropagation in
              that case the event carries on to the ground plane underneath and
              walks you there, which is what clicking somebody across the square
              meant anyway.

              Transparent rather than invisible: three.js skips invisible
              objects when raycasting, which would make this a target nothing
              can hit.
            */}
            <mesh
              position={[npc.x, 0.9, npc.z]}
              onPointerOver={() => { setHover(npc.id); document.body.style.cursor = 'pointer'; }}
              onPointerOut={() => {
                setHover((h) => (h === npc.id ? null : h));
                document.body.style.cursor = '';
              }}
              onClick={(e) => { if (near) click(e, npc); }}
            >
              <boxGeometry args={[1.1, 2, 1.1]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
          </group>
        );
      })}
    </>
  );
});
