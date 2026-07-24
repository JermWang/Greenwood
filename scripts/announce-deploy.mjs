// Open (or clear) the on-site "server update in progress" window.
//
// Run this BEFORE `railway up`, so connected players see the banner and the app
// refuses to start new actions while the cutover happens. A spend puts OSR
// on-chain before the server records it — if the server changes hands in
// between, the player has paid and we owe them a refund. Announcing first is
// the cheap way to avoid that entirely.
//
//   node scripts/announce-deploy.mjs 5      # open a 5 minute window
//   node scripts/announce-deploy.mjs 0      # clear it early (deploy abandoned)
//
// The window is a timestamp, so it expires on its own even if this is never
// called again — a forgotten banner unblocks itself rather than freezing the
// game indefinitely. Clients auto-reload when the new build starts serving,
// which usually clears the banner before the timer runs out.
//
// Requires OSR_ADMIN_TOKEN, matching the value set on the server.

import { readFileSync } from 'node:fs';

function loadEnv() {
  try {
    for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
      if (!line || line.startsWith('#') || !line.includes('=')) continue;
      const i = line.indexOf('=');
      const k = line.slice(0, i).trim();
      if (!process.env[k]) process.env[k] = line.slice(i + 1).trim();
    }
  } catch {
    /* env file is optional when the values are already exported */
  }
}
loadEnv();

const SITE = process.env.OSR_SITE_URL ?? 'https://playgpu.fun';
const TOKEN = (process.env.OSR_ADMIN_TOKEN ?? '').trim();
const minutes = Number(process.argv[2] ?? 5);

if (!TOKEN) {
  console.error('OSR_ADMIN_TOKEN is not set (add it to .env.local and to the Railway service).');
  process.exit(1);
}
if (!Number.isFinite(minutes) || minutes < 0 || minutes > 60) {
  console.error('usage: node scripts/announce-deploy.mjs <minutes 0-60>');
  process.exit(1);
}

const res = await fetch(`${SITE}/api/status`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
  body: JSON.stringify({ minutes }),
});
const body = await res.json().catch(() => ({}));

if (!res.ok) {
  console.error(`failed (${res.status}):`, body.error ?? body);
  process.exit(1);
}
if (body.cleared) {
  console.log('deploy notice cleared — players can act again');
} else {
  console.log(`deploy notice open for ${body.minutes} min (until ${new Date(body.until).toLocaleTimeString()})`);
  console.log('players now see the banner and new actions are refused; deploy when ready');
}
