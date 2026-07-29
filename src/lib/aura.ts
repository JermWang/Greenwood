// Desk grade — the colour and name that mark how far a desk has been taken.
//
// This was ten tiers of rust, bronze, copper, steel, silver, platinum, amber,
// hot-orange, white-hot and gold, copied wholesale from the previous game's
// AURA_TIERS table. It was a heat-and-metals ramp: exactly right for a foundry,
// and saying nothing at all in a fund.
//
// FIVE BANDS, NOT TEN, and bands rather than levels. Desk levels are uncapped —
// levelMultiplier extrapolates past ten at +0.6 a level — so a table keyed by
// level was always going to run out, and the old one silently clamped at ten,
// so every desk beyond that looked identical anyway. Bands say something a
// player can hold in their head: five names, each covering a stretch of levels,
// and the top one open-ended so there is always a grade for a desk taken
// further than anyone planned for.
//
// The ramp runs muted to bright and ends on Robin Neon. That is the one place
// the brand colour is earned: neon is reserved for branding, signage, UI and
// status, an aura chip is status, and making the top grade the only thing
// wearing it keeps the colour meaning something.

export interface AuraTier {
  color: string;
  label: string;
  /** First desk level in this band. */
  from: number;
  /** Last level, or null for the open-ended top band. */
  to: number | null;
}

/**
 * The five grades, in order.
 *
 * Names read as fund vocabulary rather than metallurgy — a player seeing
 * "Sovereign" knows it outranks "Core" without consulting a legend, which is
 * more than could be said for copper against steel.
 */
export const AURA_BANDS: AuraTier[] = [
  { from: 1, to: 2, label: 'seed', color: '#6f757e' },
  { from: 3, to: 4, label: 'core', color: '#7fa3b8' },
  { from: 5, to: 6, label: 'prime', color: '#5fbf8f' },
  { from: 7, to: 9, label: 'sovereign', color: '#d8b64a' },
  { from: 10, to: null, label: 'benchmark', color: '#ccff00' },
];

/**
 * The band a level falls in.
 *
 * Never returns undefined: anything at or above the top band's floor is the top
 * grade, and anything below the first is the first. A desk cannot be gradeless,
 * and a level arriving as NaN out of a bad parse should still render something
 * rather than crash a dashboard.
 */
export function auraTier(level: number): AuraTier {
  const n = Math.max(1, Math.floor(level) || 1);
  for (const band of AURA_BANDS) {
    if (band.to == null || n <= band.to) return band;
  }
  return AURA_BANDS[AURA_BANDS.length - 1];
}

/** Aura colour for a level, as a CSS/three-friendly hex string. */
export function auraHex(level: number): string {
  return auraTier(level).color;
}

/** Display label for a level's grade, title-cased ("Sovereign"). */
export function auraLabel(level: number): string {
  return auraTier(level)
    .label.split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('-');
}

/** "L5–6" / "L10+", for a legend that has to show what a band covers. */
export function auraRange(band: AuraTier): string {
  if (band.to == null) return `L${band.from}+`;
  return band.from === band.to ? `L${band.from}` : `L${band.from}–${band.to}`;
}
