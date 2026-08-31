'use client';

// World chat: one room per shard, docked bottom-left.
//
// PER SERVER, NOT PER REGION, and that is the whole shape of it. Presence is
// keyed on shard AND region because standing somewhere is a local fact — a
// player in the Deep Forest should not appear on the Grounds. Chat is the
// opposite: the point of a world channel is that the world is one room, so
// somebody asking a question in the Machine Room is heard by somebody standing
// at the treeline. Keying this on the region would produce four or five silent
// rooms instead of one populated one, which is how a chat feature dies.
//
// THIS CLIENT CANNOT SEND. It listens, and nothing else.
//
// It used to send: a broadcast on a public channel, carrying a wallet and a
// display name it had chosen itself. That made the author of a message a claim
// rather than a fact, and anyone with devtools could speak as anybody. The
// channel is now PRIVATE, its RLS policy grants read and withholds write, and
// the only writer in the world is /api/chat/say — which knows who is asking,
// because it checked a session first. A browser that tries to broadcast here is
// dropped by Realtime before a single subscriber sees it.
//
// The consequence for this file is small and worth stating plainly: `send`
// below is an HTTP call, its result is the line that gets drawn, and there is
// no optimistic echo. What you see in your own log is what the room received.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChatCircle, CaretDown, PaperPlaneRight, Prohibit } from '@phosphor-icons/react';
import { getBrowserSupabase } from '@/lib/supabase-browser';
import { shardFromCookie, shardById } from '@/lib/shards';
import { isDemoWallet } from '@/lib/demo';
import { usePresenceIdentity } from '@/components/iso/usePresenceIdentity';
import { api } from '@/lib/api-client';
import { CHAT_HISTORY, CHAT_MAX_LEN, chatTopic, sanitizeChat, type ChatLine } from '@/lib/chat';
import { playSfx } from '@/lib/sfx';

/**
 * The gap between two sends from this client.
 *
 * A courtesy against a stuck key, NOT a control — it stops a repeat-fire
 * keyboard, and it is not what stops a flood. That is `LIMITS.chat` in
 * lib/rate-limit, spent per wallet on the server, which cannot be skipped by
 * not running this code.
 */
const SEND_GAP_MS = 700;

let nextId = 1;

