'use client';

// Outdoor props: the vocabulary Greenwood Grounds and the Treeline are built from.
//
// Separate from MapDressing because the two sets answer different questions.
// Indoors, everything is architecture — walls, columns, service panels — and the
// job is to make a room read as a room. Outdoors there is no ceiling and no wall
// to bound the space, so the props ARE the boundary: a tree line is what stops
// the world, and a fence is what tells you the world stopping was somebody's
// decision.
//
// Same visual language as the interiors on purpose — flat-shaded boxes and
// prisms, no imported maps, seeded variation. The Grounds must not read as a
// different game from the Machine Room; the whole reveal depends on the outside
// being the same place as the inside, seen from further out.
//
// Everything here stays on the grid and on quarter turns, per the alignment
// pass. Trees are the one place a little rotational freedom is allowed — a
// planted row is meant to look planted, but a wild one is not — and that is
// stated at the component rather than left to chance.

import { useMemo } from 'react';
import { ISO } from './palette';
import { hash2 } from './mapkit';

function flat(color: string, rough = 0.85, metal = 0.03) {
  return <meshStandardMaterial color={color} flatShading roughness={rough} metalness={metal} />;
}

function lit(color: string, intensity = 1) {
  return (
    <meshStandardMaterial
      color={color}
      emissive={color}
      emissiveIntensity={intensity}
      toneMapped={false}
      flatShading
    />
  );
}

/** Foliage greens. Real greens, deliberately NOT the brand colour. */
const NEEDLE = ['#3f5a33', '#47623a', '#38512d', '#4d6a3f'];
const BARK = '#4a3b2c';

/**
 * A conifer.
 *
 * The mark, at scale — three tapering tiers on a trunk, the same silhouette the
 * Planter carries indoors. That echo is doing real work: the potted evergreen in
 * the Trading Floor is a decoration of the thing outside the fence, and a player
 * who notices is a player who has started reading the world.
 *
 * Rotation is free rather than quarter-snapped. A row of planted trees would
 * want the snap; a tree line is supposed to look unplanned, and four repeated
 * orientations across a hundred trees reads as tiling.
 */
export function Tree({
  position,
  seed = 0,
  scale = 1,
}: {
  position: [number, number];
  seed?: number;
  scale?: number;
}) {
  const shape = useMemo(() => {
    const height = (2.6 + hash2(seed, 1) * 1.9) * scale;
    const spread = (1.1 + hash2(seed, 2) * 0.5) * scale;
    return {
      height,
      spread,
      spin: hash2(seed, 3) * Math.PI * 2,
      needle: NEEDLE[Math.floor(hash2(seed, 4) * NEEDLE.length)],
      // A slight lean, because a tree that stands perfectly plumb reads as a
      // lamp post. Small enough that a stand of them still looks like a wood
      // rather than a storm.
      lean: (hash2(seed, 5) - 0.5) * 0.12,
    };
  }, [seed, scale]);

  const tiers = 3;
  return (
    <group position={[position[0], 0, position[1]]} rotation={[shape.lean, shape.spin, 0]}>
      <mesh position={[0, shape.height * 0.22, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.09 * scale, 0.14 * scale, shape.height * 0.45, 5]} />
        {flat(BARK, 0.95)}
      </mesh>
      {Array.from({ length: tiers }, (_, i) => {
        const t = i / (tiers - 1);
        return (
          <mesh
            key={i}
            position={[0, shape.height * (0.4 + t * 0.42), 0]}
            castShadow
            receiveShadow
          >
            <coneGeometry args={[shape.spread * (1 - t * 0.45), shape.height * 0.34, 6]} />
            {flat(shape.needle, 0.92)}
          </mesh>
        );
      })}
    </group>
  );
}

/**
 * A dead tree, for the Treeline and the Deep Forest.
 *
 * No needles, paler bark, and the lean pushed further. Used sparsely among live
 * ones — a wood that is entirely dead reads as a set, and a wood with three dead
 * trees in it reads as a wood that something happened to.
 */
