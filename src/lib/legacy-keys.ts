// What the browser is still holding under the Greenwood-era names.
//
// The rest of the Greenwood -> Evergreen rename was free: identifiers, class
// names and copy all ship in the bundle, so renaming them changes nothing that
// already exists on a player's machine. These do not. They are keys into
// storage that already has a value under the OLD name on every machine that has
// played, and renaming a key is indistinguishable, from the far side, from
// deleting what it pointed at -- terms re-accepted, onboarding replayed, a
// saved floor layout gone, a demo fund abandoned half-built.
//
// This is the same reasoning that left OSR_* env vars and osr_* columns alone
// during the last rename, applied to the third place state lives. Here the
// carry-over is cheap enough to do properly, so the new names are authoritative
// and the old ones are read exactly once, on first touch, and copied forward.
//
// This file is the whole list. Once the old keys have aged out of the
// population it can be deleted in a single pass.

/**
 * The Greenwood-era spelling of an Evergreen browser key.
 *
 * Both prefixes are covered because the rename used both: `eg-` for keys that
 * followed the CSS convention, `evergreen` for the namespaced ones.
 */
export function legacyKey(key: string): string {
  return key.replace(/^eg-/, 'gw-').replace(/^evergreen/, 'greenwood');
}

/**
 * Copy a localStorage value forward from its Greenwood-era key, once.
 *
 * Call it immediately before the first read of `key`. It is a no-op when the
 * new key already has a value, so it is safe on every render and safe to leave
 * in place after the old keys are gone.
 */
export function carryOverLocal(key: string): void {
  if (typeof window === 'undefined') return;
  const legacy = legacyKey(key);
  if (legacy === key) return;
  try {
    const store = window.localStorage;
    if (store.getItem(key) !== null) return;
    const carried = store.getItem(legacy);
    if (carried === null) return;
    store.setItem(key, carried);
  } catch {
    // Private mode and blocked storage both land here. Losing the carry-over
    // costs a player one re-acceptance, not correctness.
  }
}

/**
 * Read a cookie, falling back to its Greenwood-era name.
 *
 * Cookies cannot be carried over the way localStorage can -- the server sees
 * whatever the browser sends and cannot write to a jar it is only reading -- so
 * the fallback stays a read. The new name is set on every write, so a session
 * upgrades itself the first time the cookie is reissued.
 *
 * Takes the raw `Cookie` header (server) or `document.cookie` (client); both
 * are the same format.
 */
export function readCookie(header: string | null | undefined, name: string): string | undefined {
  if (!header) return undefined;
  const jar = header.split(';').map((c) => c.trim());
  for (const candidate of [name, legacyKey(name)]) {
    const hit = jar.find((c) => c.startsWith(`${candidate}=`));
    if (hit) return hit.slice(candidate.length + 1);
  }
  return undefined;
}
