'use client';

// The Exchange, at the table on the Trading Floor.
//
// IT USED TO BE A PAGE. /app/market was a full screen you navigated to, which
// broke the rule the rest of the game is built on — the Exchange is a place,
// the place is the Trading Floor, and you get there by walking. A separate
// route also meant the market was reachable from anywhere while the room it
// belongs to sat empty, so the one part of the game that needs other people in
// it was the part nobody stood in.
//
// The stalls now open this over the floor: walk to Instruments and the board
// opens filtered to instruments. That is where the CATEGORIES come from — they
// are not a filter bar somebody has to discover, they are the four tables in
// the room, and the tab strip is there so you can move between them without
// walking back.
//
// Three tabs, and each answers a different question: BROWSE is "what can I
// buy", SELL is "what can I put up", HISTORY is "what did I actually pay".
// History is authenticated and private — see api/market/history.

import { useEffect, useMemo, useState } from 'react';
import { Info, Tag, X } from '@phosphor-icons/react';
import ListingThumb from './ListingThumb';
import ThumbStage from './ThumbStage';
import { useMarket, type Sellable } from '@/lib/useMarket';
import {
  listingBlurb,
  listingSubtitle,
  listingTitle,
  sellerLabel,
  type ListingLike,
} from '@/lib/listings';
import type { MarketItemKind, MarketListing } from '@/lib/api-client';

const fmt = (n: number) => Math.round(n).toLocaleString();

/**
 * The categories, in the order the stalls ring the floor.
 *
 * `all` first because somebody who walked in without a plan should see the
 * whole book; the rest match the stall you can be standing at.
 */
const KINDS: Array<{ key: MarketItemKind | 'all'; label: string }> = [
  { key: 'all', label: 'Everything' },
  { key: 'component', label: 'Instruments' },
  { key: 'crate', label: 'Allocations' },
  { key: 'node', label: 'Desks' },
  { key: 'cosmetic', label: 'Wardrobe' },
];

type Tab = 'browse' | 'sell' | 'history';

/** A row that can explain itself. The info button is the whole point. */
function Lot({
  listing,
  action,
  busy,
  onAction,
  feeBps,
}: {
  listing: MarketListing;
  action: 'buy' | 'cancel';
  busy: boolean;
  onAction: () => void;
  feeBps: number;
}) {
  const [why, setWhy] = useState(false);
  const net = listing.priceGreen - Math.floor((listing.priceGreen * feeBps) / 10_000);

  return (
    <li className="mk-lot">
      <ListingThumb listing={listing} size={44} />
      <div className="mk-lot-body">
        <b>{listingTitle(listing)}</b>
        <small>{listingSubtitle(listing)}</small>
        <em>{sellerLabel(listing)}</em>
      </div>
      <div className="mk-lot-buy">
        <span className="mk-price">
          {fmt(listing.priceGreen)} <i>GREEN</i>
        </span>
        {action === 'cancel' && <span className="mk-net">you net {fmt(net)}</span>}
        <div className="mk-lot-actions">
          {/*
            An info button per lot, because the names are jargon by design —
            "Treasury Allocation" is a name, not an explanation, and a player
            deciding whether to spend 7,000 GREEN on one deserves to know it is
            sealed, that opening it costs more, and what comes out.
          */}
          <button
            className={`mk-why${why ? ' is-on' : ''}`}
            onClick={() => setWhy((v) => !v)}
            aria-expanded={why}
            aria-label={`What is a ${listingTitle(listing)}?`}
          >
            <Info size={13} weight="bold" />
          </button>
          <button
            className={action === 'buy' ? 'mk-go' : 'mk-go is-quiet'}
            disabled={busy}
            onClick={onAction}
          >
            {busy ? '…' : action === 'buy' ? 'Buy' : 'Cancel'}
          </button>
        </div>
      </div>
      {why && <p className="mk-blurb">{listingBlurb(listing)}</p>}
    </li>
  );
}