export function DeadTree({ position, seed = 0 }: { position: [number, number]; seed?: number }) {
  const height = 2.4 + hash2(seed, 1) * 1.6;
  const spin = hash2(seed, 2) * Math.PI * 2;
  const lean = (hash2(seed, 3) - 0.5) * 0.3;
  const branches = 2 + Math.floor(hash2(seed, 4) * 3);
  return (
    <group position={[position[0], 0, position[1]]} rotation={[lean, spin, 0]}>
      <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.07, 0.13, height, 5]} />
        {flat('#6b6154', 0.98)}
      </mesh>
      {Array.from({ length: branches }, (_, i) => {
        const y = height * (0.45 + i * 0.18);
        const angle = hash2(seed, i + 10) * Math.PI * 2;
        return (
          <mesh
            key={i}
            position={[Math.sin(angle) * 0.3, y, Math.cos(angle) * 0.3]}
            rotation={[0.5, angle, 0.7]}
            castShadow
          >
            <cylinderGeometry args={[0.03, 0.05, 0.8, 4]} />
            {flat('#6b6154', 0.98)}
          </mesh>
        );
      })}
    </group>
  );
}

/**
 * A section of perimeter fence.
 *
 * The most important prop in the outdoor set, and the reason the Grounds work as
 * the middle stage of the reveal. It reads as ordinary site fencing on a first
 * visit — every industrial park has one — and only becomes strange when you
 * notice how tall it is and which way the floodlights point.
 *
 * `floodlight` faces OUTWARD by default: away from the settlement, into the
 * trees. Nobody lights a perimeter to look at their own car park.
 */
export function FenceSection({
  position,
  rotation = 0,
  floodlight = false,
  lightOn = true,
}: {
  position: [number, number];
  rotation?: number;
  /** Put a lamp on this post, aimed away from the settlement. */
  floodlight?: boolean;
  lightOn?: boolean;
}) {
  const height = 3.4;
  return (
    <group position={[position[0], 0, position[1]]} rotation={[0, rotation, 0]}>
      {/* Posts either end, so sections read as a run rather than a ribbon. */}
      {[-1, 1].map((x) => (
        <mesh key={x} position={[x, height / 2, 0]} castShadow>
          <boxGeometry args={[0.12, height, 0.12]} />
          {flat(ISO.steelDark, 0.5, 0.55)}
        </mesh>
      ))}
      {/* Mesh panel, drawn as horizontal rails. Cheaper than a texture and it
          keeps the flat-shaded language. */}
      {[0.5, 1.3, 2.1, 2.9].map((y) => (
        <mesh key={y} position={[0, y, 0]} castShadow>
          <boxGeometry args={[2, 0.05, 0.04]} />
          {flat(ISO.steel, 0.6, 0.4)}
        </mesh>
      ))}
      {/* Angled top, the detail that makes it read as keeping things OUT. */}
      <mesh position={[0, height + 0.12, -0.14]} rotation={[-0.5, 0, 0]} castShadow>
        <boxGeometry args={[2, 0.04, 0.4]} />
        {flat(ISO.steel, 0.6, 0.4)}
      </mesh>

      {floodlight && (
        <group position={[1, height + 0.3, 0]}>
          <mesh position={[0, 0.2, 0]} castShadow>
            <boxGeometry args={[0.1, 0.4, 0.1]} />
            {flat(ISO.steelDark, 0.5, 0.55)}
          </mesh>
          {/* Housing tilted to throw light away from the settlement (+Z is out). */}
          <mesh position={[0, 0.42, 0.16]} rotation={[0.6, 0, 0]} castShadow>
            <boxGeometry args={[0.34, 0.2, 0.26]} />
            {flat(ISO.steelDark, 0.45, 0.6)}
          </mesh>
          <mesh position={[0, 0.36, 0.28]} rotation={[0.6, 0, 0]}>
            <boxGeometry args={[0.26, 0.02, 0.16]} />
            {lightOn ? lit('#ffe9b0', 2.2) : flat('#4a4740')}
          </mesh>
          {lightOn && (
            <pointLight position={[0, 0.3, 0.8]} color="#ffe4a3" intensity={9} distance={13} decay={2} />
          )}
        </group>
      )}
    </group>
  );
}

