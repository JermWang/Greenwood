'use client';

// The Outfitter — buy a cosmetic, wear it, then keep refining it.
//
// The buy is the small half of this screen. What it is actually built around is
// the track: five named steps on something you already own, each one dearer
// than the last, so the spend does not end the moment the catalogue is
// collected. Every card shows the whole ladder, because a cost you can see is a
// goal and a cost you discover one step at a time is a slot machine.
//
// Nothing here touches yield, and the card says so. A cosmetic that paid better
// than a bare desk would stop being a cosmetic.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowsClockwise, Check, Sparkle, Wallet } from '@phosphor-icons/react';
import {
  api,
  type CosmeticItem,
  type CosmeticSlot,
  type CosmeticsResponse,
  type SettlementStep,
} from '@/lib/api-client';

const SLOT_TABS: Array<{ key: CosmeticSlot; label: string; blurb: string }> = [
  { key: 'avatar', label: 'Wardrobe', blurb: 'Worn by your fund on the Trading Floor.' },
  { key: 'desk', label: 'Desk livery', blurb: 'Applied to every desk in your Machine Room.' },
  { key: 'plinth', label: 'Plinths', blurb: 'The base each desk stands on.' },
];

const STEP_LABEL: Record<SettlementStep, string> = {
  quoting: 'Pricing…',
  preflighting: 'Checking…',
  reviewing: 'Review in wallet…',
  submitting: 'Confirm in wallet…',
  confirming: 'Confirming…',
  settling: 'Settling…',
};

const green = (n: number) => Math.round(n).toLocaleString();

