-- World chat: readable by anyone in the world, writable only by the server.
--
-- Chat used to be client-to-client over the publishable key, which meant the
-- name on a message was whatever the sender's browser felt like typing into the
-- payload. Anyone who opened devtools could speak as anybody. That is fine for
-- a toy and not fine for a game where a name is an identity people trade on, so
-- the transport itself now refuses forged writes rather than the UI hoping
-- nobody tries.
--
-- HOW IT WORKS. Realtime Authorization consults RLS on realtime.messages, but
-- ONLY for channels the client opens with `private: true` -- a public channel
-- skips this table entirely. So the rule below applies to the chat room and
-- leaves the presence and position channels (still public, still hot, see
-- useWorldPresence) completely untouched.
--
-- SELECT is granted, INSERT is deliberately NOT. Realtime checks SELECT to
-- decide whether a subscriber may receive on a topic, and INSERT to decide
-- whether it may broadcast. With no INSERT policy, RLS denies by default and
-- every browser on the channel is read-only. The service role bypasses RLS, so
-- /api/chat/say -- which knows who the caller actually is, because it checked a
-- session -- is the only thing in the world that can put a line in the room.
--
-- THE TOPIC NAME CHANGED, from `…:chat` to `…:worldchat`, and that is not
-- cosmetic. `private` is a property of a subscription rather than of the topic,
-- so during a rollout an old client could sit on the same topic name in public
-- mode and keep sending forged payloads to anyone still listening. A new name
-- means the old clients are talking to an empty room until they reload, which
-- is the correct outcome for a client whose messages can no longer be trusted.

create policy "world chat is readable by everyone"
on realtime.messages
for select
to anon, authenticated
using (
  extension = 'broadcast'
  and realtime.topic() like 'evergreen:%:worldchat'
);
