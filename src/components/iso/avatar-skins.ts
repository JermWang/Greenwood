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