export default function MarketPanel({
  wallet,
  initialKind = 'all',
  onClose,
}: {
  wallet: string | null;
  initialKind?: MarketItemKind | 'all';
  onClose: () => void;
}) {
  const market = useMarket(wallet, true);
  const [tab, setTab] = useState<Tab>('browse');
  const [kind, setKind] = useState<MarketItemKind | 'all'>(initialKind);
  const [picked, setPicked] = useState<Sellable | null>(null);
  const [price, setPrice] = useState('');

  // Walking to a different stall while the board is open should move the board,
  // not be ignored because the panel already had a category when it mounted.
  useEffect(() => setKind(initialKind), [initialKind]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const shown = useMemo(
    () => (kind === 'all' ? market.others : market.others.filter((l) => l.itemKind === kind)),
    [market.others, kind]
  );

  const priceNum = Number(price);
  const valid = picked != null && Number.isFinite(priceNum) && priceNum > 0;
  const net = valid ? priceNum - Math.floor((priceNum * market.feeBps) / 10_000) : 0;

  return (
    <div
      className="mk-scrim"
      // Clicking off the table leaves it, the same as Escape. You walked here;
      // walking away should not need a button hunt.
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
    <section className="mk" role="dialog" aria-label="The Exchange">
      <ThumbStage />
      <header className="mk-head">
        <div>
          <span className="eg-scene-kicker">FUND-TO-FUND · LIVE BOOK</span>
          <h2>The Exchange</h2>
        </div>
        <button className="mk-close" onClick={onClose} aria-label="Leave the table">
          <X size={16} weight="bold" />
        </button>
      </header>

      <nav className="mk-tabs" role="tablist">
        {(['browse', 'sell', 'history'] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            className={tab === t ? 'is-on' : undefined}
            onClick={() => setTab(t)}
          >
            {t === 'browse' ? 'Browse' : t === 'sell' ? 'Sell' : 'History'}
          </button>
        ))}
      </nav>

      {tab === 'browse' && (
        <>
          <div className="mk-kinds">
            {KINDS.map((k) => (
              <button
                key={k.key}
                className={kind === k.key ? 'is-on' : undefined}
                onClick={() => setKind(k.key)}
              >
                {k.label}
                <i>{k.key === 'all' ? market.others.length : market.others.filter((l) => l.itemKind === k.key).length}</i>
              </button>
            ))}
          </div>
          <ul className="mk-list">
            {market.listings === null && <li className="mk-empty">Reading the book…</li>}
            {market.listings !== null && shown.length === 0 && (
              <li className="mk-empty">
                Nothing listed here. The market is entirely player-supplied — it fills up when
                somebody puts something on it.
              </li>
            )}
            {shown.map((l) => (
              <Lot
                key={l.id}
                listing={l}
                action="buy"
                busy={market.busy === l.id}
                feeBps={market.feeBps}
                onAction={() => void market.buy(l)}
              />
            ))}
          </ul>
        </>
      )}

      {tab === 'sell' && (
        <>
          {market.mine.length > 0 && (
            <>
              <p className="mk-kicker">On the board</p>
              <ul className="mk-list">
                {market.mine.map((l) => (
                  <Lot
                    key={l.id}
                    listing={l}
                    action="cancel"
                    busy={market.busy === l.id}
                    feeBps={market.feeBps}
                    onAction={() => void market.cancel(l)}
                  />
                ))}
              </ul>
            </>
          )}

          <p className="mk-kicker">Yours to sell</p>
          {market.sellables.length === 0 ? (
            <p className="mk-empty">
              Nothing spare. Instruments fitted to a desk and cosmetics you are wearing have to
              come off before they can be listed.
            </p>
          ) : (
            <ul className="mk-picks">
              {market.sellables.map((s) => {
                const on = picked?.kind === s.kind && picked.id === s.id;
                return (
                  <li key={`${s.kind}-${s.id}`}>
                    <button
                      className={`mk-pick${on ? ' is-on' : ''}`}
                      onClick={() => setPicked(on ? null : s)}
                    >
                      {s.colour && <i className="mk-pip" style={{ background: s.colour }} />}
                      <span>
                        {s.label}
                        <small>{s.detail}</small>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <form
            className="mk-price-row"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!picked || !valid) return;
              if (await market.list(picked, priceNum)) {
                setPicked(null);
                setPrice('');
              }
            }}
          >
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              inputMode="decimal"
              disabled={!picked}
              placeholder={picked ? `Asking price for the ${picked.label}` : 'Pick something to sell'}
              aria-label="Asking price in GREEN"
              onKeyDown={(e) => e.stopPropagation()}
            />
            <button type="submit" disabled={!valid || market.busy !== null}>
              <Tag size={13} weight="fill" /> {market.busy === 'list' ? '…' : 'List it'}
            </button>
          </form>
          <p className="mk-foot">
            {valid
              ? `You receive ${fmt(net)} GREEN after the ${(market.feeBps / 100).toFixed(2)}% routing fee.`
              : `Sellers keep everything but a ${(market.feeBps / 100).toFixed(2)}% routing fee.`}
          </p>
        </>
      )}

      {tab === 'history' && (
        <ul className="mk-list">
          {market.trades === null && <li className="mk-empty">Pulling your receipts…</li>}
          {market.trades?.length === 0 && (
            <li className="mk-empty">
              You have not traded yet. Anything you buy or sell here shows up in this tab with
              what it cost and who was on the other side.
            </li>
          )}
          {market.trades?.map((t) => {
            const like: ListingLike = {
              itemKind: t.itemKind,
              seller: t.counterparty,
              sellerName: t.counterpartyName,
              item: t.item,
            };
            return (
              <li key={`${t.side}-${t.id}`} className="mk-lot is-trade">
                <ListingThumb listing={like} size={38} />
                <div className="mk-lot-body">
                  <b>{listingTitle(like)}</b>
                  <small>{listingSubtitle(like)}</small>
                  <em>
                    {t.side === 'bought' ? 'from' : 'to'} {sellerLabel(like)} ·{' '}
                    {new Date(t.at).toLocaleDateString()}
                  </em>
                </div>
                <div className="mk-lot-buy">
                  <span className={`mk-side is-${t.side}`}>{t.side}</span>
                  {/* A sale reports what REACHED you; a purchase reports what
                      left. Showing a "net" on a buy would invent a number —
                      the fee comes out of the seller's side. */}
                  <span className="mk-price">
                    {t.side === 'sold' ? fmt(t.netGreen) : fmt(t.priceGreen)} <i>GREEN</i>
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {market.note && <p className="mk-note">{market.note}</p>}
    </section>
    </div>
  );
}
