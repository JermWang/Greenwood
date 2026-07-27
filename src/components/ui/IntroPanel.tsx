'use client';

// The introduction, as one step at a time.
//
// Deliberately NOT a checklist. Eight tasks on a fresh account is a wall, and a
// wall gets dismissed; one task with a stated reason is a next move. The other
// seven are summarised as a count, so the player knows the shape of what they
// are in without having to read it.
//
// The `why` is the whole point of the component and it is never behind a
// tooltip. "Open a Treasury Desk" is an instruction; "Treasury Desks reinvest at
// 0.75% instead of 2%" is a reason, and a player who reads the reason has
// learned the game rather than followed a prompt. If this panel ever needs to be
// made more compact, the label goes before the why does.
//
// It disappears completely once finished. A tutorial that lingers as a row of
// ticks is furniture.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, Sparkle } from '@phosphor-icons/react';
import { api, type IntroResponse } from '@/lib/api-client';
import { useOperation } from '@/lib/useOperation';

export default function IntroPanel({ wallet }: { wallet: string | null }) {
  const [data, setData] = useState<IntroResponse | null>(null);
  const [busy, setBusy] = useState(false);
  /** The live fund, so a step completed on this page is noticed immediately. */
  const op = useOperation((s) => s.op);

  const load = useCallback(() => {
    if (!wallet) { setData(null); return; }
    void api.intro(wallet).then(setData).catch(() => setData(null));
  }, [wallet]);

  useEffect(() => { load(); }, [load]);

  /**
   * Refresh when the tab regains focus.
   *
   * Steps are completed by doing things on OTHER screens — you open a desk on
   * the dashboard, arrange one on the floor. Without this the panel would still
   * be asking for something the player finished two pages ago, which reads as
   * the tutorial being broken rather than stale.
   */
  useEffect(() => {
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [load]);

  /**
   * Refresh when the fund changes, not only when the tab regains focus.
   *
   * Focus alone was not enough and the gap was invisible until somebody walked
   * the introduction: the FIRST step is "open your first desk", which happens on
   * this very page. The desk appeared, the server recorded the step, and the
   * panel carried on saying 0 / 10 — the tab never lost focus, so it never
   * reloaded. A tutorial that does not acknowledge the thing you just did reads
   * as broken, and the reward sits uncollected behind it.
   *
   * Keyed on the counts a step could plausibly move rather than on `op`
   * identity, which changes on every fifteen-second poll and would turn this
   * into a request timer.
   */
  const nodeCount = op?.nodes.length ?? 0;
  const produced = op?.totalProduced ?? 0;
  const balance = op?.osrBalance ?? 0;
  useEffect(() => { load(); }, [nodeCount, produced, balance, load]);

  if (!data || data.intro.finished) return null;

  const step = data.intro.steps.find((s) => s.current);
  if (!step) return null;

  const { completed, total } = data.intro;
  const { totalLevel, maxTotalLevel } = data.progression;

  const collect = async () => {
    if (!wallet) return;
    setBusy(true);
    try {
      await api.claimIntroStep(wallet, step.key);
      load();
    } catch {
      // Leave it collectable. The next load reconciles against the server,
      // which is the only thing that knows whether the claim landed.
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="intro-panel">
      <header>
        <div>
          <span className="intro-eyebrow">Getting started</span>
          <b>{step.label}</b>
        </div>
        <span className="intro-count">
          {completed} / {total}
        </span>
      </header>

      <p className="intro-why">{step.why}</p>

      <footer>
        <span className="intro-reward">
          <Sparkle size={13} weight="duotone" /> {step.xp} XP · {step.scrip.toLocaleString()} Scrip
        </span>
        {step.done ? (
          <button className="intro-collect" onClick={collect} disabled={busy}>
            {busy ? '…' : <><Check size={14} weight="bold" /> Collect</>}
          </button>
        ) : (
          /* Links to the screen the step happens on. A tutorial that tells you
             what to do without saying where is a riddle. */
          <Link className="intro-go" href={step.href}>
            Go there <ArrowRight size={13} weight="bold" />
          </Link>
        )}
      </footer>

      <div className="intro-level">
        Level {totalLevel} <i>/ {maxTotalLevel}</i>
      </div>
    </section>
  );
}
