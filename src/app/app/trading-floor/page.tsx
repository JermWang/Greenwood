'use client';

// The Trading Floor: where funds gather, not where they produce.
//
// Kept as its own route rather than folded into the dashboard, because the two
// answer different questions — the dashboard is "how is my fund doing", this is
// "who else is here and what can I buy". Production lives in the Machine Room.

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { X } from '@phosphor-icons/react';
import { api, type CosmeticsResponse } from '@/lib/api-client';
import { useOperation } from '@/lib/useOperation';
import { useRememberRegion } from '@/lib/last-region';
import QuestPanel from '@/components/ui/QuestPanel';
import CosmeticsShop from '@/components/ui/CosmeticsShop';
import MarketPanel from '@/components/ui/MarketPanel';
import type { MarketItemKind } from '@/lib/api-client';
import type { PresenceIdentity } from '@/components/iso/useWorldPresence';

const IsoTradingFloor = dynamic(() => import('@/components/iso/IsoTradingFloor'), { ssr: false });

/** The avatar-slot item this catalogue says is being worn, if any. */
function wornAvatar(catalog: CosmeticsResponse | null) {
  return catalog?.items.find((item) => item.slot === 'avatar' && item.equipped) ?? null;
}

/**
 * Which slice of the book each market table shows.
 *
 * Keyed off the stall so the room decides the category — walking to the
 * Instruments table is the filter, and the tab strip in the panel is only
 * there so you can change your mind without walking back.
 */
const STALL_KIND: Record<string, MarketItemKind | 'all' | undefined> = {
  instruments: 'component',
  allocations: 'crate',
  desks: 'node',
};

export default function TradingFloorPage() {
  const wallet = useOperation((state) => state.wallet);
  // Recorded so the dashboard's one button can bring you straight back here
  // instead of to the Grounds. See lib/last-region.
  useRememberRegion(wallet, 'trading-floor');
  const op = useOperation((state) => state.op);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<CosmeticsResponse | null>(null);
  const [shopOpen, setShopOpen] = useState(false);
  /** Which category the Exchange is open at, or null when it is shut. */
  const [marketKind, setMarketKind] = useState<MarketItemKind | 'all' | null>(null);

  useEffect(() => {
    if (!wallet) { setDisplayName(null); return; }
    let cancelled = false;
    void api.profile(wallet)
      .then((result) => { if (!cancelled) setDisplayName(result.profile?.displayName ?? null); })
      .catch(() => { /* a nameless fund still gets to stand on the floor */ });
    return () => { cancelled = true; };
  }, [wallet]);

  // Fetched once here rather than inside the scene: the avatar has to know what
  // it is wearing before anyone can see it, including on a first paint where
  // the shop was never opened.
  useEffect(() => {
    if (!wallet) { setCatalog(null); return; }
    let cancelled = false;
    void api.cosmetics(wallet)
      .then((result) => { if (!cancelled) setCatalog(result); })
      .catch(() => { /* an undressed avatar is still a playable one */ });
    return () => { cancelled = true; };
  }, [wallet]);

  const worn = wornAvatar(catalog);

  // Guests get an avatar too. useWorldPresence refuses to broadcast a non-wallet
  // identity, so they can walk the floor without appearing to anyone else.
  const identity: PresenceIdentity = useMemo(
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

  // The shop hands back the catalogue it just changed, so buying a jacket and
  // wearing it repaints the avatar without a round trip of its own.
  const onShopChanged = useCallback((next: CosmeticsResponse) => setCatalog(next), []);

  return (
    <div className="iso-page">
      <IsoTradingFloor
        identity={identity}
        onOpenStall={(key) => {
          if (key === 'outfitter') { setShopOpen(true); return; }
          // The three market tables open the same board, each at its own
          // category — see STALLS in IsoTradingFloor.
          const kind = STALL_KIND[key];
          if (kind) setMarketKind(kind);
        }}
      />

      {/* Docked over the floor rather than on a separate screen: a quest list
          you have to navigate to is a quest list you forget. */}
      <div className="iso-quest-dock">
        <QuestPanel wallet={wallet} />
      </div>

      {shopOpen && (
        <div className="iso-shop-dock" role="dialog" aria-label="The Outfitter">
          <button className="iso-shop-close" onClick={() => setShopOpen(false)} aria-label="Close the Outfitter">
            <X size={16} weight="bold" />
          </button>
          <CosmeticsShop wallet={wallet} balance={op?.greenBalance} onChanged={onShopChanged} />
        </div>
      )}

      {/* The Exchange, over the floor rather than at a route of its own. */}
      {marketKind && (
        <MarketPanel wallet={wallet} initialKind={marketKind} onClose={() => setMarketKind(null)} />
      )}
    </div>
  );
}