/**
 * A gathering node: something on the ground worth stopping for.
 *
 * One component with a `kind`, rather than three components, because the quest
 * system does not care what it looks like — it records an action and a count —
 * and a shared shape means adding a fourth resource is a string, not a model.
 */
export type GatherKind = 'scrap' | 'timber' | 'cable';

const GATHER: Record<GatherKind, { color: string; accent: string; label: string }> = {
  scrap: { color: '#7d746a', accent: ISO.amber, label: 'Scrap' },
  timber: { color: '#6d5333', accent: '#a8874f', label: 'Timber' },
  cable: { color: '#3c3a36', accent: ISO.accent, label: 'Cable' },
};

export function GatheringNode({
  position,
  kind = 'scrap',
  seed = 0,
  depleted = false,
}: {
  position: [number, number];
  kind?: GatherKind;
  seed?: number;
  /** Harvested and on cooldown: still there, visibly spent. */
  depleted?: boolean;
}) {
  const def = GATHER[kind];
  const count = 2 + Math.floor(hash2(seed, 7) * 3);
  return (
    <group position={[position[0], 0.06, position[1]]}>
      {Array.from({ length: count }, (_, i) => {
        const angle = (i / count) * Math.PI * 2 + hash2(seed, i) * 0.7;
        const r = 0.18 + hash2(seed, i + 3) * 0.22;
        const s = 0.18 + hash2(seed, i + 6) * 0.16;
        return (
          <mesh
            key={i}
            position={[Math.sin(angle) * r, s / 2, Math.cos(angle) * r]}
            rotation={[hash2(seed, i + 9) * 0.5, angle, hash2(seed, i + 12) * 0.4]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[s, s * 0.7, s * 1.3]} />
            {flat(def.color, 0.9)}
          </mesh>
        );
      })}
      {/* A quiet ground marker so a node reads as interactive from across a
          clearing. Dimmed rather than hidden when spent — a node that vanishes
          teaches players the world is inconsistent; one that visibly recharges
          teaches them to come back. */}
      <mesh position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.55, 0.7, 4, 1, Math.PI / 4]} />
        <meshBasicMaterial
          color={def.accent}
          transparent
          opacity={depleted ? 0.14 : 0.55}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

/**
 * A planter: the shrub in a concrete box that every office forecourt has.
 *
 * Reads as maintenance. That is its entire job — it is the prop that says
 * somebody still comes out here with a trowel, which is why grounds-map stops
 * placing them partway up the map. Where the landscaping ends is the first quiet
 * sign that the settlement's reach has an edge, and it lands better as an
 * absence than it would as a sign saying so.
 */
export function Planter({ position, seed = 0 }: { position: [number, number]; seed?: number }) {
  const shrubs = 1 + Math.floor(hash2(seed, 1) * 3);
  return (
    <group position={[position[0], 0, position[1]]}>
      <mesh position={[0, 0.19, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.86, 0.38, 0.86]} />
        {flat(ISO.concrete, 0.95)}
      </mesh>
      {/* Soil, recessed. Without it the shrubs read as growing out of concrete. */}
      <mesh position={[0, 0.39, 0]}>
        <boxGeometry args={[0.7, 0.04, 0.7]} />
        {flat('#3b3128', 1)}
      </mesh>
      {Array.from({ length: shrubs }, (_, i) => {
        const angle = (i / shrubs) * Math.PI * 2 + hash2(seed, i + 4) * 0.9;
        const r = hash2(seed, i + 7) * 0.16;
        const s = 0.26 + hash2(seed, i + 10) * 0.18;
        return (
          <mesh
            key={i}
            position={[Math.sin(angle) * r, 0.4 + s * 0.5, Math.cos(angle) * r]}
            rotation={[0, hash2(seed, i + 13) * Math.PI, 0]}
            castShadow
          >
            <dodecahedronGeometry args={[s, 0]} />
            {flat(NEEDLE[Math.floor(hash2(seed, i + 16) * NEEDLE.length)], 0.95)}
          </mesh>
        );
      })}
    </group>
  );
}

