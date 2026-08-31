'use client';

// A picture of the actual thing, for anything that can be listed.
//
// It used to be a tinted well with a glyph in it, which meant a Divine Order
// Router and a Common Coupon Engine differed by one character and a border —
// not what somebody deciding whether to pay 96,000 has in mind. These are the
// game's real models now: the crate is CrateModel, the desk is the same Desk
// the Machine Room places, the instruments are InstrumentModels (which had to
// be built, because instruments were the most-traded thing in the game and the
// only picture of one had always been a placeholder).
//
// ONE CANVAS FOR ALL OF THEM. Each of these is a <View> tracking its own div,
// and they all draw into the single canvas ThumbStage mounts — see the header
// there for why per-thumbnail canvases are not an option in the HUD dock. The
// consequence for callers is small but load-bearing: a ListingThumb draws
// NOTHING unless a ThumbStage is mounted somewhere on the page.

import { useEffect, useRef, useState } from 'react';
import { View } from '@react-three/drei';
import CrateModel from '@/components/three/CrateModel';
import Desk from '@/components/iso/DeskModels';
import Instrument from '@/components/iso/InstrumentModels';
import { ISO } from '@/components/iso/palette';
import { listingAccent, type ListingLike } from '@/lib/listings';
import { asRarity } from '@/lib/rarity';
import { THUMB_ZOOM } from './ThumbStage';

/**
 * Light for one thumbnail.
 *
 * Per-View rather than once on the canvas, because a View renders its own
 * scene: lights outside it do not reach in. Flat and frontal on purpose — a
 * thumbnail is read at 34px, where a dramatic key just makes half the model
 * black.
 */
function ThumbLight() {
  return (
    <>
      <ambientLight intensity={1.5} color="#f2f6f8" />
      <directionalLight position={[6, 10, 8]} intensity={2.1} color="#fff6e2" />
      <directionalLight position={[-8, 4, -6]} intensity={0.7} color="#8fa8ba" />
    </>
  );
}

/**
 * Roughly how tall each kind is, in world units, and how far up its middle sits.
 *
 * Measured off the models rather than guessed: an Equity Desk is a 2.6-unit
 * tower and an instrument is about 1.2, so one scale for both would either
 * crop the desk or render the instrument as a speck. `lift` is what centres a
 * model that is built standing on y=0 — without it everything sits in the
 * bottom half of its box with empty air above it.
 */
const FIT: Record<string, { extent: number; lift: number }> = {
  component: { extent: 1.25, lift: 0.55 },
  /*
   * 3.1, not 1.7. CrateModel is a 2.2-unit box — and under an isometric camera
   * the width that has to fit is the DIAGONAL, 2.2 x root 2, not the side. The
   * first guess used the side and produced a close-up of the lid with the
   * corners cut off, which is exactly what "too zoomed in, can't see the
   * product" describes.
   */
  crate: { extent: 3.1, lift: 0 },
  node: { extent: 3.2, lift: 1.15 },
  cosmetic: { extent: 1.1, lift: 0 },
};

/** The model for a kind, at whatever size the box happens to be. */
function Model({ listing, size }: { listing: ListingLike; size: number }) {
  const item = (listing.item ?? {}) as Record<string, string | number | undefined>;
  const fit = FIT[listing.itemKind] ?? FIT.component;

  /*
   * Fit the model to the BOX, not the other way round.
   *
   * One camera serves every View, so the world each box sees is `size / zoom`
   * units across — 0.59 for a 44px card, 0.43 for a 32px dock row. A model
   * authored at room scale is several times that, which is why the first
   * version rendered a close-up of the middle of every item. 0.98 rather than
   * 1 because the projection is isometric: the widest part of a model is its
   * diagonal, so a box filled exactly to its height clips at the corners.
   */
  const scale = ((size / THUMB_ZOOM) * 0.98) / fit.extent;

  const inner = (() => {
    if (listing.itemKind === 'component') {
      return <Instrument slot={String(item.slot ?? '')} rarity={asRarity(String(item.rarity ?? ''))} />;
    }
    if (listing.itemKind === 'crate') {
      return <CrateModel rarity={asRarity(String(item.rarity ?? 'legendary'))} />;
    }
    if (listing.itemKind === 'node') {
      return <Desk kind={item.family === 'mine' ? 'rack' : 'equity'} accent={ISO.accent} />;
    }
    // Cosmetics have no single model — they are liveries and skins WORN by
    // other things — so they keep a tinted solid rather than borrowing a shape
    // that would misrepresent what is being sold.
    const accent = listingAccent(listing);
    return (
      <mesh rotation={[0.4, 0.8, 0]}>
        <octahedronGeometry args={[0.52, 0]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.8} flatShading />
      </mesh>
    );
  })();

  return (
    <group scale={scale} position={[0, -fit.lift * scale, 0]}>
      {inner}
    </group>
  );
}

/*
 * VIEW RENDERS THE BOX ITSELF. Do not wrap it in a div and pass `track`.
 *
 * That was the first attempt and it drew nothing anywhere, with no error. Used
 * OUTSIDE a Canvas, drei's View takes the `HtmlView` branch, which renders its
 * own element and hands its own ref to the tracker — the `track` prop is
 * accepted and then ignored. So the div being tracked was one View had created
 * and never positioned, while the styled box sat beside it, empty.
 *
 * The `track` prop is only meaningful for a View rendered INSIDE the Canvas.
 * Out here, className and style are the whole API.
 */
export default function ListingThumb({
  listing,
  size = 34,
}: {
  listing: ListingLike;
  size?: number;
}) {
  const box = useRef<HTMLElement | null>(null);
  const [onScreen, setOnScreen] = useState(true);

  /*
   * A View does NOT respect the scroll box it is sitting in.
   *
   * The canvas is one layer over the whole page, so it draws each View at its
   * element's rect whether or not an ancestor has clipped that rect away. In
   * the dock that showed up immediately: rows scrolled below the fold of the
   * market panel kept drawing, so two instruments floated over the Grounds
   * underneath the panel, unattached to anything.
   *
   * An IntersectionObserver answers exactly the right question, because its
   * intersection rect is ALREADY clipped by overflow ancestors.
   *
   * The threshold is 0.9, not a hair above zero, and that is the part worth
   * explaining. A partly-scrolled row is partly visible, so a near-zero
   * threshold calls it visible and the View then draws the WHOLE thumbnail —
   * including the half the panel had clipped off. Requiring the box to be
   * almost entirely in view means a row cut by the fold simply shows its empty
   * slot until you scroll it in, which is why that slot is styled to look like
   * a slot rather than like nothing.
   */
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setOnScreen(entry.intersectionRatio >= 0.9),
      { threshold: [0, 0.9, 1] }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <View
      ref={box as React.Ref<HTMLElement>}
      visible={onScreen}
      className="eg-listing-thumb"
      style={{ width: size, height: size }}
    >
      <ThumbLight />
      <Model listing={listing} size={size} />
    </View>
  );
}
