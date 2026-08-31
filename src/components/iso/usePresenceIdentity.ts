'use client';

// Who this player is, as everybody else's client needs to see them.
//
// Extracted because three regions now put you in a room with other funds — the
// Grounds, HQ and the Trading Floor — and the identity is not one field. It is a
// wallet, a display name that lives on a profile, a level that lives on the
// operation, and a worn avatar that lives in the cosmetics catalogue. Two of
// those need their own fetch.
//
// Copying that into every scene would mean three chances to forget the
// cosmetics call, and forgetting it does not throw: it renders the player
// correctly to themselves and undressed to everybody else, which is the kind of
// bug that survives review because the person testing it looks at their own
// avatar.

import { useEffect, useMemo, useState } from 'react';
import { api, type CosmeticsResponse } from '@/lib/api-client';
import { useOperation } from '@/lib/useOperation';
import type { PresenceIdentity } from './useWorldPresence';

/** The avatar-slot item a catalogue says is being worn, if any. */
function wornAvatar(catalog: CosmeticsResponse | null) {
  return catalog?.items.find((item) => item.slot === 'avatar' && item.equipped) ?? null;
}

export function usePresenceIdentity(): PresenceIdentity {
  const wallet = useOperation((state) => state.wallet);
  const op = useOperation((state) => state.op);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<CosmeticsResponse | null>(null);

  useEffect(() => {
    if (!wallet) { setDisplayName(null); return; }
    let cancelled = false;
    void api.profile(wallet)
      .then((result) => { if (!cancelled) setDisplayName(result.profile?.displayName ?? null); })
      .catch(() => { /* a nameless fund still gets to stand in the world */ });
    return () => { cancelled = true; };
  }, [wallet]);

  useEffect(() => {
    if (!wallet) { setCatalog(null); return; }
    let cancelled = false;
    void api.cosmetics(wallet)
      .then((result) => { if (!cancelled) setCatalog(result); })
      .catch(() => { /* an undressed avatar is still a playable one */ });
    return () => { cancelled = true; };
  }, [wallet]);

  const worn = wornAvatar(catalog);

  // Guests get an identity too, and useWorldPresence refuses to broadcast one
  // without a wallet — so they walk the world seeing everybody, and nobody sees
  // them. That is the correct asymmetry: presence is keyed on the wallet, and
  // every guest would otherwise collide on the same key.
  return useMemo<PresenceIdentity>(
    () =>
      wallet
        ? {
            wallet,
            name: displayName ?? `${wallet.slice(0, 6)}…${wallet.slice(-4)}`,
            tier: op?.level ?? 1,
            outfit: worn?.key ?? null,
            outfitLevel: worn?.level ?? 0,
          }
        : { wallet: 'guest', name: 'Guest', tier: 1 },
    [wallet, displayName, op?.level, worn?.key, worn?.level]
  );
}
