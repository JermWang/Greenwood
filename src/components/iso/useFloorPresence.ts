'use client';

// Live presence for the Trading Floor.
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

const CHANNEL = 'greenwood-trading-floor';
/** Position updates are throttled: a click-to-move sends one per step, not per frame. */
const TRACK_INTERVAL_MS = 220;

export function useFloorPresence(
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
    const supabase = getBrowserSupabase();
    if (!supabase) return;

    const channel = supabase.channel(CHANNEL, {
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

    return () => {
      window.clearInterval(timer);
      void supabase.removeChannel(channel);
      setLive(false);
      setOthers([]);
    };
    // Only the identity should rebuild the subscription; position rides the ref.
  }, [me?.wallet, me?.name, me?.tier]);

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
