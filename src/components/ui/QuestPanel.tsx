'use client';

// Daily quests and XP tracks, as a foldable HUD panel.
//
// Layout borrows the shape that works in Kintara: a tight stack of three lines,
// each showing the goal, a progress bar, and what it pays. Deliberately NOT a
// modal — a quest list you have to open is a quest list you forget. It sits on
// the screen you already look at and folds away when it is in the road.

import { useCallback, useEffect, useState } from 'react';
import { CaretDown, CaretUp, Check } from '@phosphor-icons/react';
import { api, type QuestsResponse } from '@/lib/api-client';

function countdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function QuestPanel({ wallet }: { wallet: string | null }) {
  const [data, setData] = useState<QuestsResponse | null>(null);
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!wallet) { setData(null); return; }
    void api.quests(wallet).then(setData).catch(() => setData(null));
  }, [wallet]);

  useEffect(() => { load(); }, [load]);

  // Fold by default on a phone, where the panel would cover the game.
  useEffect(() => { if (window.innerWidth <= 760) setOpen(false); }, []);

  const claim = async (key: string) => {
    if (!wallet) return;
    setBusy(key);
    try {
      await api.claimQuest(wallet, key);
      load();
    } catch {
      /* Leave the quest claimable; the next load reconciles with the server. */
    } finally {
      setBusy(null);
    }
  };

  if (!wallet || !data) return null;

  const done = data.quests.filter((q) => q.claimed).length;

  return (
    <aside className="quest-panel">
      <button className="quest-panel-head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span>DAILY QUESTS</span>
        <b>
          {done}/{data.quests.length} · {countdown(data.resetsInMs)}
          {open ? <CaretUp size={10} weight="bold" /> : <CaretDown size={10} weight="bold" />}
        </b>
      </button>

      {open && (
        <>
          <ul className="quest-list">
            {data.quests.map((q) => {
              const pct = Math.round((q.progress / q.target) * 100);
              return (
                <li key={q.key} className={q.claimed ? 'is-claimed' : q.complete ? 'is-complete' : ''}>
                  <div className="quest-row">
                    <span>{q.label}</span>
                    {q.claimed ? (
                      <em><Check size={11} weight="bold" /> Claimed</em>
                    ) : q.complete ? (
                      <button onClick={() => claim(q.key)} disabled={busy === q.key}>
                        {busy === q.key ? '…' : 'Claim'}
                      </button>
                    ) : (
                      <em>{q.progress}/{q.target}</em>
                    )}
                  </div>
                  <div className="quest-bar"><i style={{ width: `${Math.min(100, pct)}%` }} /></div>
                  <small>+{q.xp.toLocaleString()} {q.track} XP</small>
                </li>
              );
            })}
          </ul>

          <div className="quest-tracks">
            <div className="quest-tracks-head">
              <span>TOTAL LEVEL</span>
              <b>{data.progression.totalLevel}</b>
            </div>
            {data.progression.tracks.map((t) => {
              const pct = t.levelSpan > 0 ? Math.round((t.intoLevel / t.levelSpan) * 100) : 0;
              return (
                <div key={t.key} className="quest-track" title={t.blurb}>
                  <span>{t.name}</span>
                  <div className="quest-bar"><i style={{ width: `${Math.min(100, pct)}%` }} /></div>
                  <b>{t.level}</b>
                </div>
              );
            })}
          </div>
        </>
      )}
    </aside>
  );
}