/**
 * A building you can walk into.
 *
 * Solid on every tile of its footprint except the doorway, which grounds-map
 * enforces — the model here is only the picture of that rule. If the two ever
 * disagree, the map is right and this is wrong, because the map is the half a
 * server could read.
 *
 * Kept deliberately plain: a long low shed with a parapet and a strip of
 * windows. The Machine Room and the Trading Floor are the two most familiar
 * places in the game and a player should recognise their outsides instantly,
 * which argues for a silhouette that is easy to tell apart at a glance rather
 * than one that is interesting to look at.
 */
export function SettlementBuilding({
  position,
  width,
  depth,
  height = 4.2,
  seed = 0,
  /** Where the doorway sits along the +Z face, relative to centre. */
  doorOffset = 0,
  /** Lit sign colour. Branding, so Robin Neon is correct here. */
  signLit = true,
}: {
  position: [number, number];
  width: number;
  depth: number;
  height?: number;
  seed?: number;
  doorOffset?: number;
  signLit?: boolean;
}) {
  const front = depth / 2;
  const panes = Math.max(2, Math.floor(width / 2));
  return (
    <group position={[position[0], 0, position[1]]}>
      {/* Shell. */}
      <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, height, depth]} />
        {flat(ISO.concreteAlt, 0.95)}
      </mesh>
      {/*
        Roof: a pale deck with a parapet RIM around it, not a lid.

        This was one dark slab covering the whole footprint, and in an isometric
        view the roof is most of what you see of a building — so both buildings
        read as black boxes with a lit sign on them. The deck is the largest
        surface in the region after the ground and has to be lit accordingly;
        the parapet is four thin walls, which is what a parapet is.
      */}
      <mesh position={[0, height + 0.03, 0]} receiveShadow>
        <boxGeometry args={[width, 0.06, depth]} />
        {flat('#7d7a73', 0.98)}
      </mesh>
      {[
        [0, height + 0.2, depth / 2, width + 0.3, 0.3],
        [0, height + 0.2, -depth / 2, width + 0.3, 0.3],
      ].map(([x, y, z, w, d]) => (
        <mesh key={`z${z}`} position={[x, y, z]} castShadow>
          <boxGeometry args={[w, 0.4, d]} />
          {flat(ISO.concreteDark, 0.95)}
        </mesh>
      ))}
      {[-width / 2, width / 2].map((x) => (
        <mesh key={`x${x}`} position={[x, height + 0.2, 0]} castShadow>
          <boxGeometry args={[0.3, 0.4, depth + 0.3]} />
          {flat(ISO.concreteDark, 0.95)}
        </mesh>
      ))}
      {/* Window strip along the front, broken into panes. */}
      {Array.from({ length: panes }, (_, i) => {
        const span = width - 1.6;
        const x = -span / 2 + (i / Math.max(1, panes - 1)) * span;
        // Skip the pane the door would collide with.
        if (Math.abs(x - doorOffset) < 1.1) return null;
        return (
          <mesh key={i} position={[x, height * 0.62, front + 0.02]} castShadow>
            <boxGeometry args={[0.9, 0.9, 0.06]} />
            {flat(ISO.glass, 0.25, 0.35)}
          </mesh>
        );
      })}
      {/* Roof plant. Every one of these buildings is a generator housing, and
          the ducting on the roof is true long before the game admits it. */}
      <mesh position={[width * 0.24, height + 0.7, -depth * 0.16]} castShadow>
        <boxGeometry args={[1.5, 0.8, 1.1]} />
        {flat(ISO.steelDark, 0.7, 0.4)}
      </mesh>
      <mesh position={[-width * 0.26, height + 0.9, depth * 0.1]} castShadow>
        <cylinderGeometry args={[0.26, 0.3, 1.2, 8]} />
        {flat(ISO.steelDark, 0.7, 0.4)}
      </mesh>

      {/* Recessed doorway on the front face. A dark opening rather than a door
          model: it has to read as passable from across the forecourt, and a
          closed slab reads as scenery no matter how well it is detailed. */}
      <mesh position={[doorOffset, 1.1, front + 0.03]}>
        <boxGeometry args={[1.8, 2.2, 0.08]} />
        {flat('#16150f', 1)}
      </mesh>
      <mesh position={[doorOffset, 2.32, front + 0.06]}>
        <boxGeometry args={[2.1, 0.12, 0.14]} />
        {signLit ? lit(ISO.accent, 1.4) : flat(ISO.steelDark)}
      </mesh>
      {signLit && (
        <pointLight
          position={[doorOffset, 2.4, front + 1.2]}
          color={ISO.accent}
          intensity={4}
          distance={7}
          decay={2}
        />
      )}
    </group>
  );
}

