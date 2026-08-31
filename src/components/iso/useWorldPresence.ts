'use client';

// Live presence for a region, on a shard.
//
// Built on Supabase Presence rather than a table, because where a player is
// standing is ephemeral: it should vanish when they close the tab, and it must
// not generate write load on every step. The leaderboard and profile pages
// already use realtime channels, so this follows the same pattern.
//
// Degrades to "just you" when Supabase is not configured — getBrowserSupabase
// returns null in that case, and the floor must still be playable.

import { useEffect, useMemo, useRef, useState } from 'react';
import { getBrowserSupabase } from '@/lib/supabase-browser';
import { regionById, type RegionId } from '@/lib/regions';
import { shardFromCookie } from '@/lib/shards';

export interface FloorPeer {
  wallet: string;
  name: string;
  tier: number;
  x: number;
  z: number;
  /** Avatar cosmetic key currently worn, if any. Drives which model is drawn. */
  outfit?: string | null;
  /** How far that cosmetic has been taken up its upgrade track. */
  outfitLevel?: number;
  /** True for the local player, who is drawn differently. */
  isSelf?: boolean;
}

export interface PresenceIdentity {
  wallet: string;
  name: string;
  tier: number;
  /**
   * What this player is wearing. Broadcast rather than looked up per peer: the
   * alternative is every client fetching every other client's cosmetics, which
   * turns a busy floor into N² requests for something that changes rarely.
   */
  outfit?: string | null;
  outfitLevel?: number;
}


/**
 * How often this client tells the SERVER which world it is in.
 *
 * Two orders of magnitude slower than the position broadcast, and a different
 * question: presence is 'where am I standing', this is 'which world am I in',
 * and only the second needs to survive a page the player is not looking at.
 * It feeds the shard picker's population counts -- see lib/world-presence.
 */
const HEARTBEAT_MS = 30_000;

/**
 * How often a moving player broadcasts a new position.
 *
 * POSITION GOES BY BROADCAST, NOT PRESENCE, and that split is the whole fix.
 *
 * It was one presence track() every 220ms, and that did not merely cost too
 * much — it broke multiplayer outright. Supabase enforces a per-client
 * PRESENCE rate limit, and tripping it is terminal rather than lossy: the
 * server answers "Client presence rate limit exceeded", sends phx_close, and
 * every later track() times out. A player went invisible to everybody else a
 * few seconds after arriving and stayed that way for the rest of the session.
 *
 * Measured against this project: at 220ms, 400ms, 700ms, 1200ms AND 2000ms the
 * channel is closed within a handful of updates. There is no cadence slow
 * enough to carry a walk through presence, so presence stopped carrying it.
 *
 * Broadcast has no such ceiling here — 58 of 60 messages at this exact 220ms
 * cadence, no errors, no close. So presence now carries only the ROSTER (who
 * is here, what they look like), announced once on arrival, and broadcast
 * carries the movement. That is also what Supabase documents each for.
 */
const MOVE_INTERVAL_MS = 220;

/**
 * How long to wait before rebuilding a channel the server closed.
 *
 * Without this, one rate-limit trip is permanent for the session. With it, the
 * worst case is a few seconds of being invisible.
 */
const REJOIN_DELAY_MS = 5_000;

