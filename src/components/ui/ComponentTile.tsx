'use client';

// Uses the unified fab reference renders as readable inventory thumbnails.

import { rarityHex, type Rarity } from '@/lib/rarity';

export const SLOT_GLYPHS: Record<string, string> = {
  derrick: '◎',
  pump_jack: '◫',
  pipeline: '⌬',
  flare_stack: 'ϟ',
  drill_bit: '◉',
  ore_cart: '◇',
  rail_track: '⊞',
  elevator: '≈',
};

export const SLOT_IMAGES: Record<string, string> = {
  derrick: '/assets/fab/lithography-machine-reference.png',
  pump_jack: '/assets/fab/wafer-stack-reference.png',
  pipeline: '/assets/fab/lithography-machine-reference.png',
  flare_stack: '/assets/fab/wafer-stack-reference.png',
  drill_bit: '/assets/fab/dicing-saw-reference.png',
  ore_cart: '/assets/fab/packaging-line-reference.png',
  rail_track: '/assets/fab/dicing-saw-reference.png',
  elevator: '/assets/fab/packaging-line-reference.png',
};

interface ComponentTileProps {
  slot: string;
  rarity: Rarity;
  size?: number;
}

export default function ComponentTile({ slot, rarity, size = 86 }: ComponentTileProps) {
  const hex = rarityHex(rarity);
  const image = SLOT_IMAGES[slot];

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
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image}
          alt=""
          style={{
            width: '92%',
            height: '92%',
            objectFit: 'contain',
            filter: `drop-shadow(0 0 ${Math.round(size * 0.08)}px ${hex}aa)`,
          }}
        />
      ) : (
        <span style={{ filter: `drop-shadow(0 0 ${Math.round(size * 0.08)}px ${hex}aa)` }}>
          {SLOT_GLYPHS[slot] ?? '·'}
        </span>
      )}
    </div>
  );
}
