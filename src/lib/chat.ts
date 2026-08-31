// World chat: the parts the browser and the server must agree on.
//
// NO IMPORTS, for the same reason lib/shards has none. Three places have to
// arrive at the same answer — the dock that subscribes, the route that relays,
// and the RLS policy that decides who may write — and they run in three
// different runtimes. A topic name computed two ways is two rooms.
//
// The rule this module exists to enforce: A MESSAGE'S AUTHOR IS NOT SOMETHING A
// CLIENT SAYS. The browser sends text and nothing else; the wallet, the name
// and the timestamp are all stamped by the server from a session it verified.
// Everything here is about making that split hard to get wrong.

/**
 * Longest message accepted.
 *
 * Clamped in three places on purpose — the input's maxLength, the route, and
 * again on the way in from the wire. The first is a courtesy, the second is the
 * rule, and the third is because a line arriving off a socket should cost a
 * line rather than the layout even when the sender is meant to be trusted.
 */
export const CHAT_MAX_LEN = 160;

/** How much scrollback the dock keeps. See ChatDock for why this number. */
export const CHAT_HISTORY = 120;

/**
 * The channel a shard talks in.
 *
 * Named `worldchat` rather than `chat`, and the rename is load-bearing: the old
 * `evergreen:<shard>:chat` was a PUBLIC channel that any browser could write
 * to. `private` is a property of a subscription rather than of a topic, so a
 * stale tab left open on the old name could keep sending forged payloads to
 * anyone still listening there. A new name retires the forgeable room outright
 * instead of trying to police it.
 *
 * The RLS policy in supabase/migrations matches `evergreen:%:worldchat`, so a
 * change here is a change there. chat.test.ts checks the two still agree.
 */
export function chatTopic(shard: string): string {
  return `evergreen:${shard}:worldchat`;
}

/** One line in the log, exactly as the server stamps it. */
export interface ChatLine {
  /** Local id: the wire carries no id, and React needs a stable key. */
  id: number;
  /** Who actually said it. Proven by a session, never read from a payload. */
  wallet: string;
  /** Their profile name at the time they said it, resolved server-side. */
  name: string;
  text: string;
  at: number;
  /** Said by this client. Drawn differently so you can find your own line. */
  mine?: boolean;
  /** Not a person: a refusal, a connection notice, the room's own voice. */
  system?: boolean;
}

/*
 * Line breaks and tabs become a SPACE. Everything else invisible is deleted.
 *
 * The split matters, and it was wrong the first time. Deleting a newline
 * outright turns "sold\nthe axe" into "soldthe axe" — a break is whitespace, it
 * separates words, and removing it silently rewrites the sentence. Deleting a
 * zero-width character is the opposite and equally deliberate: it is padding
 * with no width, so "a<zwsp>dmin" is somebody spelling "admin" while getting
 * past a comparison, and turning it into "a dmin" would preserve the trick.
 */
const BREAKS = /[\n\r\t\v\f\u0085\u2028\u2029]/g;

/*
 * The rest of what never reaches the screen.
 *
 * Control characters would break the layout, but the one that actually matters
 * is U+202E RIGHT-TO-LEFT OVERRIDE and its neighbours: they reverse the text
 * that follows them, which is the oldest trick for making a chat line read as
 * something other than what was sent. Zero-width characters go with them.
 */
const INVISIBLE = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g;

/**
 * A message as it will actually be stored and shown, or null if there is none.
 *
 * Returns null rather than throwing for empty input because "the player pressed
 * enter on a blank box" is not an error, it is nothing happening.
 */
export function sanitizeChat(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw
    .replace(BREAKS, ' ')
    .replace(INVISIBLE, '')
    // Runs of whitespace collapse to one space. The log is a list of lines, so
    // a message carrying twelve breaks of its own is a message that pushes
    // everybody else's out of view.
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, CHAT_MAX_LEN);
  return cleaned.length ? cleaned : null;
}

/**
 * What to call a wallet on a chat line.
 *
 * One definition, used by the server when it stamps a line. It was previously
 * computed in the browser, which is precisely the arrangement this whole change
 * exists to end — a name the client chooses is a name the client can choose
 * freely.
 *
 * The display name goes through the same sieve a message does, because it is
 * the second player-controlled field on a line: a profile named with zero-width
 * padding is how one account renders as another.
 */
export function chatName(wallet: string, displayName?: string | null): string {
  const named = typeof displayName === 'string' ? sanitizeChat(displayName) : null;
  if (named) return named.slice(0, 24);
  return `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;
}