export function useWorldPresence(
  region: RegionId,
  me: PresenceIdentity | null,
  position: { x: number; z: number }
): { peers: FloorPeer[]; live: boolean } {
  const [others, setOthers] = useState<FloorPeer[]>([]);
  const [live, setLive] = useState(false);
  /** Bumped to rebuild the channel after the server closes it. */
  const [epoch, setEpoch] = useState(0);
  // Held in a ref so the throttled tracker always sends the latest position
  // without the subscription having to be torn down and rebuilt on every step.
  const positionRef = useRef(position);
  positionRef.current = position;
  const identityRef = useRef(me);
  identityRef.current = me;

  useEffect(() => {
    // Guests render their own avatar but never broadcast: without a wallet
    // there is no stable presence key, and every guest would collide on one.
    if (!me?.wallet || !me.wallet.startsWith('0x')) return;
    // A solo region opens no channel at all. The Machine Room is one fund's own
    // floor, and the cost of getting this wrong is not a wasted socket, it is
    // strangers standing in somebody's workspace.
    if (regionById(region)?.presence !== 'shared') return;
    const supabase = getBrowserSupabase();
    if (!supabase) return;

    /** This client's presence key, resolved once. */
    const myKey = me.wallet.toLowerCase();

    /** The last payload actually sent, so an unchanged one costs nothing. */
    let lastSent = '';
    /** Latest broadcast position per peer, merged in on each repaint. */
    const moves: Record<string, { x: number; z: number }> = {};
    /** Set by cleanup, so a scheduled rejoin cannot outlive the effect. */
    let disposed = false;
    let rejoin: number | undefined;

    /*
     * One channel per shard per region, and both halves of that key matter.
     *
     * Without the region, everybody outdoors shares one roster and players
     * standing in the Deep Forest appear on the Grounds. Without the shard,
     * the several worlds lib/shards exists to provide are one world wearing
     * four names.
     *
     * Read at subscribe time rather than held in state: a player changes shard
     * by leaving through /start, which remounts everything below it anyway.
     */
    const shard = shardFromCookie(typeof document === 'undefined' ? null : document.cookie);
    const channel = supabase.channel(`evergreen:${shard}:${region}`, {
      config: { presence: { key: myKey } },
    });

    const sync = () => {
      const state = channel.presenceState<Record<string, unknown>>();
      const next: FloorPeer[] = [];
      for (const [key, entries] of Object.entries(state)) {
        if (key === myKey) continue;
        /*
         * The LAST meta, not the first.
         *
         * presenceState() returns a LIST per key and track() appends to it, so
         * index 0 is the payload from the moment that player joined and the
         * live one is at the end. Reading [0] drew every peer frozen at the
         * tile they arrived on, for as long as they stayed — which looked like
         * "presence is working, movement is not" and is the reason this was
         * mistaken for a rendering problem.
         */
        const metas = entries as unknown as Array<Record<string, unknown>>;
        const entry = metas[metas.length - 1];
        if (!entry) continue;
        next.push({
          wallet: key,
          name: typeof entry.name === 'string' ? entry.name : `${key.slice(0, 6)}…`,
          tier: typeof entry.tier === 'number' ? entry.tier : 1,
          // The presence payload only carries where they came IN. Once a peer
          // has broadcast a step, that is the truth.
          x: moves[key]?.x ?? (typeof entry.x === 'number' ? entry.x : 0),
          z: moves[key]?.z ?? (typeof entry.z === 'number' ? entry.z : 0),
          // Presence payloads come from other clients, so every field is
          // checked. A peer who sends a nonsense outfit renders as unadorned
          // rather than as an exception in the render loop.
          outfit: typeof entry.outfit === 'string' ? entry.outfit : null,
          outfitLevel: typeof entry.outfitLevel === 'number' ? entry.outfitLevel : 0,
        });
      }
      setOthers(next);
    };

    channel
      .on('presence', { event: 'sync' }, sync)
      .on('presence', { event: 'join' }, sync)
      .on('presence', { event: 'leave' }, sync)
      /*
       * Position arrives by BROADCAST, not presence. See MOVE_INTERVAL_MS.
       *
       * Held in a plain object rather than in state, and merged during `sync`,
       * because a moving peer would otherwise re-render the whole scene on
       * every packet — at four a second per player that is the frame budget
       * gone. The interval below repaints from it at a fixed rate instead.
       */
      .on('broadcast', { event: 'pos' }, ({ payload }) => {
        const p = payload as { w?: unknown; x?: unknown; z?: unknown };
        if (typeof p?.w !== 'string' || typeof p.x !== 'number' || typeof p.z !== 'number') return;
        const key = p.w.toLowerCase();
        if (key === myKey) return;
        moves[key] = { x: p.x, z: p.z };
      })
      .subscribe((status) => {
        const subscribed = status === 'SUBSCRIBED';
        setLive(subscribed);
        if (subscribed) {
          // Presence is announced ONCE, on arrival. It is the roster — who is
          // here and what they look like — and none of that changes while you
          // walk, so there is nothing to re-announce.
          announce();
          return;
        }
        /*
         * CLOSED and CHANNEL_ERROR are not terminal any more.
         *
         * They were, in effect: the server closes the channel when a client
         * trips the presence rate limit, nothing here noticed, and every later
         * track() timed out — so one burst made a player invisible for the rest
         * of the session. Rebuilding after a pause is what turns that into a
         * few seconds of absence.
         */
        if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setOthers([]);
          if (!disposed) rejoin = window.setTimeout(() => setEpoch((n) => n + 1), REJOIN_DELAY_MS);
        }
      });

    /**
     * Who this player is, and where they came in. Presence, once.
     *
     * Re-announced only when the identity itself changes, which the effect's
     * deps already handle by rebuilding the channel. A session therefore spends
     * about one presence event, which is comfortably inside a limit that four
     * of them will trip.
     */
    function announce() {
      const id = identityRef.current;
      void channel.track({
        name: id?.name ?? 'Fund',
        tier: id?.tier ?? 1,
        outfit: id?.outfit ?? null,
        outfitLevel: id?.outfitLevel ?? 0,
        x: positionRef.current.x,
        z: positionRef.current.z,
      });
    }

    /** Position, by broadcast, and only when it actually changed. */
    function sendMove() {
      const { x, z } = positionRef.current;
      const stamp = `${x},${z}`;
      if (stamp === lastSent) return;
      lastSent = stamp;
      void channel.send({
        type: 'broadcast',
        event: 'pos',
        payload: { w: myKey, x, z },
      });
    }

    const timer = window.setInterval(sendMove, MOVE_INTERVAL_MS);

    /*
     * Repaint from the move buffer on a fixed beat.
     *
     * Decoupled from arrival so a room with eight people in it costs eight
     * renders a second between them rather than thirty-two.
     */
    const repaint = window.setInterval(() => {
      if (Object.keys(moves).length) sync();
    }, MOVE_INTERVAL_MS);

    // Population, separately and far more slowly. Failures are swallowed: a
    // missed heartbeat costs one player off a count for ninety seconds, and a
    // presence hook that can throw would take the scene down with it.
    const beat = () => {
      void fetch('/api/shards', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ wallet: me?.wallet, region }),
      }).catch(() => {});
    };
    beat();
    const heart = window.setInterval(beat, HEARTBEAT_MS);

    return () => {
      disposed = true;
      if (rejoin) window.clearTimeout(rejoin);
      window.clearInterval(timer);
      window.clearInterval(repaint);
      window.clearInterval(heart);
      void supabase.removeChannel(channel);
      setLive(false);
      setOthers([]);
    };
    // Only the identity should rebuild the subscription; position rides the ref.
    // The epoch is the one deliberate exception: bumping it is how a channel
    // the server closed gets rebuilt.
  }, [region, me?.wallet, me?.name, me?.tier, epoch]);

  const peers = useMemo<FloorPeer[]>(() => {
    const self: FloorPeer[] = me
      ? [{
          wallet: me.wallet,
          name: me.name,
          tier: me.tier,
          outfit: me.outfit ?? null,
          outfitLevel: me.outfitLevel ?? 0,
          x: position.x,
          z: position.z,
          isSelf: true,
        }]
      : [];
    return [...self, ...others];
  }, [me, others, position.x, position.z]);

  return { peers, live };
}
