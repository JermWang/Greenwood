'use client';

// Chip Exchange — operator-to-operator routing for real campus assets.

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import dynamic from 'next/dynamic';
import PageShell from '@/components/ui/PageShell';
import ComponentTile from '@/components/ui/ComponentTile';
import {
  api,
  type CosmeticItem,
  type InventoryItem,
  type MarketItemKind,
  type MarketListing,
  type MarketSale,
  type ProtocolOverview,
  type StepHandler,
} from '@/lib/api-client';
import { useOperation } from '@/lib/useOperation';
import { COMPONENT_RARITIES, SLOT_LABELS, rarityHex, type Rarity } from '@/lib/rarity';
import { listingAccent, listingSubtitle, listingTitle, sellerLabel } from '@/lib/listings';

/*
 * The thumbnail is shared with the HUD dock, and `live` is what separates the
 * two: this page has no other 3D on it, so a crate can afford its own canvas.
 * The dock floats over a running region and gets the drawn tile instead.
 */
const ListingThumb = dynamic(() => import('@/components/ui/ListingThumb'), { ssr: false });
/*
 * The one canvas every ListingThumb on this page draws into. Without it the
 * thumbnails render nothing — see the header in ThumbStage.
 */
const ThumbStage = dynamic(() => import('@/components/ui/ThumbStage'), { ssr: false });
/* Still used directly by the sell picker below, which shows crates you own
   rather than listings, and so has no listing to hand a ListingThumb. */
const CrateThumb = dynamic(() => import('@/components/three/CrateThumb'), { ssr: false });

const KINDS: Array<{ key: MarketItemKind | 'all'; label: string }> = [
  { key: 'all', label: 'Everything' },
  { key: 'crate', label: 'Allocations' },
  { key: 'component', label: 'Instruments' },
  { key: 'node', label: 'Equity & Treasury Desks' },
  { key: 'cosmetic', label: 'Wardrobe' },
];

const fmtGreen = (n: number) => Math.round(n).toLocaleString();

