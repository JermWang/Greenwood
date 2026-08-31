import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { CHAT_MAX_LEN, chatName, chatTopic, sanitizeChat } from './chat';

describe('chatTopic', () => {
  it('names one room per shard', () => {
    expect(chatTopic('evergreen-1')).toBe('evergreen:evergreen-1:worldchat');
    expect(chatTopic('evergreen-eu')).not.toBe(chatTopic('evergreen-ap'));
  });

  /*
   * The topic and the RLS policy are one decision written in two languages.
   *
   * If the topic stops matching the policy's LIKE pattern, the channel is no
   * longer authorized: subscribers get CHANNEL_ERROR and the room goes silent
   * with nothing in any log to say why. That failure is invisible in every
   * other test here, because every other test runs without Supabase — so it is
   * checked against the migration itself.
   */
  it('matches the pattern the migration grants read on', () => {
    const sql = fs.readFileSync(
      path.join(process.cwd(), 'supabase/migrations/20260831120000_world_chat_authorization.sql'),
      'utf8'
    );
    const pattern = sql.match(/realtime\.topic\(\) like '([^']+)'/)?.[1];
    expect(pattern, 'the migration should still grant read on a topic pattern').toBeTruthy();
    const asRegex = new RegExp(`^${pattern!.replace(/[.]/g, '\\.').replace(/%/g, '.*')}$`);
    expect(chatTopic('evergreen-1')).toMatch(asRegex);
    expect(chatTopic('evergreen-ap')).toMatch(asRegex);
    // And the retired public topic must NOT match, or the rename bought nothing.
    expect('evergreen:evergreen-1:chat').not.toMatch(asRegex);
  });
});

describe('sanitizeChat', () => {
  it('keeps ordinary text', () => {
    expect(sanitizeChat('  anyone selling a bronze axe? ')).toBe('anyone selling a bronze axe?');
  });

  it('is nothing rather than an error when there is nothing to say', () => {
    expect(sanitizeChat('')).toBeNull();
    expect(sanitizeChat('   \n\t ')).toBeNull();
    expect(sanitizeChat(undefined)).toBeNull();
    expect(sanitizeChat(42)).toBeNull();
    expect(sanitizeChat({ t: 'hi' })).toBeNull();
  });

  it('collapses newlines so one message cannot clear the log', () => {
    expect(sanitizeChat('a\n\n\n\n\n\n\n\n\n\nb')).toBe('a b');
  });

  it('clamps to the wire limit', () => {
    const long = 'x'.repeat(500);
    expect(sanitizeChat(long)).toHaveLength(CHAT_MAX_LEN);
  });

  /*
   * The one that actually matters. U+202E reverses everything after it, which
   * is the oldest way to make a line read as something other than what was
   * sent — and it survives every length and type check ever written.
   */
  it('strips direction overrides and invisible padding', () => {
    expect(sanitizeChat('safe\u202Egnihtemos esle')).toBe('safegnihtemos esle');
    expect(sanitizeChat('a\u200Bd\u200Bm\u200Bi\u200Bn')).toBe('admin');
    expect(sanitizeChat('\u0007bell')).toBe('bell');
    // A message made only of invisibles is a message with nothing in it.
    expect(sanitizeChat('\u200B\u200B\u202E')).toBeNull();
  });
});

describe('chatName', () => {
  const WALLET = '0x1234567890abcdef1234567890abcdef12345678';

  it('prefers the profile name', () => {
    expect(chatName(WALLET, 'Ashby Holdings')).toBe('Ashby Holdings');
  });

  it('falls back to a shortened address', () => {
    expect(chatName(WALLET, null)).toBe('0x1234…5678');
    expect(chatName(WALLET, '   ')).toBe('0x1234…5678');
  });

  it('clamps a long name rather than letting it push the message off the line', () => {
    expect(chatName(WALLET, 'A'.repeat(80))).toHaveLength(24);
  });

  /*
   * A display name goes through the same sieve a message does. It is stored on
   * a profile the player controls, so it is the second field on a chat line
   * that a person can choose — and an invisible-padded name is how one account
   * renders as another.
   */
  it('sieves the profile name too', () => {
    expect(chatName(WALLET, 'a\u200Bdmin')).toBe('admin');
    expect(chatName(WALLET, '\u202E')).toBe('0x1234…5678');
  });
});