/**
 * A boulder, for breaking up open ground.
 *
 * Deliberately dull. Its job is to stop a field reading as a lawn, and anything
 * more interesting than that competes with the props that matter.
 */
export function Boulder({ position, seed = 0 }: { position: [number, number]; seed?: number }) {
  const s = 0.5 + hash2(seed, 1) * 0.7;
  return (
    <group
      position={[position[0], 0, position[1]]}
      rotation={[hash2(seed, 2) * 0.3, hash2(seed, 3) * Math.PI * 2, hash2(seed, 4) * 0.3]}
    >
      <mesh position={[0, s * 0.35, 0]} castShadow receiveShadow>
        <dodecahedronGeometry args={[s * 0.55, 0]} />
        {flat('#6f6b63', 0.95)}
      </mesh>
    </group>
  );
}

/**
 * A stretch of broken wooden barrier.
 *
 * Reads as something that used to keep people to a path. Boards are missing on
 * a seeded pattern rather than at random per render, so a given stretch is
 * always broken in the same places — a landmark you can navigate by only works
 * if it looks the same every time you pass it.
 */
export function BrokenBarrier({
  position,
  rotation = 0,
  seed = 0,
}: {
  position: [number, number];
  rotation?: number;
  seed?: number;
}) {
  const posts = [-1, 0, 1];
  return (
    <group position={[position[0], 0, position[1]]} rotation={[0, rotation, 0]}>
      {posts.map((x) => {
        // A missing post leaves a gap the rails have to span, which is most of
        // what makes it read as broken rather than as low fencing.
        if (hash2(seed, x + 5) > 0.78) return null;
        const lean = (hash2(seed, x + 9) - 0.5) * 0.35;
        return (
          <mesh key={x} position={[x, 0.34, 0]} rotation={[lean, 0, lean * 0.6]} castShadow>
            <boxGeometry args={[0.12, 0.68, 0.12]} />
            {flat(ISO.woodDark, 0.98)}
          </mesh>
        );
      })}
      {[0.24, 0.5].map((y, i) => {
        if (hash2(seed, i + 20) > 0.7) return null;
        const len = 1.4 + hash2(seed, i + 30) * 0.8;
        return (
          <mesh key={y} position={[(hash2(seed, i + 40) - 0.5) * 0.5, y, 0]} rotation={[0, 0, (hash2(seed, i + 50) - 0.5) * 0.18]} castShadow>
            <boxGeometry args={[len, 0.08, 0.06]} />
            {flat(ISO.wood, 0.96)}
          </mesh>
        );
      })}
      {/* A fallen board on the ground. The debris is what sells the break. */}
      <mesh position={[hash2(seed, 60) - 0.5, 0.04, 0.4]} rotation={[0, hash2(seed, 61) * Math.PI, 0]} castShadow>
        <boxGeometry args={[1.1, 0.07, 0.14]} />
        {flat(ISO.woodDark, 0.98)}
      </mesh>
    </group>
  );
}

