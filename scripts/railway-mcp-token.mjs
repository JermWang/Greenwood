// Stop the Railway MCP logging out every hour.
//
// THE CAUSE.
//
// `railway login` stores an OAuth pair in ~/.railway/config.json with a SIXTY
// MINUTE access token:
//
//   "user": { "token": null, "accessToken": "...", "refreshToken": "...",
//             "tokenExpiresAt": <unix seconds> }
//
// The CLI refreshes that pair when you invoke it directly, which is why
// `railway whoami` in a terminal always works. The MCP server does not get that
// luxury: `railway mcp` is a long-running process started once when the editor
// launches, and it holds the token it was given at startup. An hour later that
// token is dead, every tool call returns "Unauthorized. Please run `railway
// login` again", and the only cure is restarting the whole editor.
//
// THE FIX.
//
// Railway account tokens do not expire. The CLI takes one from RAILWAY_API_TOKEN
// and prefers it over the stored OAuth pair — verified: with a bogus value set,
// `railway whoami` returns Unauthorized instead of the logged-in user, so the
// variable is genuinely consulted first. Putting a real one in the MCP server's
// own env means the server never touches the refresh cycle at all.
//
// This writes that variable into the `railway` entry of ~/.claude.json.
//
// Run it with:  node scripts/railway-mcp-token.mjs
// or double-click  scripts/Fix Railway Login.cmd
//
// Non-interactive, for when you already have the token to hand:
//
//   node scripts/railway-mcp-token.mjs --token <TOKEN>
//
// The token is read from argv only in that form and is never echoed. Note that
// an argument IS visible in shell history and to other processes on the machine
// while the command runs, which the prompt above avoids — use the prompt if
// that matters to you.
//
// NOTE ON THE TOKEN. You paste it; this script only moves it into place. It is
// stored in plaintext in ~/.claude.json, which is how every MCP server
// credential is stored — treat that file as a secret. Revoke a token any time
// at https://railway.com/account/tokens.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { execFileSync } from 'node:child_process';

const CONFIG = path.join(os.homedir(), '.claude.json');
const TOKENS_URL = 'https://railway.com/account/tokens';

const say = (...m) => console.log(...m);

function fail(message) {
  console.error(`\n  ✗ ${message}\n`);
  process.exit(1);
}

/** Prompt without echoing, so the token never lands in terminal scrollback. */
function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    // Swallow the echo of everything typed after the prompt itself.
    const write = rl._writeToOutput?.bind(rl);
    let armed = false;
    rl._writeToOutput = (chunk) => {
      if (!armed) return write?.(chunk);
      if (chunk.includes('\n') || chunk.includes('\r')) return write?.('\n');
    };
    rl.question(question, (answer) => {
      rl._writeToOutput = write;
      rl.close();
      resolve(answer.trim());
    });
    armed = true;
  });
}

/** Does this token actually work? Asked before anything is written. */
function tokenIsValid(token) {
  try {
    const out = execFileSync('railway', ['whoami'], {
      env: { ...process.env, RAILWAY_API_TOKEN: token },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      // Windows resolves railway.exe through the shell.
      shell: process.platform === 'win32',
    });
    return { ok: !/unauthorized/i.test(out), detail: out.trim() };
  } catch (error) {
    const detail = `${error.stdout ?? ''}${error.stderr ?? ''}`.trim() || String(error.message);
    return { ok: false, detail };
  }
}

async function main() {
  say('\n  Railway MCP — permanent login\n  ' + '─'.repeat(48));

  if (!fs.existsSync(CONFIG)) fail(`Could not find ${CONFIG}`);

  let config;
  try {
    config = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
  } catch (error) {
    fail(`${CONFIG} is not valid JSON (${error.message}). Nothing was changed.`);
  }

  const servers = config.mcpServers ?? {};
  if (!servers.railway) {
    fail(
      'No "railway" MCP server is registered in ~/.claude.json, so there is ' +
        'nothing to configure. Add the server first, then re-run this.'
    );
  }

  say(`\n  1. Opening ${TOKENS_URL}`);
  say('     Create a token there:  New Token  →  name it  →  Create');
  say('     Scope it to your ACCOUNT (not a single project) so every project works.\n');
  try {
    const opener =
      process.platform === 'win32' ? ['cmd', ['/c', 'start', '', TOKENS_URL]]
      : process.platform === 'darwin' ? ['open', [TOKENS_URL]]
      : ['xdg-open', [TOKENS_URL]];
    execFileSync(opener[0], opener[1], { stdio: 'ignore' });
  } catch {
    say(`     (Could not open a browser — visit the link above manually.)`);
  }

  // --token skips the prompt. Everything after it is identical, including the
  // validation — a token passed on the command line is not more trustworthy for
  // having been typed with a flag in front of it.
  const flagIndex = process.argv.indexOf('--token');
  const fromArgv = flagIndex >= 0 ? (process.argv[flagIndex + 1] ?? '').trim() : '';

  const token = fromArgv || (await askHidden('  2. Paste the token here and press Enter (input is hidden): '));
  if (!token) fail('No token entered. Nothing was changed.');

  say('\n  3. Checking the token against Railway…');
  const check = tokenIsValid(token);
  if (!check.ok) {
    fail(
      `Railway rejected that token, so it was NOT saved.\n    ${check.detail}\n\n` +
        '    Make sure you copied the whole value, and that the token is\n' +
        '    account-scoped rather than tied to a deleted project.'
    );
  }
  say(`     ✓ ${check.detail.replace(/\s+/g, ' ')}`);

  // Back up before touching a file the editor depends on to start at all.
  const backup = `${CONFIG}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  fs.copyFileSync(CONFIG, backup);

  servers.railway.env = { ...(servers.railway.env ?? {}), RAILWAY_API_TOKEN: token };
  config.mcpServers = servers;
  fs.writeFileSync(CONFIG, `${JSON.stringify(config, null, 2)}\n`);

  say('\n  4. Saved.');
  say(`     ~/.claude.json  updated  (backup: ${path.basename(backup)})`);
  say('\n  ' + '─'.repeat(48));
  say('  Restart Claude Code for the MCP server to pick it up.');
  say('  Account tokens do not expire — this should be the last time.\n');
}

main().catch((error) => fail(error.message));
