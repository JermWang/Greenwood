'use client';

// A picture for anything that can be listed.
//
// ComponentTile already draws instruments and CrateThumb already draws crates,
// so this is not new art — it is the ONE place that decides which of them a
// listing gets, plus a matching tile for the two kinds that had neither. The
// board previously made that choice inline, which is why a cosmetic listing
// rendered as the same grey "EQD" badge as a desk.
//
// WHY `live` IS OPT-IN. CrateThumb is real geometry in its own <Canvas>, which
// is cheap on the Exchange page — a flat page with no other 3D on it — and is
// NOT cheap in the HUD dock, which floats over a region that is already running
// a WebGL scene. Seven more contexts on top of the world is how a browser hits
// its context ceiling and starts silently dropping the oldest one, which in
// this game is the world itself. So the dock gets a drawn tile and the page
// gets the live crate, and the flag says which.

import CrateThumb from '@/components/three/CrateThumb';
import ComponentTile from './ComponentTile';
import { listingAccent, type ListingLike } from '@/lib/listings';
import { asRarity } from '@/lib/rarity';

/**
 * A glyph per kind, in the same voice as ComponentTile's slot glyphs.
 *
 * Typographic on purpose and consistent with the tile it sits beside: bespoke
 * art per item is still to be commissioned, and a glyph that is obviously a
 * placeholder beats a render borrowed from a different theme.
 */
const KIND_GLYPH: Record<string, string> = {
  crate: '▣',
  node: '⌸',
  cosmetic: '❖',
};

export default function ListingThumb({
  listing,
  size = 34,
  live = false,
}: {
  listing: ListingLike;
  size?: number;
  /** Allow the crate's live render. Only where nothing else is using the GPU. */
  live?: boolean;
}) {
  const accent = listingAccent(listing);
  const item = (listing.item ?? {}) as Record<string, string | number | undefined>;

  if (listing.itemKind === 'component') {
    return <ComponentTile slot={String(item.slot ?? '')} rarity={asRarity(String(item.rarity ?? ''))} size={size} />;
  }

  if (listing.itemKind === 'crate' && live) {
    return <CrateThumb size={size} rarity="legendary" />;
  }

  return (
    <div
      aria-hidden
      className="eg-listing-thumb"
      style={{
        width: size,
        height: size,
        background: `radial-gradient(circle at 50% 35%, ${accent}38 0%, ${accent}12 55%, transparent 100%)`,
        border: `1px solid ${accent}44`,
        boxShadow: `inset 0 0 ${Math.round(size * 0.25)}px ${accent}22`,
        fontSize: Math.round(size * 0.42),
        color: accent,
      }}
    >
      <span style={{ filter: `drop-shadow(0 0 ${Math.round(size * 0.08)}px ${accent}aa)` }}>
        {KIND_GLYPH[listing.itemKind] ?? '·'}
      </span>
    </div>
  );
}