export default function MarketPage() {
  const { wallet, op, refresh } = useOperation();
  const [overview, setOverview] = useState<ProtocolOverview | null>(null);
  const [listings, setListings] = useState<MarketListing[] | null>(null);
  const [sales, setSales] = useState<MarketSale[]>([]);
  const [feeBps, setFeeBps] = useState(250);
  const [kind, setKind] = useState<MarketItemKind | 'all'>('all');
  const [tab, setTab] = useState<'browse' | 'sell'>('browse');
  const [busy, setBusy] = useState<number | 'list' | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const say = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3600);
  }, []);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [board, ov] = await Promise.all([
        api.marketListings(kind === 'all' ? undefined : kind),
        api.overview().catch(() => null),
      ]);
      setListings(board.listings);
      setSales(board.sales);
      setFeeBps(board.feeBps);
      if (ov) setOverview(ov);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load the market.");
    }
  }, [kind]);

  useEffect(() => {
    void load();
  }, [load]);

  const buy = async (listing: MarketListing) => {
    if (!wallet) return say('Connect your wallet first');
    setBusy(listing.id);
    try {
      const onStep: StepHandler = (step) =>
        say(step === 'submitting' ? 'Confirm in your wallet…' : 'Working…');
      const res = await api.marketBuy(wallet, listing.id, onStep);
      await Promise.all([load(), refresh()]);
      // Don't claim a clean sale when the seller's payout has not landed.
      say(res.sellerPaid === false ? 'Bought — seller payout is pending' : 'Bought');
    } catch (e) {
      say(e instanceof Error ? e.message : 'Purchase failed');
    } finally {
      setBusy(null);
    }
  };

  const cancel = async (listing: MarketListing) => {
    if (!wallet) return;
    setBusy(listing.id);
    try {
      await api.marketCancel(wallet, listing.id);
      await load();
      say('Listing cancelled');
    } catch (e) {
      say(e instanceof Error ? e.message : 'Could not cancel');
    } finally {
      setBusy(null);
    }
  };

  const mine = useMemo(
    () => (listings ?? []).filter((l) => wallet && l.seller.toLowerCase() === wallet.toLowerCase()),
    [listings, wallet]
  );
  const others = useMemo(
    () => (listings ?? []).filter((l) => !wallet || l.seller.toLowerCase() !== wallet.toLowerCase()),
    [listings, wallet]
  );

  return (
    <PageShell
      title="Exchange"
      subtitle="Route instruments, sealed allocations, and complete desks across the fund network."
      maxWidth="max-w-[1500px]"
    >
      {/* One canvas, behind every thumbnail on the page. */}
      <ThumbStage />
      <div className="exchange-layout">
        <section className="exchange-hero">
          <div><span className="eg-scene-kicker">FUND-TO-FUND / LIVE BOOK</span><h2>Route assets.<br /><em>Reprice yield.</em></h2><p>Every order is backed by a real portfolio asset: an instrument, a sealed allocation, or a complete desk.</p></div>
          <div className="exchange-hero-stats"><span><small>OPEN LOTS</small><strong>{listings?.length ?? '—'}</strong></span><span><small>SETTLED</small><strong>{sales.length}</strong></span><span><small>FEE</small><strong>{(feeBps / 100).toFixed(2)}%</strong></span></div>
        </section>
        <div className="exchange-modebar">
          {(['browse', 'sell'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={tab === t ? 'is-active' : ''}
            >
              {t === 'browse' ? 'Exchange book' : 'Route an asset'}
            </button>
          ))}
          <span className="exchange-fee-note">
            Seller-priced · {(feeBps / 100).toFixed(2)}% routing fee
          </span>
        </div>

        {toast && (
          <div className="rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            {toast}
          </div>
        )}
        {error && (
          <div className="panel border-red-500/40 p-4 text-sm text-red-400">
            <p>{error}</p>
            <button className="btn-secondary mt-3 text-xs" onClick={() => void load()}>
              Retry
            </button>
          </div>
        )}

        {tab === 'browse' ? (
          <>
            <div className="exchange-filters">
              {KINDS.map((k) => (
                <button
                  key={k.key}
                  onClick={() => setKind(k.key)}
                  className={kind === k.key ? 'is-active' : ''}
                >
                  {k.label}
                </button>
              ))}
            </div>

            {listings == null ? (
              <p className="text-sm text-steel-400">Loading…</p>
            ) : listings.length === 0 ? (
              <div className="panel p-6 text-center">
                <p className="text-sm font-semibold text-steel-200">Nothing listed yet</p>
                <p className="mt-1 text-xs text-steel-500">
                  The market is entirely player-supplied — when someone lists an allocation or a desk, it
                  shows up here.
                </p>
              </div>
            ) : (
              <>
                {mine.length > 0 && (
                  <section className="space-y-2">
                    <h2 className="stat-label">Your listings</h2>
                    <div className="exchange-lot-grid">
                      {mine.map((l) => (
                        <ListingCard
                          key={l.id}
                          listing={l}
                          busy={busy === l.id}
                          feeBps={feeBps}
                          action="cancel"
                          onAction={() => void cancel(l)}
                        />
                      ))}
                    </div>
                  </section>
                )}
                <section className="space-y-2">
                  {mine.length > 0 && <h2 className="stat-label">Everyone else</h2>}
                  {others.length === 0 ? (
                    <p className="text-xs text-steel-500">No other listings right now.</p>
                  ) : (
                    <div className="exchange-lot-grid">
                      {others.map((l) => (
                        <ListingCard
                          key={l.id}
                          listing={l}
                          busy={busy === l.id}
                          feeBps={feeBps}
                          action="buy"
                          onAction={() => void buy(l)}
                        />
                      ))}
                    </div>
                  )}
                </section>
              </>
            )}

            {sales.length > 0 && (
              <section className="space-y-2">
                <h2 className="stat-label">Recent sales</h2>
                <div className="panel overflow-x-auto">
                  <table className="w-full whitespace-nowrap text-left text-sm">
                    <thead>
                      <tr className="border-b border-ink-600">
                        <th className="stat-label px-4 py-2.5 font-normal">Item</th>
                        <th className="stat-label px-4 py-2.5 text-right font-normal">Price</th>
                        <th className="stat-label px-4 py-2.5 text-right font-normal">When</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-600/60">
                      {sales.slice(0, 12).map((s, i) => (
                        <tr key={i}>
                          <td className="px-4 py-2 text-xs capitalize text-steel-300">
                            {s.item_kind}
                          </td>
                          <td className="px-4 py-2 text-right font-mono text-white">
                            {fmtGreen(s.sold_price_osr)} GREEN
                          </td>
                          <td className="px-4 py-2 text-right font-mono text-[11px] text-steel-500">
                            {new Date(s.sold_at).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </>
        ) : (
          <SellPanel
            wallet={wallet}
            crates={op?.crates ?? []}
            busy={busy === 'list'}
            feeBps={feeBps}
            onList={async (itemKind, itemId, price) => {
              if (!wallet) return say('Connect your wallet first');
              setBusy('list');
              try {
                await api.marketList(wallet, itemKind, itemId, price);
                await Promise.all([load(), refresh()]);
                setTab('browse');
                say('Listed');
              } catch (e) {
                say(e instanceof Error ? e.message : 'Could not list that');
              } finally {
                setBusy(null);
              }
            }}
          />
        )}

        {overview && (
          <section className="exchange-network-strip">
            <h2 className="stat-label">Network depth</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <StatCard label="Total Nodes" value={String(overview.totalNodes)} />
              <StatCard label="Equity Desks" value={String(overview.totalEquityDesks)} />
              <StatCard label="Treasury Desks" value={String(overview.totalTreasuryDesks)} />
              <StatCard label="Total GREEN Burned" value={fmtGreen(overview.totalGreenBurned)} />
              <StatCard
                label="Protocol ETH Revenue"
                value={`${overview.totalCreatorRewardsProcessed.toFixed(4)} ETH`}
              />
              <StatCard label="GREEN Reserve" value={fmtGreen(overview.greenReserveBalance)} />
            </div>
          </section>
        )}
      </div>
    </PageShell>
  );
}

function ListingCard({
  listing,
  busy,
  feeBps,
  action,
  onAction,
}: {
  listing: MarketListing;
  busy: boolean;
  feeBps: number;
  action: 'buy' | 'cancel';
  onAction: () => void;
}) {
  const accent = listingAccent(listing);
  const net = listing.priceGreen - Math.floor((listing.priceGreen * feeBps) / 10_000);

  return (
    <article className="exchange-lot" style={{ '--lot-accent': accent } as CSSProperties}>
      <span className="exchange-lot-scan" />
      <div className="flex items-center gap-2.5">
        {/* Draws into the page's single ThumbStage canvas — see ListingThumb. */}
        <ListingThumb listing={listing} size={44} />
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold text-white">{listingTitle(listing)}</div>
          <div className="truncate font-mono text-[10px] uppercase" style={{ color: accent }}>
            {listingSubtitle(listing)}
          </div>
        </div>
      </div>

      <div className="mt-auto flex items-baseline justify-between">
        <span className="font-mono text-sm font-bold text-amber-400">
          {fmtGreen(listing.priceGreen)} <small>GREEN</small>
        </span>
        <span className="font-mono text-[10px] text-steel-500">seller nets {fmtGreen(net)}</span>
      </div>
      <button
        className={action === 'buy' ? 'btn-primary text-xs' : 'btn-secondary text-xs'}
        disabled={busy}
        onClick={onAction}
      >
        {busy ? 'Routing…' : action === 'buy' ? 'Acquire lot' : 'Withdraw lot'}
      </button>
      {/* Who is selling. It printed a truncated address even when the seller
          had a profile name, which is the one detail a buyer on a
          player-supplied board actually wants. */}
      <div className="truncate font-mono text-[9px] text-steel-500">{sellerLabel(listing)}</div>
    </article>
  );
}

// `title` and `subtitle` used to live here. They are lib/listings now, because
// the HUD dock needed the same four answers and a second copy of "an Epic Order
// Router is 2.0x" is a second place for that to stop being true.

function SellPanel({
  wallet,
  crates,
  busy,
  feeBps,
  onList,
}: {
  wallet: string | null;
  crates: Array<{ id: number; crateType: 'equity_allocation' | 'treasury_allocation'; foundAt: number }>;
  busy: boolean;
  feeBps: number;
  onList: (kind: MarketItemKind, itemId: number, price: number) => Promise<void>;
}) {
  const [inventory, setInventory] = useState<InventoryItem[] | null>(null);
  const [wardrobe, setWardrobe] = useState<CosmeticItem[] | null>(null);
  const [selected, setSelected] = useState<{ kind: MarketItemKind; id: number } | null>(null);
  const [price, setPrice] = useState('');

  useEffect(() => {
    if (!wallet) return;
    api
      .inventory(wallet)
      .then((r) => setInventory(r.items))
      .catch(() => setInventory([]));
    api
      .cosmetics(wallet)
      .then((r) => setWardrobe(r.items))
      .catch(() => setWardrobe([]));
  }, [wallet]);

  if (!wallet) {
    return (
      <div className="panel p-6 text-center text-sm text-steel-400">
        Connect your wallet to list items for sale.
      </div>
    );
  }

  // Equipped gear is excluded: it has to come off the floor before it can be sold,
  // and offering it here would only produce a server rejection.
  const sellableComponents = (inventory ?? []).filter((i) => i.equippedNodeId == null);
  // Same rule for the wardrobe — owned, not worn, not already on the board.
  const sellableCosmetics = (wardrobe ?? []).filter(
    (c) => c.owned && !c.equipped && !c.listed && c.ownedId != null
  );
  const priceNum = Number(price);
  const valid = selected != null && Number.isFinite(priceNum) && priceNum > 0;
  const net = valid ? priceNum - Math.floor((priceNum * feeBps) / 10_000) : 0;

  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <h2 className="stat-label">Unopened allocations</h2>
        {crates.length === 0 ? (
          <p className="text-xs text-steel-500">No allocations to sell — they turn up as your desks run.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {crates.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelected({ kind: 'crate', id: c.id })}
                className={`flex items-center gap-2 rounded border p-2 transition ${
                  selected?.kind === 'crate' && selected.id === c.id
                    ? 'border-amber-500 bg-amber-500/10'
                    : 'border-ink-600 bg-ink-800 hover:border-steel-500'
                }`}
              >
                <CrateThumb size={36} rarity="legendary" animate={false} />
                <span className="text-[11px] text-steel-300">
                  {c.crateType === 'equity_allocation' ? 'Equity Desk Allocation' : 'Treasury Desk Allocation'}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="stat-label">Unequipped instruments</h2>
        {inventory == null ? (
          <p className="text-xs text-steel-500">Loading…</p>
        ) : sellableComponents.length === 0 ? (
          <p className="text-xs text-steel-500">
            Nothing spare — unequip an instrument from a desk to sell it.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {sellableComponents.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelected({ kind: 'component', id: c.id })}
                className={`flex items-center gap-2 rounded border p-2 transition ${
                  selected?.kind === 'component' && selected.id === c.id
                    ? 'border-amber-500 bg-amber-500/10'
                    : 'border-ink-600 bg-ink-800 hover:border-steel-500'
                }`}
              >
                <ComponentTile slot={c.slot} rarity={c.rarity as Rarity} size={36} />
                <span className="text-[11px] text-steel-300">
                  {SLOT_LABELS[c.slot] ?? c.slot}
                  <span className="ml-1 font-mono" style={{ color: rarityHex(c.rarity as Rarity) }}>
                    {COMPONENT_RARITIES[c.rarity as Rarity]?.label}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="stat-label">Wardrobe</h2>
        {wardrobe == null ? (
          <p className="text-xs text-steel-500">Loading…</p>
        ) : sellableCosmetics.length === 0 ? (
          <p className="text-xs text-steel-500">
            Nothing spare — take a cosmetic off at the Outfitter to sell it. Refinements travel
            with the item, so a higher rank is worth more.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {sellableCosmetics.map((c) => (
              <button
                key={c.key}
                onClick={() => setSelected({ kind: 'cosmetic', id: c.ownedId! })}
                className={`flex items-center gap-2 rounded border p-2 transition ${
                  selected?.kind === 'cosmetic' && selected.id === c.ownedId
                    ? 'border-amber-500 bg-amber-500/10'
                    : 'border-ink-600 bg-ink-800 hover:border-steel-500'
                }`}
              >
                <span
                  className="grid h-9 w-9 place-items-center rounded border border-lime-400/30 bg-lime-400/10 font-mono text-[9px] text-lime-300"
                  aria-hidden
                >
                  {c.level}/5
                </span>
                <span className="text-[11px] text-steel-300">
                  {c.name}
                  <span className="ml-1 font-mono text-lime-300">{c.rank}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="panel space-y-2 p-4">
        <label className="stat-label" htmlFor="market-price">
          Ask price (GREEN)
        </label>
        <input
          id="market-price"
          type="number"
          min={1}
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="e.g. 25000"
          className="w-full rounded border border-ink-600 bg-ink-900 px-3 py-2 font-mono text-sm text-white outline-none focus:border-amber-500"
        />
        <p className="text-[11px] text-steel-500">
          You set the price — the protocol takes {(feeBps / 100).toFixed(2)}% and nothing else.
          {valid && (
            <>
              {' '}
              You would receive <span className="font-mono text-amber-400">{fmtGreen(net)} GREEN</span>.
            </>
          )}
        </p>
        <button
          className="btn-primary w-full text-sm"
          disabled={!valid || busy}
          onClick={() => selected && void onList(selected.kind, selected.id, priceNum)}
        >
          {busy ? 'Listing…' : selected ? 'List for sale' : 'Pick an item above'}
        </button>
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel p-4">
      <p className="stat-label">{label}</p>
      <p className="mt-1 break-words font-mono text-lg text-white">{value}</p>
    </div>
  );
}
