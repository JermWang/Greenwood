'use client';

// Fund Overview furniture: the profile card, the three collection strips, the
// scheduled-events list and the changelog.
//
// The shape is borrowed from Kintara's dashboard, where the first screen answers
// "who am I, what do I own, and what is about to happen" before it answers
// anything about the world. Everything here is READ-ONLY — no component in this
// file spends, claims or mutates. That is deliberate: a summary screen that can
// also take actions is a screen where a misread number costs tokens.
//
// No image assets exist in this project and none are added. Every visual is a
// glyph, a colour, or SVG written inline.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  api,
  type CosmeticsResponse,
  type GlobalProfile,
  type InventoryItem,
  type NodeInfo,
  type ProtocolOverview,
  type QuestsResponse,
} from '@/lib/api-client';
import { COMPONENT_RARITIES, RARITIES, rarityHex, type Rarity } from '@/lib/rarity';
import { auraHex } from '@/lib/aura';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function compact(n: number, digits = 0): string {
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  // Abbreviated from a thousand rather than ten thousand: these numbers sit in
  // 82px tiles, where "12,000" wraps and "12.0K" does not.
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(digits);
}

const shortWallet = (wallet: string) => `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;

/** FNV-1a, matching the hash the quest roll uses, so identities stay stable. */
function hashOf(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * A clock that only starts after mount.
 *
 * Returning null on the first render keeps the server and client markup
 * identical — a countdown rendered during SSR is wrong by the time it is
 * hydrated, and React calls that a mismatch.
 */
function useNow(active: boolean): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

function formatRemaining(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return 'now';
  const total = Math.floor(ms / 1000);
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

// ---------------------------------------------------------------------------
// Identicon
// ---------------------------------------------------------------------------

/**
 * A deterministic 5x5 mirrored monogram, neon on Robin Black.
 *
 * Mirroring the left three columns is what makes a random bitmap read as a
 * crest rather than as noise, and it costs nothing: the same wallet always
 * produces the same crest on every device, with no asset to ship.
 */
function Identicon({ wallet }: { wallet: string }) {
  const cells = useMemo(() => {
    let state = hashOf(wallet.toLowerCase()) || 1;
    const next = () => {
      // xorshift32 — enough spread for 15 draws, and reproducible everywhere.
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      state >>>= 0;
      return state / 4294967296;
    };
    const out: Array<{ x: number; y: number; opacity: number }> = [];
    for (let y = 0; y < 5; y += 1) {
      for (let x = 0; x < 3; x += 1) {
        const roll = next();
        if (roll < 0.42) continue;
        const opacity = roll > 0.84 ? 1 : roll > 0.64 ? 0.6 : 0.28;
        out.push({ x, y, opacity });
        if (x < 2) out.push({ x: 4 - x, y, opacity });
      }
    }
    return out;
  }, [wallet]);

  return (
    <svg className="fund-identicon" viewBox="0 0 5 5" role="img" aria-label="Fund crest">
      {cells.map((cell) => (
        <rect
          key={`${cell.x}-${cell.y}`}
          x={cell.x + 0.06}
          y={cell.y + 0.06}
          width={0.88}
          height={0.88}
          rx={0.2}
          fill="var(--accent)"
          opacity={cell.opacity}
        />
      ))}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Profile card
// ---------------------------------------------------------------------------

export function FundProfileCard({
  wallet,
  quests,
  tier,
  deskCount,
  bntyBalance,
}: {
  wallet: string | null;
  quests: QuestsResponse | null;
  tier: number;
  deskCount: number;
  bntyBalance: number;
}) {
  const [profile, setProfile] = useState<GlobalProfile | null>(null);

  useEffect(() => {
    if (!wallet) {
      setProfile(null);
      return;
    }
    let live = true;
    void api
      .profile(wallet)
      .then((res) => {
        if (live) setProfile(res.profile);
      })
      .catch(() => {
        // The profiles service is optional; the truncated address is a fine name.
        if (live) setProfile(null);
      });
    return () => {
      live = false;
    };
  }, [wallet]);

  if (!wallet) return null;

  // The address is only worth a second line when it is not already the name.
  const displayName = profile?.displayName?.trim();
  const name = displayName || shortWallet(wallet);
  const tracks = quests?.progression.tracks ?? [];

  return (
    <section className="fund-profile-card" aria-label="Fund profile">
      <div className="fund-identicon-frame">
        <Identicon wallet={wallet} />
        <span className="fund-monogram">{wallet.slice(2, 4).toUpperCase()}</span>
      </div>

      <div className="fund-profile-identity">
        <span className="fund-kicker">FUND PROFILE</span>
        <h2>{name}</h2>
        {displayName && <span className="fund-profile-addr">{shortWallet(wallet)}</span>}
        <div className="fund-profile-stats">
          <div>
            <small>PORTFOLIO TIER</small>
            <b>{String(tier).padStart(2, '0')}</b>
          </div>
          <div>
            <small>DESKS</small>
            <b>{deskCount}</b>
          </div>
          <div>
            <small>BNTY BALANCE</small>
            <b>{compact(bntyBalance)}</b>
          </div>
        </div>
      </div>

      <div className="fund-profile-progress">
        <div className="fund-level-hero">
          <small>TOTAL LEVEL</small>
          <strong>{quests ? quests.progression.totalLevel : '—'}</strong>
        </div>

        <div className="fund-track-grid">
          {tracks.length === 0 && <p className="fund-track-empty">XP tracks syncing…</p>}
          {tracks.map((track) => {
            const pct = track.levelSpan > 0 ? (track.intoLevel / track.levelSpan) * 100 : 0;
            return (
              <div className="fund-track" key={track.key} title={track.blurb}>
                <span>{track.name}</span>
                <b>L{track.level}</b>
                <div className="fund-track-bar">
                  <i style={{ width: `${Math.max(2, Math.min(100, pct))}%` }} />
                </div>
              </div>
            );
          })}
        </div>

        <div className="fund-profile-cta">
          <Link className="btn-primary" href="/app/trading-floor">
            Enter the Trading Floor
          </Link>
          <Link className="btn-secondary" href="/app/floor">
            Machine Room
          </Link>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Collection strips
// ---------------------------------------------------------------------------

function Strip({
  title,
  total,
  subtitle,
  children,
}: {
  title: string;
  total: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="fund-strip">
      <div className="fund-strip-head">
        <span>{title}</span>
        <b>{total}</b>
      </div>
      <div className="fund-strip-sub">{subtitle}</div>
      {children}
    </section>
  );
}

/** Initials for a cosmetic, so a tile reads as itself without an image. */
function initials(name: string): string {
  const words = name.split(/[\s'’]+/).filter(Boolean);
  if (words.length === 0) return '??';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function CollectionStrips({ wallet, nodes }: { wallet: string | null; nodes: NodeInfo[] }) {
  const [items, setItems] = useState<InventoryItem[] | null>(null);
  // Tracked separately from `items` because "the read failed" and "you own
  // nothing" are different sentences, and showing the second one for the first
  // tells a player with a full inventory that it is gone.
  const [itemsFailed, setItemsFailed] = useState(false);
  const [cosmetics, setCosmetics] = useState<CosmeticsResponse | null>(null);

  useEffect(() => {
    if (!wallet) {
      setItems(null);
      setItemsFailed(false);
      setCosmetics(null);
      return;
    }
    let live = true;
    setItemsFailed(false);
    void api
      .inventory(wallet)
      .then((res) => {
        if (live) setItems(res.items);
      })
      .catch(() => {
        if (live) setItemsFailed(true);
      });
    void api
      .cosmetics(wallet)
      .then((res) => {
        if (live) setCosmetics(res);
      })
      .catch(() => {
        if (live) setCosmetics(null);
      });
    return () => {
      live = false;
    };
  }, [wallet]);

  const byRarity = useMemo(() => {
    const counts = new Map<Rarity, number>(RARITIES.map((r) => [r, 0]));
    for (const item of items ?? []) {
      const rarity = item.rarity as Rarity;
      if (counts.has(rarity)) counts.set(rarity, (counts.get(rarity) ?? 0) + 1);
    }
    return counts;
  }, [items]);

  if (!wallet) return null;

  const equityDesks = nodes.filter((node) => node.type === 'oil');
  const treasuryDesks = nodes.filter((node) => node.type === 'mine');
  const orderedDesks = [...equityDesks, ...treasuryDesks];
  const ownedCosmetics = cosmetics?.items.filter((item) => item.owned).length ?? 0;
  const equippedCount = cosmetics?.items.filter((item) => item.equipped).length ?? 0;
  const fitted = (items ?? []).filter((item) => item.equippedNodeId != null).length;

  return (
    <div className="fund-strip-grid">
      <Strip
        title="INSTRUMENTS"
        total={items ? String(items.length) : '—'}
        subtitle={
          itemsFailed
            ? 'Inventory unavailable'
            : items
              ? `${fitted} fitted · ${items.length - fitted} in reserve`
              : 'Reading inventory…'
        }
      >
        {itemsFailed ? (
          <p className="fund-strip-none">Could not read your instruments. Retrying on the next sync.</p>
        ) : items && items.length === 0 ? (
          <p className="fund-strip-none">No instruments yet. Open an allocation to recover your first.</p>
        ) : (
          <div className="fund-strip-rail">
            {RARITIES.map((rarity) => {
              const count = byRarity.get(rarity) ?? 0;
              const hex = rarityHex(rarity);
              return (
                <div
                  key={rarity}
                  className={`fund-tile ${count === 0 ? 'is-empty' : ''}`}
                  style={{ color: hex, borderColor: count > 0 ? `${hex}55` : undefined }}
                >
                  <span className="fund-tile-glyph">{rarity.slice(0, 1).toUpperCase()}</span>
                  <b>{count}</b>
                  <small>{COMPONENT_RARITIES[rarity].label}</small>
                </div>
              );
            })}
          </div>
        )}
      </Strip>

      <Strip
        title="COSMETICS"
        total={cosmetics ? `${ownedCosmetics}/${cosmetics.items.length}` : '—'}
        subtitle={
          cosmetics
            ? `${equippedCount} equipped · ${cosmetics.items.length - ownedCosmetics} unowned`
            : 'Reading catalogue…'
        }
      >
        {!cosmetics ? (
          <p className="fund-strip-none">Cosmetics catalogue unavailable.</p>
        ) : (
          <div className="fund-strip-rail">
            {cosmetics.items.map((item) => (
              <div
                key={item.key}
                className={`fund-tile ${item.equipped ? 'is-equipped' : ''} ${item.owned ? '' : 'is-empty'}`}
                title={item.description}
              >
                <span className="fund-tile-glyph">{item.owned ? initials(item.name) : '·'}</span>
                <b className="fund-tile-name">{item.name}</b>
                <small>
                  {item.equipped ? 'EQUIPPED' : item.owned ? 'OWNED' : `${compact(item.bnty)} BNTY`}
                </small>
              </div>
            ))}
          </div>
        )}
      </Strip>

      <Strip
        title="DESKS"
        total={String(nodes.length)}
        subtitle={`${equityDesks.length} Equity · ${treasuryDesks.length} Treasury`}
      >
        {orderedDesks.length === 0 ? (
          <p className="fund-strip-none">No desks open. Opening one starts your yield.</p>
        ) : (
          <div className="fund-strip-rail">
            {orderedDesks.map((node) => {
              const hex = auraHex(node.level);
              return (
                <div key={node.id} className="fund-tile" style={{ color: hex, borderColor: `${hex}55` }}>
                  <span className="fund-tile-glyph">{node.type === 'oil' ? '◎' : '◇'}</span>
                  <b>L{node.level}</b>
                  <small>{node.type === 'oil' ? 'Equity Desk' : 'Treasury Desk'}</small>
                </div>
              );
            })}
          </div>
        )}
      </Strip>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scheduled events
// ---------------------------------------------------------------------------

interface ScheduledEvent {
  key: string;
  glyph: string;
  title: string;
  detail: string;
  /** Absolute wall-clock deadline. */
  deadline: number;
}

export function EventsPanel({
  overview,
  quests,
  claimCooldownMs,
}: {
  overview: ProtocolOverview | null;
  quests: QuestsResponse | null;
  claimCooldownMs: number;
}) {
  // Both the quest reset and the claim cooldown arrive as durations measured at
  // the moment the server answered. Anchoring them to a deadline the instant the
  // value changes is what lets a 1s tick count them down without re-fetching —
  // and re-anchoring on every poll keeps the server authoritative.
  const questDeadline = useMemo(
    () => (quests ? Date.now() + quests.resetsInMs : null),
    [quests]
  );
  const cooldownDeadline = useMemo(
    () => (claimCooldownMs > 0 ? Date.now() + claimCooldownMs : null),
    [claimCooldownMs]
  );

  const events: ScheduledEvent[] = [];
  if (overview) {
    events.push({
      key: 'halving',
      glyph: '½',
      title: 'Next halving',
      detail: `Emission ${overview.halving.currentRatePerSec.toFixed(4)} → ${overview.halving.nextRatePerSec.toFixed(4)} BNTY/s`,
      deadline: overview.halving.nextHalvingMs,
    });
  }
  if (questDeadline != null) {
    events.push({
      key: 'quests',
      glyph: '↻',
      title: 'Daily quests reset',
      detail: `${quests?.quests.filter((q) => q.claimed).length ?? 0}/${quests?.quests.length ?? 0} claimed today`,
      deadline: questDeadline,
    });
  }
  if (cooldownDeadline != null) {
    events.push({
      key: 'cooldown',
      glyph: '⏻',
      title: 'Claim cooldown',
      detail: 'Yield buffer locked until this clears',
      deadline: cooldownDeadline,
    });
  }
  events.sort((a, b) => a.deadline - b.deadline);

  const now = useNow(events.length > 0);

  return (
    <section className="fund-panel" aria-label="Scheduled events">
      <div className="fund-strip-head">
        <span>SCHEDULE</span>
        <b>{events.length}</b>
      </div>
      <div className="fund-strip-sub">Live protocol and fund timers</div>
      <div className="fund-event-list">
        {events.length === 0 && <p className="fund-strip-none">Nothing scheduled right now.</p>}
        {events.map((event) => (
          <div className="fund-event" key={event.key}>
            <span className="fund-event-glyph" aria-hidden>
              {event.glyph}
            </span>
            <span>
              <strong>{event.title}</strong>
              <small>{event.detail}</small>
            </span>
            <span className="fund-event-clock">
              {now == null ? '—' : formatRemaining(event.deadline - now)}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Recent updates
// ---------------------------------------------------------------------------

/**
 * What actually shipped, newest first. Hand-maintained on purpose: a changelog
 * generated from commits reads like a commit log, which is exactly the thing a
 * player will not read.
 */
const CHANGELOG: Array<{ tag: string; title: string; body: string }> = [
  {
    tag: 'BRAND',
    title: 'Robin Neon rebrand',
    body: 'The whole app moved to Robin Neon on Robin Black with heather greys — neon reserved for signage, primary actions and positive values.',
  },
  {
    tag: 'ECONOMY',
    title: 'Cosmetics economy',
    body: 'Skins buyable in BNTY or ETH with a 2% house cut: half burned, half returned to the rewards reserve. They never touch yield.',
  },
  {
    tag: 'PROGRESSION',
    title: 'Daily quests and XP tracks',
    body: 'Three quests a day feed four XP tracks — Trading, Treasury, Scouting and Operations — that sum into your Total Level.',
  },
  {
    tag: 'RENDERER',
    title: 'Isometric floor rebuild',
    body: 'The trading floor was rebuilt as a walkable isometric scene with live desks, so the digital twin and the game are the same view.',
  },
];

export function RecentUpdates() {
  return (
    <section className="fund-panel" aria-label="Recent updates">
      <div className="fund-strip-head">
        <span>RECENT UPDATES</span>
        <b>{CHANGELOG.length}</b>
      </div>
      <div className="fund-strip-sub">What shipped lately</div>
      <div className="fund-update-list">
        {CHANGELOG.map((entry) => (
          <article className="fund-update" key={entry.title}>
            <span>{entry.tag}</span>
            <strong>{entry.title}</strong>
            <p>{entry.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
