'use client';

// The introduction, as a thing that TRAVELS with the player.
//
// It used to be a card in the dashboard grid, and that was fine for as long as
// the dashboard was where a new player started. It is not any more: a fund now
// begins outside, at the arrival gate on the Grounds (lib/demo, DEMO_ENTRY), and
// a tutorial that only exists on one screen is a tutorial the player has to
// already know how to find. The very first instruction it gives — open a desk —
// is carried out two rooms away.
//
// So it lives in the top bar, which is the only chrome present on every route.
// That is not a nav rail (CLAUDE.md): it never takes you anywhere you could not
// already walk to, it names one action at a time, and it deletes itself the
// moment the introduction is finished.
//
// The corners were all spoken for and that decided the position more than taste
// did — top-left is the Trading Floor's quest dock, bottom-left is the Machine
// Room's build prompt, bottom-right is the world map, bottom-centre is the
// doorway prompt. The top bar is the one surface no region has claimed.
//
// Deliberately NOT a checklist. Ten tasks on a fresh account is a wall, and a
// wall gets dismissed; one task with a stated reason is a next move. The `why`
// is the whole point and is never behind a tooltip — "open a Treasury Desk" is
// an instruction, "Treasury Desks reinvest at 0.75% instead of 2%" is a reason,
// and a player who read the reason has learned the game rather than followed a
// prompt. If this ever needs to be more compact, the label goes before the why.

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowRight, CaretDown, Check, Compass, Hourglass, Sparkle } from '@phosphor-icons/react';
import { api, type IntroResponse } from '@/lib/api-client';
import { useOperation } from '@/lib/useOperation';

export default function IntroGuide() {
  const wallet = useOperation((s) => s.wallet);
  /** The live fund, so a step completed on this page is noticed immediately. */
  const op = useOperation((s) => s.op);
  const pathname = usePathname();
  const [data, setData] = useState<IntroResponse | null>(null);
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!wallet) { setData(null); return; }
    void api.intro(wallet).then(setData).catch(() => setData(null));
  }, [wallet]);

  /**
   * ONE effect, deliberately, listing every reason to re-read.
   *
   * These were three — mount, navigation, and the fund moving — and all three
   * fired on mount, so a single page load asked for the introduction three
   * times. Collapsed, because the triggers are not independent: they are one
   * question ("might the current step be finished by now?") asked from three
   * places.
   *
   *   pathname — steps are completed by DOING things, in rooms. Leaving the
   *     room where the step happened is the most reliable signal there is.
   *   the counts — the first step is completed on whatever screen the player
   *     is already standing on, so navigation alone would miss it. Keyed on the
   *     counts a step could plausibly move rather than on `op` identity, which
   *     changes on every fifteen-second poll and would make this a request
   *     timer.
   *
   * A tutorial that does not acknowledge what you just did reads as broken, and
   * the reward sits uncollected behind it.
   */
  const nodeCount = op?.nodes.length ?? 0;
  const produced = op?.totalProduced ?? 0;
  const balance = op?.greenBalance ?? 0;
  useEffect(() => { load(); }, [pathname, nodeCount, produced, balance, load]);

  // And when the tab comes back, since a step can be finished in another one.
  useEffect(() => {
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [load]);

  const step = data && !data.intro.finished ? data.intro.steps.find((s) => s.current) ?? null : null;

  /**
   * Open itself when there is something new to read, and only then.
   *
   * The two beats that matter are a NEW step and a step becoming collectable.
   * Anything else — a poll, a navigation, a balance ticking up — leaves a
   * collapsed guide collapsed, because a panel that reopens on its own while
   * you are busy is a panel you learn to close and never open again.
   */
  const beat = step ? `${step.key}:${step.done}` : null;
  const lastBeat = useRef<string | null>(null);
  useEffect(() => {
    if (beat === null || beat === lastBeat.current) return;
    lastBeat.current = beat;
    setOpen(true);
  }, [beat]);

  // Escape closes it. It floats over the game, and anything covering the game
  // needs a way out that does not require finding a button.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const collect = useCallback(async () => {
    if (!wallet || !step) return;
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
  }, [wallet, step, load]);

  // Gone completely once finished. A tutorial that lingers as a row of ticks is
  // furniture, and this one sits in the chrome of every screen in the game.
  if (!step || !data) return null;

  const { completed, total } = data.intro;
  const { totalLevel, maxTotalLevel } = data.progression;

  return (
    <div className="eg-guide">
      <button
        className={`eg-guide-chip${step.done ? ' is-ready' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <Compass size={14} weight="duotone" />
        <span className="eg-guide-label">{step.done ? 'Step complete' : step.label}</span>
        <b>{completed}/{total}</b>
        <CaretDown size={11} weight="bold" className={open ? 'is-open' : undefined} />
      </button>

      {open && (
        <section className="intro-panel eg-guide-panel" aria-label="Getting started">
          <header>
            <div>
              <span className="intro-eyebrow">Getting started</span>
              <b>{step.label}</b>
            </div>
            <span className="intro-count">{completed} / {total}</span>
          </header>

          <p className="intro-why">{step.why}</p>

          {/* Said in the panel, not only in the chip, because a step the player
              cannot act on has to explain itself where they are already looking.
              See canAct in lib/intro — this is only ever reached when every
              remaining step is parked, since otherwise the chain moves on. */}
          {step.parked && step.waiting && <p className="intro-why is-waiting">{step.waiting}</p>}

          <footer>
            <span className="intro-reward">
              <Sparkle size={13} weight="duotone" /> {step.xp} XP · {step.scrip.toLocaleString()} Scrip
            </span>
            {step.done ? (
              <button className="intro-collect" onClick={() => void collect()} disabled={busy}>
                {busy ? '…' : <><Check size={14} weight="bold" /> Collect</>}
              </button>
            ) : step.parked ? (
              /* No button on purpose. Sending somebody to a room to do a thing
                 they cannot do yet is worse than saying nothing — they arrive,
                 find no way to act, and conclude the tutorial is broken. The
                 waiting line above has already said what to do instead. */
              <span className="intro-waiting">
                <Hourglass size={13} weight="duotone" /> Waiting
              </span>
            ) : (
              /* Links to the room the step happens in. A tutorial that tells you
                 what to do without saying where is a riddle. Collapses on the
                 way, so arriving somewhere does not arrive under a panel. */
              <Link className="intro-go" href={step.href} onClick={() => setOpen(false)}>
                Go there <ArrowRight size={13} weight="bold" />
              </Link>
            )}
          </footer>

          <div className="intro-level">
            Level {totalLevel} <i>/ {maxTotalLevel}</i>
          </div>
        </section>
      )}
    </div>
  );
}