/** Filled pips up to `level`, hollow to the cap — the whole track at a glance. */
function RankPips({ level, max }: { level: number; max: number }) {
  return (
    <span className="shop-pips" aria-label={`Level ${level} of ${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <i key={i} className={i < level ? 'is-on' : ''} />
      ))}
    </span>
  );
}

function Card({
  item,
  maxLevel,
  ethCheckout,
  scrip,
  busy,
  step,
  onBuy,
  onEquip,
  onUnequip,
  onUpgrade,
}: {
  item: CosmeticItem;
  maxLevel: number;
  ethCheckout: boolean;
  /** The wallet's spendable Scrip, for affording the primary button. */
  scrip: number;
  busy: boolean;
  step: SettlementStep | null;
  onBuy: (currency: 'GREEN' | 'ETH' | 'SCRIP') => void;
  onEquip: () => void;
  onUnequip: () => void;
  onUpgrade: () => void;
}) {
  const maxed = item.owned && !item.nextUpgrade;
  return (
    <article className={`shop-card is-${item.tier} ${item.equipped ? 'is-worn' : ''}`}>
      <header>
        <div>
          <b>{item.name}</b>
          <span className="shop-tier">{item.tier}</span>
        </div>
        {item.owned && <em className="shop-rank">{item.rank}</em>}
      </header>

      <p>{item.description}</p>

      {item.owned && (
        <div className="shop-track">
          <RankPips level={item.level} max={maxLevel} />
          <small>
            {item.listed
              ? 'Listed on the Exchange'
              : maxed
                ? 'Top of the track'
                : `Next: ${item.nextUpgrade?.rank} · ${green(item.nextUpgrade?.green ?? 0)} GREEN`}
          </small>
        </div>
      )}

      <div className="shop-actions">
        {!item.owned ? (
          <>
            {/* Scrip leads wherever a piece offers it. It is the currency the
                player already has for playing, and putting the token first
                would make an earnable wardrobe look like a paid one. The GREEN
                price stays visible underneath rather than being hidden, because
                a player sitting on GREEN should still be able to skip the grind. */}
            {item.scrip != null ? (
              <>
                <button
                  className="shop-buy"
                  onClick={() => onBuy('SCRIP')}
                  disabled={busy || scrip < item.scrip}
                  title={scrip < item.scrip ? `You need ${green(item.scrip - scrip)} more Scrip` : undefined}
                >
                  {busy
                    ? step
                      ? STEP_LABEL[step]
                      : '…'
                    : scrip < item.scrip
                      ? `Need ${green(item.scrip)} Scrip`
                      : `Buy · ${green(item.scrip)} Scrip`}
                </button>
                <button className="shop-alt" onClick={() => onBuy('GREEN')} disabled={busy}>
                  {green(item.green)} GREEN
                </button>
              </>
            ) : (
              <button className="shop-buy" onClick={() => onBuy('GREEN')} disabled={busy}>
                {busy ? (step ? STEP_LABEL[step] : '…') : `Buy · ${green(item.green)} GREEN`}
              </button>
            )}
            {ethCheckout && (
              <button className="shop-alt" onClick={() => onBuy('ETH')} disabled={busy}>
                <Wallet size={13} weight="duotone" /> {item.eth} ETH
              </button>
            )}
          </>
        ) : item.listed ? (
          /* A listed item is frozen server-side. Offering Wear or Refine here
             would just produce a 409 after the player had already decided. */
          <span className="shop-frozen">On the Exchange — cancel the listing to use it</span>
        ) : (
          <>
            {item.equipped ? (
              <button className="shop-alt" onClick={onUnequip} disabled={busy}>
                <Check size={13} weight="bold" /> Worn — remove
              </button>
            ) : (
              <button className="shop-alt" onClick={onEquip} disabled={busy}>
                Wear
              </button>
            )}
            {item.nextUpgrade && (
              <button className="shop-buy" onClick={onUpgrade} disabled={busy}>
                {busy ? (
                  step ? STEP_LABEL[step] : '…'
                ) : (
                  <>
                    <Sparkle size={13} weight="fill" /> Refine · {green(item.nextUpgrade.green)} GREEN
                  </>
                )}
              </button>
            )}
          </>
        )}
      </div>

      {/* The ladder, shown before it is bought as well: what this item will cost
          to take all the way is part of deciding whether to start. */}
      <ol className="shop-ladder">
        {item.ladder.map((cost, i) => (
          <li key={i} className={i < item.level ? 'is-done' : ''}>
            <span>{i + 1}</span>
            <b>{green(cost)}</b>
          </li>
        ))}
      </ol>
    </article>
  );
}

export default function CosmeticsShop({
  wallet,
  balance,
  onChanged,
}: {
  wallet: string | null;
  /** Shown against prices so a player can see what they can afford. */
  balance?: number;
  /** Fired after any change, so a host page can refresh what it renders. */
  onChanged?: (catalog: CosmeticsResponse) => void;
}) {
  const [data, setData] = useState<CosmeticsResponse | null>(null);
  const [slot, setSlot] = useState<CosmeticSlot>('avatar');
  const [busy, setBusy] = useState<string | null>(null);
  const [step, setStep] = useState<SettlementStep | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    if (!wallet) { setData(null); return; }
    void api
      .cosmetics(wallet)
      .then((result) => { setData(result); setFailed(false); })
      // A failed read must not render as an empty catalogue: that tells a player
      // who owns six items that they own none.
      .catch(() => setFailed(true));
  }, [wallet]);

  useEffect(() => { load(); }, [load]);

  const apply = useCallback(
    (catalog: CosmeticsResponse) => {
      setData(catalog);
      setFailed(false);
      onChanged?.(catalog);
    },
    [onChanged]
  );

  /** Every action follows the same shape: run it, repaint from what came back. */
  const run = async (key: string, fn: () => Promise<{ catalog: CosmeticsResponse; note: string }>) => {
    if (!wallet) return;
    setBusy(key);
    setError(null);
    setNote(null);
    try {
      const { catalog, note: message } = await fn();
      apply(catalog);
      setNote(message);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not go through');
      // The server is authoritative on what was actually bought, so reconcile
      // rather than leaving the card showing an optimistic state that failed.
      load();
    } finally {
      setBusy(null);
      setStep(null);
    }
  };

  const items = useMemo(() => data?.items.filter((i) => i.slot === slot) ?? [], [data, slot]);
  const owned = data?.items.filter((i) => i.owned).length ?? 0;

  if (!wallet) {
    return <div className="shop-empty">Connect a wallet to visit the Outfitter.</div>;
  }
  if (failed) {
    return (
      <div className="shop-empty">
        Could not reach the Outfitter.{' '}
        <button className="shop-alt" onClick={load}><ArrowsClockwise size={13} /> Retry</button>
      </div>
    );
  }
  if (!data) return <div className="shop-empty">Opening the Outfitter…</div>;

  const tab = SLOT_TABS.find((t) => t.key === slot);

  return (
    <section className="shop">
      <header className="shop-head">
        <div>
          <h2>The Outfitter</h2>
          <small>
            {owned}/{data.items.length} collected · {balance != null ? `${green(balance)} GREEN` : 'Trading Floor'}
          </small>
        </div>
        <nav className="shop-tabs">
          {SLOT_TABS.map((t) => (
            <button
              key={t.key}
              className={t.key === slot ? 'is-active' : ''}
              onClick={() => setSlot(t.key)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <p className="shop-blurb">{tab?.blurb}</p>

      {error && <div className="shop-alert is-bad">{error}</div>}
      {note && !error && <div className="shop-alert">{note}</div>}

      <div className="shop-grid">
        {items.map((item) => (
          <Card
            key={item.key}
            item={item}
            maxLevel={data.maxLevel}
            ethCheckout={data.ethCheckout}
            scrip={data.scrip}
            busy={busy === item.key}
            step={busy === item.key ? step : null}
            onBuy={(currency) =>
              run(item.key, async () => {
                const result = await api.buyCosmetic(wallet, item.key, currency, setStep);
                return {
                  catalog: result.catalog,
                  // Only spelled out for GREEN: the ETH halves are earmarked, not
                  // burned, and rounding them to whole tokens would print "0".
                  note:
                    currency === 'GREEN'
                      ? `${item.name} is yours — ${green(result.burn)} GREEN burned, ${green(result.reserve)} back into rewards.`
                      : `${item.name} is yours.`,
                };
              })
            }
            onEquip={() =>
              run(item.key, async () => ({
                catalog: (await api.equipCosmetic(wallet, item.key)).catalog,
                note: `Wearing ${item.name}.`,
              }))
            }
            onUnequip={() =>
              run(item.key, async () => ({
                catalog: (await api.unequipCosmetic(wallet, item.slot)).catalog,
                note: 'Slot cleared.',
              }))
            }
            onUpgrade={() =>
              run(item.key, async () => {
                const result = await api.upgradeCosmetic(wallet, item.key, setStep);
                return {
                  catalog: result.catalog,
                  note: `${item.name} is now ${result.rank}. +${result.xp.toLocaleString()} Trading XP.`,
                };
              })
            }
          />
        ))}
      </div>

      <footer className="shop-foot">
        <span>
          {data.feeBps / 100}% house cut — half burned, half back into the rewards pool. The treasury
          keeps none of it.
        </span>
        <span>Cosmetics and their levels have no effect on yield, at any rank.</span>
        {!data.ethCheckout && <span>ETH checkout is off while GREEN settlement is live.</span>}
      </footer>
    </section>
  );
}