export default function ChatDock() {
  const identity = usePresenceIdentity();
  const wallet = identity.wallet;
  const signedIn = wallet.startsWith('0x');
  const demo = isDemoWallet(wallet);

  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [draft, setDraft] = useState('');
  const [unread, setUnread] = useState(0);
  const [live, setLive] = useState(false);
  const [sending, setSending] = useState(false);

  const lastSent = useRef(0);
  const log = useRef<HTMLOListElement>(null);
  const openRef = useRef(open);
  openRef.current = open;

  const shard = useMemo(
    () => (typeof document === 'undefined' ? null : shardFromCookie(document.cookie)),
    []
  );
  const shardName = shardById(shard)?.name ?? 'Evergreen';

  const append = useCallback((line: Omit<ChatLine, 'id'>) => {
    setLines((current) => [...current, { ...line, id: nextId++ }].slice(-CHAT_HISTORY));
  }, []);

  useEffect(() => {
    if (!signedIn || !shard) return;
    const supabase = getBrowserSupabase();
    if (!supabase) return;

    // `private: true` is what sends this subscription through Realtime
    // Authorization instead of past it. Drop it and the channel silently
    // becomes a public one that anybody can write to again, which is the exact
    // hole this replaced — so it is not an optimisation to remove.
    const channel = supabase.channel(chatTopic(shard), { config: { private: true } });

    channel
      .on('broadcast', { event: 'say' }, ({ payload }) => {
        const p = payload as { w?: unknown; n?: unknown; t?: unknown; at?: unknown };
        if (typeof p?.w !== 'string') return;
        // Only the server can put a message here now, so these fields are no
        // longer hostile — but they are still checked and clamped, because
        // "trusted source" and "well formed" are different questions and a
        // malformed line should cost a line rather than the log.
        const text = sanitizeChat(p.t);
        if (!text) return;
        // Your own line was already drawn from the route's reply. The room
        // hears it once; you should see it once.
        if (p.w.toLowerCase() === wallet.toLowerCase()) return;
        append({
          wallet: p.w,
          name: typeof p.n === 'string' ? p.n.slice(0, 24) : 'Fund',
          text,
          at: typeof p.at === 'number' ? p.at : Date.now(),
        });
        if (!openRef.current) {
          setUnread((n) => Math.min(99, n + 1));
          playSfx('notify');
        }
      })
      .subscribe((status) => setLive(status === 'SUBSCRIBED'));

    return () => {
      setLive(false);
      void supabase.removeChannel(channel);
    };
  }, [signedIn, shard, wallet, append]);

  /** Opening clears the badge — you have now read them. */
  useEffect(() => {
    if (open) setUnread(0);
  }, [open, lines.length]);

  /*
   * Stick to the bottom, but only if the player is already there.
   *
   * Scrolling up is reading history, and a log that yanks you back to the newest
   * line every time somebody says hello is a log you cannot read. Within a line
   * or two of the end counts as "at the bottom".
   */
  useEffect(() => {
    const el = log.current;
    if (!el || !open) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    if (atBottom) el.scrollTop = el.scrollHeight;
  }, [lines, open]);

  const send = useCallback(async () => {
    const text = sanitizeChat(draft);
    if (!text || sending) return;
    const now = Date.now();
    if (now - lastSent.current < SEND_GAP_MS) return;
    lastSent.current = now;

    // Cleared before the round trip rather than after. The box emptying is the
    // feedback that the key press registered; leaving text sitting in it while
    // the request is in flight reads as a dropped keystroke and gets retyped.
    setDraft('');
    setSending(true);
    try {
      const { line } = await api.say(wallet, text);
      // Drawn from the SERVER's copy, not from what was typed. The same object
      // every other player receives — same name, same timestamp — so a player
      // whose display name has changed sees the change in their own line.
      append({ wallet: line.wallet, name: line.name, text: line.text, at: line.at, mine: true });
    } catch (error) {
      // A refusal is shown IN the log, where the message would have gone. A
      // toast somewhere else would be a message about chat appearing outside
      // chat, and the thing the player needs to know is that this specific line
      // did not land.
      append({
        wallet: 'system',
        name: 'Evergreen',
        text: error instanceof Error ? error.message : 'That did not send.',
        at: Date.now(),
        system: true,
      });
    } finally {
      setSending(false);
    }
  }, [draft, sending, wallet, append]);

  // Guests have no stable identity to speak as, so they get no box at all
  // rather than one that silently fails. Same rule presence uses.
  if (!signedIn) return null;

  if (!open) {
    return (
      <button
        className={`eg-chat-tab${unread ? ' has-unread' : ''}`}
        onClick={() => setOpen(true)}
        aria-label="Open chat"
      >
        <ChatCircle size={14} weight="duotone" />
        <span>Chat</span>
        {unread > 0 && <b>{unread}</b>}
      </button>
    );
  }

  return (
    <section className="eg-chat" aria-label={`${shardName} chat`}>
      <header>
        <ChatCircle size={13} weight="duotone" />
        {/* The world is named, because the whole point is that it is per-server:
            a player should be able to see at a glance who can hear them. */}
        <b>{shardName}</b>
        <span className={live ? 'is-live' : undefined}>{live ? 'connected' : 'connecting…'}</span>
        <button onClick={() => setOpen(false)} aria-label="Collapse chat" title="Collapse">
          <CaretDown size={12} weight="bold" />
        </button>
      </header>

      <ol className="eg-chat-log" ref={log}>
        {lines.length === 0 && (
          <li className="eg-chat-empty">
            Nobody has said anything yet. Everyone on {shardName} can hear you.
          </li>
        )}
        {lines.map((line) => (
          <li
            key={line.id}
            className={line.system ? 'is-system' : line.mine ? 'is-mine' : undefined}
          >
            <span className="eg-chat-name">{line.name}:</span>{' '}
            <span className="eg-chat-text">{line.text}</span>
          </li>
        ))}
      </ol>

      {demo ? (
        /*
         * A demo account reads the room and cannot talk in it, and says so here
         * rather than by refusing after the fact. Demo addresses are minted per
         * browser and prove only that this browser made them, so they are free
         * and unlimited — survivable everywhere else in the game, because
         * everywhere else a demo player only affects their own fund.
         */
        <p className="eg-chat-locked">
          <Prohibit size={13} weight="bold" />
          Sign in with a wallet to talk here.
        </p>
      ) : (
        <form
          className="eg-chat-entry"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={CHAT_MAX_LEN}
            placeholder={`Say something to ${shardName}…`}
            aria-label="Message"
            /* The world listens for W/A/S/D and Escape. Without this, typing
               "wander" walks you four tiles and closes a panel. */
            onKeyDown={(e) => e.stopPropagation()}
          />
          <button type="submit" aria-label="Send" disabled={!draft.trim() || sending}>
            <PaperPlaneRight size={13} weight="fill" />
          </button>
        </form>
      )}
    </section>
  );
}
