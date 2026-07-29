'use client';

// Inventory thumbnail for a single instrument slot.
//
// Deliberately typographic: a rarity-tinted well with the slot's glyph in it.
// Bespoke art per slot is still to be commissioned, and a glyph that is
// obviously a placeholder beats a render borrowed from a different theme.

import { rarityHex, type Rarity } from '@/lib/rarity';

export const SLOT_GLYPHS: Record<string, string> = {
  derrick: '◎',
  pump_jack: '◫',
  pipeline: '⌬',
  flare_stack: 'ϟ',
  instrument: '◉',
  ore_cart: '◇',
  rail_track: '⊞',
  elevator: '≈',
};

interface ComponentTileProps {
  slot: string;
  rarity: Rarity;
  size?: number;
}

export default function ComponentTile({ slot, rarity, size = 86 }: ComponentTileProps) {
  const hex = rarityHex(rarity);

  return (
    <div
      aria-hidden
      className="relative flex select-none items-center justify-center overflow-hidden rounded-md"
      style={{
        width: size,
        height: size,
        background: `radial-gradient(circle at 50% 35%, ${hex}38 0%, ${hex}12 55%, transparent 100%)`,
        border: `1px solid ${hex}44`,
        boxShadow: `inset 0 0 ${Math.round(size * 0.25)}px ${hex}22`,
        fontSize: Math.round(size * 0.42),
        lineHeight: 1,
      }}
    >
      <span style={{ filter: `drop-shadow(0 0 ${Math.round(size * 0.08)}px ${hex}aa)` }}>
        {SLOT_GLYPHS[slot] ?? '·'}
      </span>
    </div>
  );
}
