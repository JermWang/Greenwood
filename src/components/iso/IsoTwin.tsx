'use client';

// The dashboard's digital twin, as an isometric board.
//
// Unlike the Floor Plan, this view is not the saved layout — it is a tidy
// auto-arrangement of every desk the fund owns, so the dashboard always reads
// the same regardless of how the player arranged their floor. Clicking a desk
// drives the inspector panel beside it.

import { useMemo } from 'react';
import IsoScene from './IsoScene';
import { type BoardBounds } from './IsoBoard';
import { ISO, type IsoMachine, type MachineKind, type PlacedIsoMachine } from './palette';

/** Mirrors the node shape the dashboard already builds for the old scene. */
export interface TwinNode {
  id: string;
  type: 'oil' | 'mine';
  level: number;
  isActive?: boolean;
  components: Array<{ slot: string; rarity: string }>;
}

const COLS = 4;

/** A desk's colour carries its tier, so progression is visible at a glance. */
function accentFor(type: 'oil' | 'mine', level: number): string {
  if (type === 'oil') return level >= 7 ? ISO.bright : level >= 4 ? ISO.accent : ISO.deep;
  return level >= 7 ? ISO.mint : level >= 4 ? ISO.deep : '#0b7d47';
}

export default function IsoTwin({
  nodes,
  selectedNodeId,
  onSelect,
}: {
  nodes: TwinNode[];
  selectedNodeId?: string | null;
  onSelect?: (id: string) => void;
}) {
  const machines = useMemo<IsoMachine[]>(
    () =>
      nodes.map((node) => ({
        id: node.id,
        kind: (node.type === 'oil' ? 'euv' : 'rack') as MachineKind,
        label: `${node.type === 'oil' ? 'Equity' : 'Treasury'} Desk · L${node.level}`,
        accent: accentFor(node.type, node.level),
      })),
    [nodes]
  );

  const layout = useMemo<PlacedIsoMachine[]>(
    () =>
      nodes.map((node, i) => ({
        id: node.id,
        x: (i % COLS) * 2 - 3,
        z: Math.floor(i / COLS) * 2 - 2,
        rotation: 0,
      })),
    [nodes]
  );

  // Grow the board downward as desks are added, so a full fund still fits
  // without the camera having to zoom out and shrink everything.
  const bounds = useMemo<BoardBounds>(() => {
    const rows = Math.max(1, Math.ceil(nodes.length / COLS));
    return { minX: -4, maxX: 4, minZ: -4, maxZ: Math.max(4, (rows - 1) * 2 + 2) };
  }, [nodes.length]);

  return (
    <IsoScene
      machines={machines}
      layout={layout}
      holdingId={null}
      selectedId={selectedNodeId ?? null}
      bounds={bounds}
      zoom={44}
      onTileClick={() => { /* the twin is a view, not an editor — arrange on the Floor Plan */ }}
      onDeskClick={(id) => onSelect?.(id)}
      onBackgroundClick={() => onSelect?.('')}
    />
  );
}
