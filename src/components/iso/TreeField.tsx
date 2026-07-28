'use client';

// Trees you can hit, and the stumps left when you do.
//
// The trees themselves are drawn elsewhere, instanced — see instancing.tsx for
// why. This layer sits over them and owns the three things instancing cannot do:
// tell you which tree the pointer is on, take a click, and replace a felled one
// with a stump.
//
// ONLY REACHABLE TREES ARE CLICKABLE, and that is the whole interaction design.
// A forest is thousands of objects; making every one a raycast target would be
// both slow and meaningless, because you can only fell what you are standing
// next to. Restricting the hitboxes to the ring around the player means the
// scene carries eight click targets instead of three hundred, AND it teaches the
// rule without a line of text: walk up to a tree and it lights up.

import { memo, useMemo, useState } from 'react';
import { ThreeEvent } from '@react-three/fiber';
import { Stump } from './OutdoorDressing';
import { TileFill, TileRing } from './TileMarker';
import { ISO } from './palette';
import { CHOP_REACH, SPECIES, canFell, speciesAt, type AxeId } from '@/lib/woodcutting';

export interface FieldTree {
  x: number;
  z: number;
  seed: number;
}

export interface FieldStump {
  id: string;
  x: number;
  z: number;
  /** 0..1 toward regrowth, for the shoot. Null when the client cannot tell. */
  regrow?: number;
}

export default memo(function TreeField({
  region,
  trees,
  stumps,
  playerAt,
  axe,
  busyAt,
  onChop,
}: {
  region: string;
  /** Every tree the scene drew. Only the near ones become targets. */
  trees: FieldTree[];
  stumps: FieldStump[];
  playerAt: { x: number; z: number };
  /** What the player carries. Null means every tree refuses politely. */
  axe: AxeId | null;
  /** The tile currently being felled, so it can show as busy. */
  busyAt: { x: number; z: number } | null;
  onChop: (tree: FieldTree) => void;
}) {
  const [hover, setHover] = useState<string | null>(null);

  /**
   * The trees within reach, and nothing else.
   *
   * Chebyshev, matching CHOP_REACH and every other adjacency rule in this game.
   * Recomputed as the player moves, which is cheap because it is a filter over
   * an array the scene already had rather than a query.
   */
  const near = useMemo(
    () =>
      trees.filter(
        (t) =>
          Math.max(Math.abs(t.x - playerAt.x), Math.abs(t.z - playerAt.z)) <= CHOP_REACH
      ),
    [trees, playerAt.x, playerAt.z]
  );

  return (
    <>
      {near.map((tree) => {
        const species = speciesAt(region, tree.x, tree.z);
        const cuttable = canFell(axe, species);
        const key = `${tree.x}:${tree.z}`;
        const hovered = hover === key;
        const busy = busyAt?.x === tree.x && busyAt?.z === tree.z;

        return (
          <group key={key}>
            {/*
              Footprint under a reachable tree.

              Green when your axe will cut it, amber when it will not — and the
              amber one is deliberately still SHOWN rather than hidden. A tree
              you cannot fell yet is the clearest possible advertisement for the
              next axe up, and hiding it would make the ladder invisible until
              somebody happened to buy a rung.
            */}
            <TileFill
              x={tree.x}
              z={tree.z}
              color={cuttable ? ISO.accent : ISO.amber}
              opacity={busy ? 0.5 : hovered ? 0.36 : 0.16}
            />
            <TileRing
              x={tree.x}
              z={tree.z}
              color={cuttable ? ISO.accent : ISO.amber}
              opacity={hovered ? 1 : 0.6}
            />

            {/* Transparent, not invisible: three.js skips invisible objects
                when raycasting, which would make this a target nothing can hit.
                Tall and wide enough to cover the trunk and the lower tiers, so
                a click anywhere on the tree lands. */}
            <mesh
              position={[tree.x, 1.6, tree.z]}
              onPointerOver={() => { setHover(key); document.body.style.cursor = 'pointer'; }}
              onPointerOut={() => {
                setHover((h) => (h === key ? null : h));
                document.body.style.cursor = '';
              }}
              onClick={(e: ThreeEvent<MouseEvent>) => {
                e.stopPropagation();
                onChop(tree);
              }}
            >
              <boxGeometry args={[1.2, 3.2, 1.2]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
          </group>
        );
      })}

      {/*
        Stumps.

        Drawn from the SERVER's list rather than from anything this client
        believes, so two players standing in the same clearing see the same
        ground. The species is recomputed locally — it is a pure function of the
        coordinate, so there is no need to send it.
      */}
      {stumps.map((s) => (
        <Stump
          key={s.id}
          position={[s.x, s.z]}
          bark={SPECIES[speciesAt(region, s.x, s.z)].bark}
          seed={s.x * 31 + s.z}
          regrow={s.regrow ?? 0}
        />
      ))}
    </>
  );
});
