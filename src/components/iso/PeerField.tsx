'use client';

// Other funds, in a region where nothing is contested.
//
// The quiet counterpart to PlayerField. That one is for the hostile regions and
// carries everything a PvP decision needs — a health bar, a strike target, a
// neon ring that separates a player from a creature in the half second you get
// to choose. None of that belongs here: there is nothing to fight on the
// Grounds, and drawing a health bar over somebody would suggest otherwise.
//
// So a peer is just their avatar and their name, walking. The walk is not sent
// over the wire — Character derives the animation from the motion between the
// positions presence reports, which is why a peer moving across a shard looks
// like a person rather than a teleporting sprite.

import Character, { lookFor } from './Character';
import type { FloorPeer } from './useWorldPresence';

/**
 * Takes the hook's full roster and drops the local player itself.
 *
 * Filtered here rather than by each caller: useWorldPresence returns YOU first
 * so a HUD can count heads, and a scene that forgets to exclude yourself draws
 * a second copy of your avatar standing exactly where you are. It renders as a
 * shimmer rather than as a duplicate, which is why it would survive review.
 */
export default function PeerField({ peers }: { peers: FloorPeer[] }) {
  return (
    <>
      {peers.filter((peer) => !peer.isSelf).map((peer) => (
        <Character
          key={peer.wallet}
          look={lookFor(peer)}
          name={peer.name}
          target={{ x: peer.x, z: peer.z }}
        />
      ))}
    </>
  );
}