/**
 * A broken-down car.
 *
 * Sits on the grid and on a quarter turn like every other placed prop — a wreck
 * angled across two tiles would be more picturesque and would also make the tile
 * under it ambiguous, which matters when the tile is cover.
 *
 * Doors and wheels go missing on a seeded roll, so a row of wrecks reads as
 * several different abandoned cars rather than one model stamped repeatedly.
 */
export function WreckedCar({
  position,
  rotation = 0,
  seed = 0,
}: {
  position: [number, number];
  rotation?: number;
  seed?: number;
}) {
  const paint = ['#5a4a42', '#46524f', '#5c5347', '#4a4148'][Math.floor(hash2(seed, 1) * 4)];
  const burnt = hash2(seed, 2) > 0.7;
  const body = burnt ? '#2e2c28' : paint;
  return (
    <group position={[position[0], 0, position[1]]} rotation={[0, rotation, 0]}>
      {/* Chassis. */}
      <mesh position={[0, 0.28, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.0, 0.36, 2.1]} />
        {flat(body, 0.9, 0.2)}
      </mesh>
      {/* Cabin, set back — the offset is what makes it a car and not a brick. */}
      <mesh position={[0, 0.58, -0.15]} castShadow>
        <boxGeometry args={[0.9, 0.34, 1.0]} />
        {flat(burnt ? '#232220' : '#2f3134', 0.85, 0.25)}
      </mesh>
      {/* Wheels, any of which may be gone. */}
      {[
        [-0.5, 0.66],
        [0.5, 0.66],
        [-0.5, -0.66],
        [0.5, -0.66],
      ].map(([x, z], i) =>
        hash2(seed, i + 10) > 0.82 ? null : (
          <mesh key={`${x}:${z}`} position={[x, 0.16, z]} rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.17, 0.17, 0.12, 6]} />
            {flat('#1f1e1c', 0.99)}
          </mesh>
        )
      )}
      {/* An open door, sometimes. */}
      {hash2(seed, 20) > 0.55 && (
        <mesh position={[0.62, 0.4, -0.1]} rotation={[0, -0.7, 0]} castShadow>
          <boxGeometry args={[0.06, 0.42, 0.8]} />
          {flat(body, 0.9, 0.2)}
        </mesh>
      )}
    </group>
  );
}

/**
 * A rock cluster: several boulders on one tile.
 *
 * Boulder draws one stone, which reads as sparse when what a clearing edge wants
 * is an outcrop. This is the same idea at group scale, and it still occupies
 * exactly one tile so collision stays a set lookup.
 */
export function RockCluster({ position, seed = 0 }: { position: [number, number]; seed?: number }) {
  const count = 2 + Math.floor(hash2(seed, 1) * 3);
  return (
    <group position={[position[0], 0, position[1]]}>
      {Array.from({ length: count }, (_, i) => {
        const s = 0.26 + hash2(seed, i + 2) * 0.34;
        const angle = (i / count) * Math.PI * 2 + hash2(seed, i + 8) * 0.8;
        const r = hash2(seed, i + 14) * 0.3;
        return (
          <mesh
            key={i}
            position={[Math.sin(angle) * r, s * 0.45, Math.cos(angle) * r]}
            rotation={[hash2(seed, i + 20) * 0.5, hash2(seed, i + 21) * Math.PI * 2, hash2(seed, i + 22) * 0.5]}
            castShadow
            receiveShadow
          >
            <dodecahedronGeometry args={[s, 0]} />
            {flat('#6f6b63', 0.95)}
          </mesh>
        );
      })}
    </group>
  );
}
