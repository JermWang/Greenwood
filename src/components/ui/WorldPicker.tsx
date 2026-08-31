'use client';

// Which world you walk into.
//
// It lives in the start flow rather than anywhere inside the game, and that is
// the whole reason it looks like this. A shard is not a setting you flick while
// you are standing in the Deep Forest — the regions that make shards worth
// having are the ones where somebody can kill you, and a world you can leave
// mid-fight by opening a panel is a world with no stakes in it.
//
// So it is a door you pass through on the way in. Changing it means coming back
// out to /start, which costs you the walk back and makes shard-hopping a
// decision rather than a reflex.
//
// It writes a cookie and nothing else. The shard is not part of a fund — your
// desks, levels, Scrip and pack are yours on every world (see lib/shards) — so
// there is no account record to update and no migration to run. What is
// per-shard is only what is contested.

import { useCallback, useEffect, useState } from 'react';
import { Globe, Users } from '@phosphor-icons/react';
import { SHARD_COOKIE, SHARD_COOKIE_MAX_AGE, shardFromCookie, type ShardStatus } from '@/lib/shards';

interface ShardView {
  id: string;
  name: string;
  region: string;
  players: number;
  status: ShardStatus;
  joinable: boolean;
}

/** What each status says to somebody deciding. Never just a colour. */
const LABEL: Record<ShardStatus, string> = {
  open: 'Open',
  busy: 'Busy',
  full: 'Full',
  offline: 'Offline',
};

export default function WorldPicker() {
  const [shards, setShards] = useState<ShardView[]>([]);
  const [chosen, setChosen] = useState<string | null>(null);

  useEffect(() => {
    setChosen(shardFromCookie(document.cookie));
    void fetch('/api/shards')
      .then((r) => r.json())
      .then((data: { shards?: ShardView[] }) => setShards(data.shards ?? []))
      // A picker that cannot reach the counts still has to let somebody in, so
      // it simply renders nothing and the cookie's default carries them.
      .catch(() => setShards([]));
  }, []);

  const choose = useCallback((id: string) => {
    setChosen(id);
    // Not httpOnly: both halves read this. The server validates it against the
    // shard table on every use precisely because the browser can write it.
    document.cookie = `${SHARD_COOKIE}=${id}; Max-Age=${SHARD_COOKIE_MAX_AGE}; path=/; SameSite=Lax`;
  }, []);

  if (!shards.length) return null;

  return (
    <div className="eg-world-picker">
      <span className="eg-world-picker-label">
        <Globe size={13} weight="duotone" /> World
      </span>
      <div className="eg-world-picker-list">
        {shards.map((shard) => (
          <button
            key={shard.id}
            type="button"
            onClick={() => choose(shard.id)}
            disabled={!shard.joinable}
            aria-pressed={shard.id === chosen}
            className={`eg-world-option${shard.id === chosen ? ' is-chosen' : ''}`}
          >
            <b>{shard.name}</b>
            <small>{shard.region}</small>
            {/* The count, not just the status word. "Busy" tells you how the
                server feels; twenty-two tells you what you are walking into. */}
            <span className={`eg-world-status is-${shard.status}`}>
              <Users size={11} weight="duotone" /> {shard.players} · {LABEL[shard.status]}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
