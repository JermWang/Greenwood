import { NextResponse } from 'next/server';
import { requireAuthenticatedWallet } from '@/lib/api-util';
import { GameError } from '@/lib/game';
import { isDemoWallet } from '@/lib/demo';
import { getGlobalProfile } from '@/lib/profiles';
import { shardFromCookie, shardById } from '@/lib/shards';
import { chatName, chatTopic, sanitizeChat } from '@/lib/chat';

export const dynamic = 'force-dynamic';

/*
 * The only thing in the world that can put a line in world chat.
 *
 * WHY A ROUTE AT ALL, when the browser was already connected to the channel and
 * could simply send. Because a message it sends carries a name IT chose. Chat
 * was client-to-client over the publishable key, so the wallet and the display
 * name in a payload were decoration — anyone who opened devtools could speak as
 * anybody, and there was nothing on the receiving side that could tell.
 *
 * The fix is not validation, it is ARRANGEMENT. The channel is now a private
 * one whose RLS policy grants SELECT and deliberately withholds INSERT (see
 * supabase/migrations/20260831120000_world_chat_authorization.sql), so every
 * browser on it is read-only and Realtime drops a forged frame at the server
 * before it reaches a single subscriber. The service key bypasses RLS, which
 * makes this route the sole writer — and this route knows who the caller is,
 * because requireAuthenticatedWallet checked a session before it got here.
 *
 * Worth knowing, because it misled me while testing: a denied browser send
 * still returns 'ok' from supabase-js. The websocket accepted the frame; the
 * server discarded it. A client genuinely cannot tell the difference, which is
 * a second reason the send path has to be HTTP — an honest client needs to be
 * told when its message did not go, and only this can tell it.
 */

/** Sent over HTTP rather than a socket, so the server can answer with a reason. */
function relayEndpoint(): { url: string; key: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    // Not a 500. Chat is the one system in the game that is allowed to be
    // absent — a world with no chat is playable, and saying so plainly beats an
    // input box that swallows everything typed into it.
    throw new GameError('World chat is not available on this server.', 503);
  }
  return { url, key };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const wallet = await requireAuthenticatedWallet(request, body.wallet, 'chat');

    /*
     * Demo accounts read the room but do not talk in it.
     *
     * A demo wallet is minted per browser and proves only that this browser
     * created it (see api-util), which means identities are free and unlimited
     * — exactly the thing a public room cannot survive. Every other demo
     * affordance is scoped to one player's own fund, so this is the first place
     * where "free identity" and "reaches forty strangers" meet.
     */
    if (isDemoWallet(wallet)) {
      throw new GameError('Sign in with a wallet to talk in world chat.', 403);
    }

    const text = sanitizeChat(body.text);
    if (!text) throw new GameError('Say something first.', 400);

    /*
     * The shard comes from the COOKIE, not the body.
     *
     * Not because the cookie is trustworthy — it is client-writable, and
     * shardFromCookie validates it against the table precisely because of that
     * — but because choosing a shard is already a player action with one door
     * (the picker at /start). Reading it here means a player talks in the world
     * they are actually standing in, rather than in whichever one their last
     * request claimed.
     */
    const shard = shardFromCookie(request.headers.get('cookie'));

    /*
     * The name is looked up, never accepted.
     *
     * This single line is the whole point of the route. The browser sends text;
     * who said it is decided here, from the profile that belongs to the session
     * that proved it owns this address.
     *
     * A profile read that fails falls back to the shortened address rather than
     * refusing the message: Supabase being briefly unreachable should cost a
     * player their display name for one line, not their ability to talk.
     */
    const profile = await getGlobalProfile(wallet).catch(() => null);
    const line = {
      w: wallet,
      n: chatName(wallet, profile?.displayName),
      t: text,
      at: Date.now(),
    };

    const { url, key } = relayEndpoint();
    const response = await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        messages: [
          // `private: true` has to be set on the way IN as well as on the way
          // out. Without it the message is published to the public flavour of
          // the topic, which the dock is not listening to — the line vanishes
          // with a 202 and no error anywhere.
          { topic: chatTopic(shard), event: 'say', private: true, payload: line },
        ],
      }),
    });

    if (!response.ok) {
      console.error('[chat/say] relay', response.status, await response.text().catch(() => ''));
      throw new GameError('World chat is unreachable right now.', 502);
    }

    // Returned so the sender's own line comes from the same place everybody
    // else's does. The dock draws THIS rather than what was typed, so a player
    // sees their real name and their message exactly as the room received it,
    // and never sees a line that failed to send.
    return NextResponse.json({
      line: { wallet: line.w, name: line.n, text: line.t, at: line.at },
      shard: shardById(shard)?.name ?? shard,
    });
  } catch (e) {
    if (e instanceof GameError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[chat/say]', e);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
