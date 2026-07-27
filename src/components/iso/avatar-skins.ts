// How each avatar cosmetic changes the model — the data, with no JSX attached.
//
// Split out of Character.tsx for the same reason floor-rules.ts was split out of
// lib/floor: the numbers have to be readable by something that cannot load the
// component. Here that something is the test suite, which runs under a config
// with `jsx: preserve` and therefore cannot import a .tsx file at all. Without
// this split, the one invariant worth asserting — that every avatar cosmetic in
// the catalogue has a row here, and so is actually visible once bought — could
// not be checked by anything but a person remembering to.

import { ISO } from './palette';

export interface AvatarSkin {
  /** Jacket / body colour. */
  shell: string;
  /** Accent used on the collar band and shoulder pips. */
  trim: string;
  /** Lit piping down the sleeves. */
  piping: boolean;
  /** Glove colour, when the piece changes the hands. */
  hand?: string;
  /** Boot colour, when the piece changes the feet. */
  boot?: string;
  /** Eye colour. Lit when set, which is the entire point of Laser Eyes. */
  eyes?: string;
}

/**
 * Every avatar cosmetic, keyed exactly as in lib/cosmetics.
 *
 * A cosmetic is defined by how it renders, so adding one to the catalogue and
 * adding it here are one change, not two. An entry missing from this map is a
 * purchase that changes nothing on the model — the player pays, equips it, and
 * looks identical. cosmetics-catalog.test.ts fails if the two lists drift.
 */
export const AVATAR_SKINS: Record<string, AvatarSkin> = {
  avatar_house_jacket: { shell: '#2f3128', trim: ISO.deep, piping: false },
  avatar_market_maker: { shell: '#1e1f1a', trim: ISO.accent, piping: true },

  avatar_quarter_zip: { shell: '#3a4048', trim: '#5b6570', piping: false },
  // The one deliberate exception to "never dress the world in Robin Neon": on a
  // hi-vis vest the brand colour is the REAL colour, not a tint. It is also the
  // joke — the fund's own branding turning out to be site safety kit is the turn
  // in miniature.
  avatar_hi_vis: { shell: ISO.accent, trim: '#2b2a24', piping: false },
  avatar_hard_hat: { shell: '#4a4d44', trim: ISO.amber, piping: false },
  avatar_diamond_hands: { shell: '#2c3340', trim: '#bfe8f5', piping: false, hand: '#cfeef8' },
  avatar_paper_hands: { shell: '#4a4740', trim: '#d8d2c4', piping: false, hand: '#e8e2d4' },
  avatar_laser_eyes: { shell: '#1b1c18', trim: '#ff2d2d', piping: false, eyes: '#ff2d2d' },
  avatar_bag_holder: { shell: '#5a4a34', trim: '#8a7350', piping: false },
  avatar_night_shift: { shell: '#24262a', trim: '#7f8a94', piping: true, boot: '#17181a' },
  avatar_first_thousand: { shell: '#3b3a35', trim: ISO.bright, piping: false, boot: '#1d1c18' },
};

/**
 * Limb ends when nothing overrides them.
 *
 * Hands take the head's skin tone; boots are darker than the leg so the foot
 * separates from the shin at a glance instead of reading as one long block.
 */
export const HAND = { kind: 'hand', color: ISO.pale } as const;
export const BOOT = { kind: 'boot', color: '#26251f' } as const;

/**
 * Head shapes. The catalogue side of the Hat component in Character.
 *
 * Silhouette is the cheapest identity available in a game drawn from flat-shaded
 * boxes: a hard hat and a beanie read as different people at a distance where a
 * jacket colour has already washed out. Everybody wearing the same peaked cap
 * made the head — the first place the eye lands — the one part of the model that
 * could not tell two characters apart.
 */
export type HatStyle = 'cap' | 'beanie' | 'hardhat' | 'visor' | 'bucket' | 'bare';

export interface HatOption {
  id: HatStyle;
  name: string;
  /** One line for the closet. What it says about the wearer. */
  blurb: string;
}

export const HAT_STYLES: HatOption[] = [
  { id: 'cap', name: 'Field Cap', blurb: 'Standard issue. Flat crown, forward peak.' },
  { id: 'beanie', name: 'Watch Cap', blurb: 'For the night shift and the north end.' },
  { id: 'hardhat', name: 'Hard Hat', blurb: 'Site kit. Nobody asks what you are doing in one.' },
  { id: 'visor', name: 'Dealer Visor', blurb: 'Trading floor habit. Keeps the strip lights off the numbers.' },
  { id: 'bucket', name: 'Bucket Hat', blurb: 'Wide brim, low brim, no explanation.' },
  { id: 'bare', name: 'Bare Head', blurb: 'Nothing at all.' },
];

/**
 * Skin tones.
 *
 * FREE, and never sold. This is identity rather than drip — a player choosing
 * what they look like should not be a purchase, and putting a paywall between
 * somebody and their own face is the kind of decision a game only gets to make
 * once. Hats, jackets, trims and boots are the sellable part; this is not.
 *
 * The first entry is the historical default, so every character that predates
 * this list is unchanged by it.
 *
 * A deliberately wide range rather than three shades of the same beige. Ordered
 * light to deep so a picker reads as a spectrum instead of as a ranking.
 */
export interface SkinTone {
  id: string;
  name: string;
  hex: string;
}

export const SKIN_TONES: SkinTone[] = [
  { id: 'porcelain', name: 'Porcelain', hex: '#d4d2cf' },
  { id: 'ivory', name: 'Ivory', hex: '#e8d5c0' },
  { id: 'sand', name: 'Sand', hex: '#e0be9a' },
  { id: 'honey', name: 'Honey', hex: '#cfa070' },
  { id: 'amber', name: 'Amber', hex: '#b8834f' },
  { id: 'clay', name: 'Clay', hex: '#9c6640' },
  { id: 'umber', name: 'Umber', hex: '#7a4d30' },
  { id: 'cocoa', name: 'Cocoa', hex: '#5e3a24' },
  { id: 'espresso', name: 'Espresso', hex: '#42281a' },
];

const TONES_BY_ID = new Map(SKIN_TONES.map((t) => [t.id, t]));

/** A tone by id, falling back to the default rather than to nothing. */
export function skinToneHex(id: string | null | undefined): string {
  return (id ? TONES_BY_ID.get(id)?.hex : undefined) ?? SKIN_TONES[0].hex;
}
