// Pull every known wallet's live game state out of a running deployment and
// write it to a timestamped JSON file under data/.
//
// The authoritative game state is a SQLite file on the Railway volume, which is
// not reachable from a workstation. These read-only endpoints are, so this is
// how a pre-wipe backup gets taken without shell access to the container.
//
//   node scripts/snapshot-game-state.mjs --base https://example.com \
//     [--wallets data/osr-final-supabase-snapshot.json]
//
// Wallets are read from a Supabase snapshot (see snapshot-supabase.mjs) or
// passed directly as --wallet 0x... flags.

import fs from 'node:fs';
import path from 'node:path';

function flag(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 ? process.argv[index + 1] : fallback;
}

const base = (flag('base') ?? '').replace(/\/$/, '');
if (!base) {
  console.error('--base <url> is required, e.g. --base https://playgpu.fun');
  process.exit(1);
}

const wallets = new Set(
  process.argv.filter((arg, i) => process.argv[i - 1] === '--wallet').map((w) => w.toLowerCase())
);

const walletSource = flag('wallets');
if (walletSource && fs.existsSync(walletSource)) {
  const snapshot = JSON.parse(fs.readFileSync(walletSource, 'utf8'));
  for (const row of snapshot.tables?.profiles ?? []) wallets.add(String(row.wallet).toLowerCase());
}

if (wallets.size === 0) {
  console.error('No wallets resolved. Pass --wallets <snapshot.json> or --wallet 0x...');
  process.exit(1);
}

async function get(url) {
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  const text = await response.text();
  try {
    return { status: response.status, body: JSON.parse(text) };
  } catch {
    return { status: response.status, body: text.slice(0, 400) };
  }
}

const snapshot = { takenAt: new Date().toISOString(), base, wallets: {} };

for (const wallet of wallets) {
  const [inventory, operation] = await Promise.all([
    get(`${base}/api/user/${wallet}/inventory`),
    get(`${base}/api/user/${wallet}/operation`),
  ]);
  snapshot.wallets[wallet] = { inventory, operation };
  const nodes = Array.isArray(inventory.body?.nodes) ? inventory.body.nodes.length : '?';
  console.log(`${wallet}  inventory:${inventory.status} operation:${operation.status} nodes:${nodes}`);
}

// Protocol-wide counters, so the emission clock and burn totals are recorded
// alongside the per-wallet detail.
snapshot.protocol = {
  overview: await get(`${base}/api/protocol/overview`),
  reserves: await get(`${base}/api/protocol/reserves`),
  listings: await get(`${base}/api/market/listings`),
};

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outFile = flag('out') ?? path.join('data', `game-state-snapshot-${stamp}.json`);
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(snapshot, null, 2));
console.log(`\nWrote ${outFile}`);
