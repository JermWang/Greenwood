// Where the brand's own images live, as paths, in one place.
//
// These were string literals scattered across five files — two components, the
// metadata, the icon generator and a disk read — and the cost of that showed up
// the first time the art was replaced: the kit landed under a new directory, the
// old files went away, and every one of those references broke at once. One of
// them was `readFileSync`, so it was not a broken image, it was a crash in the
// route that draws the favicon.
//
// Client-safe on purpose. `lib/brand-mark` reads the mark off disk and therefore
// pulls in `node:fs`, which cannot be imported from a client component — so the
// PATH cannot live there, or the title screen would drag the filesystem into the
// browser bundle to find out what its own logo is called.

/** The mark: a black evergreen on a Robin Neon tile. */
export const MARK_SRC = '/evergreen/logo/ev-mark.svg';

/**
 * The same mark inverted, for placing on Robin Neon.
 *
 * A mark whose silhouette edge is #CCFF00 disappears on a #CCFF00 ground. See
 * the brand rules in public/evergreen/README.md.
 */
export const MARK_INVERSE_SRC = '/evergreen/logo/ev-mark-inverse.svg';

/** Open Graph / Twitter card. 1200x630, which the metadata declares. */
export const SHARE_CARD_SRC = '/evergreen/08-og-share-card-1200x630.png';
