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

/** Position updates are throttled: a click-to-move sends one per step, not per frame. */
const TRACK_INTERVAL_MS = 220;

export function useWorldPresence(
  region: RegionId,
  me: PresenceIdentity | null,
  position: { x: number; z: number }
): { peers: FloorPeer[]; live: boolean } {
  const [others, setOthers] = useState<FloorPeer[]>([]);
  const [live, setLive] = useState(false);
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
      config: { presence: { key: me.wallet.toLowerCase() } },
    });

    const sync = () => {
      const state = channel.presenceState<Record<string, unknown>>();
      const mine = me.wallet.toLowerCase();
      const next: FloorPeer[] = [];
      for (const [key, entries] of Object.entries(state)) {
        if (key === mine) continue;
        const entry = (entries as unknown as Array<Record<string, unknown>>)[0];
        if (!entry) continue;
        next.push({
          wallet: key,
          name: typeof entry.name === 'string' ? entry.name : `${key.slice(0, 6)}…`,
          tier: typeof entry.tier === 'number' ? entry.tier : 1,
          x: typeof entry.x === 'number' ? entry.x : 0,
          z: typeof entry.z === 'number' ? entry.z : 0,
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
      .subscribe((status) => {
        const subscribed = status === 'SUBSCRIBED';
        setLive(subscribed);
        if (subscribed) track();
      });

    function track() {
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

    const timer = window.setInterval(track, TRACK_INTERVAL_MS);

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
      window.clearInterval(timer);
      window.clearInterval(heart);
      void supabase.removeChannel(channel);
      setLive(false);
      setOthers([]);
    };
    // Only the identity should rebuild the subscription; position rides the ref.
  }, [region, me?.wallet, me?.name, me?.tier]);

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
