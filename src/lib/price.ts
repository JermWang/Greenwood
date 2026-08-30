// GREEN price discovery.
//
// Crates are priced in dollars, so the engine needs to know what GREEN is worth.
// There is no oracle on Robinhood Chain, and inventing a price is worse than
// having none: too high and every operator is overcharged, too low and crates
// are effectively free. So this module reports a price or reports nothing, and
// callers refuse to charge when it reports nothing.

import { getProtocolValue, setProtocolValue } from './db';

/**
 * Manual price override, in USD per GREEN.
 *
 * Until GREEN trades there is no market to read, and after it lists there is no
 * oracle on this chain — so the operator sets this and the protocol trusts it.
 * Kept in the protocol table rather than an env var so it can be updated
 * without a redeploy while the token finds its price.
 */
const PRICE_KEY = 'osr_usd_price';
const PRICE_SET_AT_KEY = 'osr_usd_price_set_at';

/**
 * How long a manually-set price stays trusted.
 *
 * A stale price is a real hazard: if GREEN 10x'd a week ago and nobody updated
 * this, crates would be selling for a tenth of their intended cost. Expiring
 * forces the number to be maintained rather than silently rotting.
 */
export const PRICE_MAX_AGE_MS = Number(process.env.OSR_PRICE_MAX_AGE_MS ?? 24 * 3600 * 1000);

export interface PriceInfo {
  usdPerGreen: number | null;
  setAtMs: number | null;
  ageMs: number | null;
  stale: boolean;
}

export function getOsrUsdPrice(): PriceInfo {
  const raw = getProtocolValue(PRICE_KEY);
  const setAtRaw = getProtocolValue(PRICE_SET_AT_KEY);
  const price = raw == null ? null : Number(raw);
  const setAt = setAtRaw == null ? null : Number(setAtRaw);

  if (price == null || !Number.isFinite(price) || price <= 0) {
    return { usdPerGreen: null, setAtMs: null, ageMs: null, stale: true };
  }
  const ageMs = setAt == null ? null : Date.now() - setAt;
  const stale = ageMs == null || ageMs > PRICE_MAX_AGE_MS;
  // A stale price is reported as no price at all — callers must not fall back
  // to the last known figure, which is precisely how mispricing persists.
  return { usdPerGreen: stale ? null : price, setAtMs: setAt, ageMs, stale };
}

export function setOsrUsdPrice(usdPerGreen: number) {
  if (!Number.isFinite(usdPerGreen) || usdPerGreen <= 0) {
    throw new Error('price must be a positive number');
  }
  setProtocolValue(PRICE_KEY, String(usdPerGreen));
  setProtocolValue(PRICE_SET_AT_KEY, String(Date.now()));
}
