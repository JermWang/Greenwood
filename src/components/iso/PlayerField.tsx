'use client';

// Other funds, out here with you.
//
// The one thing this has to get right: another player must be instantly
// distinguishable from a creature, because the correct response is completely
// different and you get about half a second to decide. So they render as the
// same Character model you are, with a nameplate — and their ground ring is
// neon, the colour this world reserves for things that still work. A creature's
// ring is amber, or red when it has noticed you.
//
// Their health bar is always visible, unlike a creature's. Deciding whether to
// commit to a fight is the entire PvP decision, and it turns on how hurt they
// already are.

import { useCallback, useState } from 'react';
import { ThreeEvent } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import Character, { lookFor } from './Character';
import { ISO } from './palette';
import type { PlayerView } from '@/lib/api-client';

export default function PlayerField({
  players,
  onStrike,
}: {
  players: PlayerView[];
  onStrike: (wallet: string) => void;
}) {
  /** Who the pointer is over. Null when it is over nobody. */
  const [hover, setHover] = useState<string | null>(null);

  const hit = useCallback(
    (event: ThreeEvent<MouseEvent>, wallet: string) => {
      event.stopPropagation();
      onStrike(wallet);
    },
    [onStrike]
  );

  return (
    <>
      {players.map((p) => {
        const look = lookFor({ wallet: p.wallet, isSelf: false });
        const hovered = hover === p.wallet;
        const short = `${p.wallet.slice(0, 6)}…${p.wallet.slice(-4)}`;
        return (
          <group key={p.wallet}>
            {/* Positions arrive a few times a second, and Character walks toward
                whatever target it is given — so a peer animates their own walk
                cycle from the same motion logic without any animation state
                crossing the wire. */}
            <Character look={look} target={{ x: p.x, z: p.z }} highlight={hovered} />

            <Html center position={[p.x, 2.2, p.z]} pointerEvents="none" zIndexRange={[7, 0]}>
              <div className="pvp-tag">
                <span>{short}</span>
                <i style={{ width: `${Math.max(0, (p.health / p.maxHealth) * 100)}%` }} />
              </div>
            </Html>

            {/* Neon ring: this is a person. Creatures are amber or red. */}
            <mesh position={[p.x, 0.016, p.z]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
              <ringGeometry args={[0.55, 0.7, 4, 1, Math.PI / 4]} />
              <meshBasicMaterial color={ISO.accent} transparent opacity={hovered ? 0.85 : 0.5} toneMapped={false} depthWrite={false} />
            </mesh>

            {/* Transparent hitbox rather than the model: swings that only land on
                an arm read as broken. Same reason the creature field has one. */}
            <mesh
              position={[p.x, 0.9, p.z]}
              onPointerOver={() => { setHover(p.wallet); document.body.style.cursor = 'pointer'; }}
              onPointerOut={() => {
                setHover((h) => (h === p.wallet ? null : h));
                document.body.style.cursor = '';
              }}
              onClick={(e) => hit(e, p.wallet)}
            >
              <boxGeometry args={[1, 1.9, 1]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
          </group>
        );
      })}
    </>
  );
}
