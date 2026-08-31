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
// BROADCAST, NOT PRESENCE. Presence carries a roster and is rate-limited hard
// enough that it cannot even carry a walk (see useWorldPresence, and the
// "Client presence rate limit exceeded" that broke multiplayer). Messages are
// events, which is what broadcast is for.
//
// WHAT THIS IS NOT: it is not authenticated. Supabase broadcast is
// client-to-client over the publishable key, so a determined person can open a
// socket and send whatever name they like. That is fine for a chat box and is
// NOT fine for anything that decides an outcome, which is why nothing here
// touches game state — no trades, no commands, no coordinates. Making the
// author trustworthy means relaying through the server, and that is a real
// piece of work rather than a flag to flip.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChatCircle, CaretDown, PaperPlaneRight } from '@phosphor-icons/react';
import { getBrowserSupabase } from '@/lib/supabase-browser';
import { shardFromCookie, shardById } from '@/lib/shards';
import { usePresenceIdentity } from '@/components/iso/usePresenceIdentity';
import { playSfx } from '@/lib/sfx';

export interface ChatLine {
  /** Local id: the wire carries no id, and React needs a stable key. */
  id: number;
  wallet: string;
  name: string;
  text: string;
  at: number;
  /** Sent by this client. Drawn differently so you can find your own line. */
  mine?: boolean;
  /** Not a person: an arrival, a departure, the shard's own voice. */
  system?: boolean;
}

/**
 * How much history is kept.
 *
 * Enough to scroll back through a conversation, short enough that a tab left
 * open all day does not accumulate a megabyte of strings. RuneScape's own
 * chatbox keeps about this many and nobody has ever wanted more of it.
 */
const HISTORY = 120;

/** Longest message accepted. Long enough for a sentence, short enough not to wall. */
const MAX_LEN = 160;

/**
 * The gap between two messages from this client.
 *
 * A courtesy throttle rather than a security control — anyone can open their own
 * socket, so this stops a stuck key, not an attacker. The real protection is
 * that chat cannot do anything: see the header.
 */
const SEND_GAP_MS = 900;

let nextId = 1;

export default function ChatDock() {
  const identity = usePresenceIdentity();
  const wallet = identity.wallet;
  const signedIn = wallet.startsWith('0x');

  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [draft, setDraft] = useState('');
  const [unread, setUnread] = useState(0);
  const [live, setLive] = useState(false);

  const sendRef = useRef<((text: string) => void) | null>(null);
  const lastSent = useRef(0);
  const log = useRef<HTMLOListElement>(null);
  const openRef = useRef(open);
  openRef.current = open;

  const shard = useMemo(
    () => (typeof document === 'undefined' ? null : shardFromCookie(document.cookie)),
    []
  );
  const shardName = shardById(shard)?.name ?? 'Evergreen';

  useEffect(() => {
    if (!signedIn || !shard) return;
    const supabase = getBrowserSupabase();
    if (!supabase) return;

    // One room per shard. No region in the key — see the header.
    const channel = supabase.channel(`evergreen:${shard}:chat`);

    channel
      .on('broadcast', { event: 'say' }, ({ payload }) => {
        const p = payload as { w?: unknown; n?: unknown; t?: unknown };
        if (typeof p?.w !== 'string' || typeof p.t !== 'string') return;
        // Every field comes from another client, so every field is checked and
        // clamped here rather than trusted. A peer sending a novel gets 160
        // characters of it and no layout damage.
        const text = p.t.slice(0, MAX_LEN);
        if (!text.trim()) return;
        const mine = p.w.toLowerCase() === wallet.toLowerCase();
        // Your own line is already on screen — it was added optimistically when
        // you pressed send, so echoing it back would double it.
        if (mine) return;
        setLines((current) => [
          ...current,
          {
            id: nextId++,
            wallet: p.w as string,
            name: typeof p.n === 'string' ? (p.n as string).slice(0, 24) : 'Fund',
            text,
            at: Date.now(),
          },
        ].slice(-HISTORY));
        if (!openRef.current) {
          setUnread((n) => Math.min(99, n + 1));
          playSfx('notify');
        }
      })
      .subscribe((status) => setLive(status === 'SUBSCRIBED'));

    sendRef.current = (text: string) => {
      void channel.send({
        type: 'broadcast',
        event: 'say',
        payload: { w: wallet, n: identity.name, t: text },
      });
    };

    return () => {
      sendRef.current = null;
      setLive(false);
      void supabase.removeChannel(channel);
    };
  }, [signedIn, shard, wallet, identity.name]);

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

  const send = useCallback(() => {
    const text = draft.trim().slice(0, MAX_LEN);
    if (!text || !sendRef.current) return;
    const now = Date.now();
    if (now - lastSent.current < SEND_GAP_MS) return;
    lastSent.current = now;
    sendRef.current(text);
    // Optimistic: your own line appears the instant you send it rather than
    // after a round trip, which is what makes typing feel local.
    setLines((current) =>
      [...current, { id: nextId++, wallet, name: identity.name, text, at: now, mine: true }].slice(-HISTORY)
    );
    setDraft('');
    playSfx('tap');
  }, [draft, wallet, identity.name]);

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
          <li key={line.id} className={line.mine ? 'is-mine' : undefined}>
            <span className="eg-chat-name">{line.name}:</span>{' '}
            <span className="eg-chat-text">{line.text}</span>
          </li>
        ))}
      </ol>

      <form
        className="eg-chat-entry"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={MAX_LEN}
          placeholder={`Say something to ${shardName}…`}
          aria-label="Message"
          /* The world listens for W/A/S/D and Escape. Without this, typing
             "wander" walks you four tiles and closes a panel. */
          onKeyDown={(e) => e.stopPropagation()}
        />
        <button type="submit" aria-label="Send" disabled={!draft.trim()}>
          <PaperPlaneRight size={13} weight="fill" />
        </button>
      </form>
    </section>
  );
}
