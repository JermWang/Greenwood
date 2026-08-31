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
// So it floats over every route, anchored to the upper right. That is not a nav
// rail (CLAUDE.md): it never takes you anywhere you could not already walk to,
// and it deletes itself the moment the introduction is finished.
//
// IT USED TO LIVE IN THE TOP BAR, and the reason it does not any more is worth
// keeping. The panel hung off a chip in that bar, and the chip was the only way
// to collapse it — so the handle for a panel sat in the middle of the global
// nav, between the wallet, the balance and the sound toggle. That strip reads
// as "app chrome", not as "the thing hanging under me", and a player looking
// for a way to shut a panel does not look three hundred pixels above it in a
// row of unrelated controls. The control belongs to the panel; it is in the
// panel's own header now, and when the panel is collapsed the pill that brings
// it back sits in exactly the same corner.
//
// Upper right because everything else is taken: top-left is the Trading Floor's
// quest dock, bottom-left is the Machine Room's desk book, bottom-right is the
// world map and the layout score, and bottom-centre is every contextual prompt
// in the game.
//
// IT IS A CHECKLIST NOW, and it did not used to be. The argument against one was
// that ten tasks on a fresh account is a wall, and a wall gets dismissed — so
// only the current step was ever shown. That solved the wall and created a
// worse problem: with nothing but the current step visible, a player had no way
// to see that the introduction was a finite thing they were making progress
// through. "3 / 10" in the corner is a claim; ten rows with three ticked is
// evidence, and evidence is what makes somebody finish a list.
//
// The wall is avoided a different way instead: the rows are one line each and
// carry only their label, and ONLY THE CURRENT ROW OPENS — its `why`, its
// reward and its call to action are inline, on the row, where the tick will
// eventually go. So the panel still says one thing at a time; it just no longer
// pretends the other nine do not exist.
//
// The `why` stays non-negotiable and is never behind a tooltip — "open a
// Treasury Desk" is an instruction, "Treasury Desks reinvest at 0.75% instead
// of 2%" is a reason, and a player who read the reason has learned the game
// rather than followed a prompt.

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { MapPin, CaretDown, CaretUp, Check, Compass, Hourglass, Sparkle } from '@phosphor-icons/react';
import { api, type IntroResponse } from '@/lib/api-client';
import { useOperation } from '@/lib/useOperation';

/** One row's state, resolved once so the tick and the styling cannot disagree. */
type Mark = 'claimed' | 'collect' | 'current' | 'parked' | 'todo';

function markOf(step: IntroResponse['intro']['steps'][number]): Mark {
  if (step.claimed) return 'claimed';
  if (step.done) return 'collect';
  if (step.current) return 'current';
  return step.parked ? 'parked' : 'todo';
}

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

  /**
   * Keep the open row in view.
   *
   * The list scrolls once the chain is a few steps in, and the current step is
   * the only row worth looking at — landing on a scroll position that hides it
   * would make the panel look like a list of things already done.
   */
  const currentRow = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (!open) return;
    currentRow.current?.scrollIntoView({ block: 'nearest' });
  }, [open, beat]);

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

  const { completed, total, steps } = data.intro;
  const { totalLevel, maxTotalLevel } = data.progression;

  return (
    <div className="eg-guide">
      {/*
        Collapsed, the guide is this pill — IN THE SAME PLACE the panel was,
        not in the top bar.

        The control used to be a chip among the wallet, the balance and the
        sound toggle, which is the one place on screen that means "app chrome"
        rather than "the thing under me". Nobody should have to discover that a
        nav-bar button is the handle for a panel three hundred pixels below it.
      */}
      {!open && (
        <button
          className={`eg-guide-chip${step.done ? ' is-ready' : ''}`}
          onClick={() => setOpen(true)}
          aria-expanded={false}
        >
          <Compass size={13} weight="duotone" />
          <span className="eg-guide-label">{step.done ? 'Step complete' : step.label}</span>
          <b>{completed}/{total}</b>
          <CaretDown size={10} weight="bold" />
        </button>
      )}

      {open && (
        <section className="intro-panel eg-guide-panel" aria-label="Getting started">
          <header>
            <span className="intro-eyebrow">Getting started</span>
            {/* The bar is the same claim as "3 / 10" made visually, and it is
                the part that reads at a glance from across the screen. */}
            <span className="intro-progress" aria-hidden>
              <i style={{ width: `${(completed / total) * 100}%` }} />
            </span>
            <span className="intro-count">{completed}/{total}</span>
            {/* On the panel, where a person looks for it. Escape still works. */}
            <button
              className="intro-collapse"
              onClick={() => setOpen(false)}
              aria-label="Collapse the introduction"
              title="Collapse"
            >
              <CaretUp size={11} weight="bold" />
            </button>
          </header>

          <ol className="intro-list">
            {steps.map((row) => {
              const mark = markOf(row);
              const isCurrent = mark === 'current' || mark === 'collect';
              return (
                <li
                  key={row.key}
                  ref={isCurrent ? currentRow : undefined}
                  className={`intro-row is-${mark}`}
                >
                  <span className="intro-tick" aria-hidden>
                    {mark === 'claimed' && <Check size={10} weight="bold" />}
                    {mark === 'parked' && <Hourglass size={9} weight="duotone" />}
                  </span>
                  <span className="intro-row-label">{row.label}</span>

                  {/* Only the row you are on opens. Everything below is the
                      old panel body, moved onto the row it was always about. */}
                  {isCurrent && (
                    <div className="intro-row-body">
                      <p className="intro-why">{row.why}</p>

                      {/* A step the player cannot act on has to explain itself
                          where they are already looking. See canAct in
                          lib/intro — only reached when every remaining step is
                          parked, since otherwise the chain moves on. */}
                      {row.parked && row.waiting && (
                        <p className="intro-why is-waiting">{row.waiting}</p>
                      )}

                      <div className="intro-row-foot">
                        <span className="intro-reward">
                          <Sparkle size={12} weight="duotone" /> {row.xp} XP ·{' '}
                          {row.scrip.toLocaleString()} Scrip
                        </span>
                        {row.done ? (
                          <button className="intro-collect" onClick={() => void collect()} disabled={busy}>
                            {busy ? '…' : <><Check size={12} weight="bold" /> Collect</>}
                          </button>
                        ) : row.parked ? (
                          /* No button on purpose. Sending somebody to a room to
                             do a thing they cannot do yet is worse than saying
                             nothing — they arrive, find no way to act, and
                             conclude the tutorial is broken. */
                          <span className="intro-waiting">
                            <Hourglass size={12} weight="duotone" /> Waiting
                          </span>
                        ) : (
                          /*
                             NAMES the room. Does not go there.

                             This was a "Go there" link that pushed the route,
                             which meant the tutorial taught the one habit the
                             game does not have: travel by menu. A player walked
                             to the Machine Room six times without ever learning
                             where it is, and then had to find it unaided the
                             first time nothing told them to. A tutorial that
                             tells you what to do without saying where is a
                             riddle — but one that walks you there is a riddle
                             you never got to solve either.
                          */
                          <span className="intro-where">
                            <MapPin size={12} weight="fill" /> Go to {row.where}</span>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>

          <div className="intro-level">
            Level {totalLevel} <i>/ {maxTotalLevel}</i>
          </div>
        </section>
      )}
    </div>
  );
}
