// Wipe all game state for a real launch, then restart the emission clock.
//
// Clears the SQLite game database on the live server — every node, component,
// crate, listing, balance and ledger row from the test run — and resets the
// halving genesis to now, so day one pays out at the day-one rate instead of
// continuing the test's schedule.
//
//   node scripts/wipe-game-state.mjs           # dry run: shows current counts
//   node scripts/wipe-game-state.mjs --wipe    # actually wipe
//
// Irreversible. Requires OSR_ADMIN_TOKEN. Prints before/after row counts so the
// wipe is auditable.

import { readFileSync } from 'node:fs';

for (const line of tryRead('.env.local').split(/\r?\n/)) {
  if (!line || line.startsWith('#') || !line.includes('=')) continue;
  const i = line.indexOf('=');
  const k = line.slice(0, i).trim();
  if (!process.env[k]) process.env[k] = line.slice(i + 1).trim();
}
function tryRead(p) {
  try {
    return readFileSync(p, 'utf8');
  } catch {
    return '';
  }
}

const SITE = process.env.OSR_SITE_URL ?? 'https://playgpu.fun';
const TOKEN = (process.env.OSR_ADMIN_TOKEN ?? '').trim();
const DO_WIPE = process.argv.includes('--wipe');

if (!TOKEN) {
  console.error('OSR_ADMIN_TOKEN is not set.');
  process.exit(1);
}

if (!DO_WIPE) {
  // Dry run: read current state without touching it.
  const res = await fetch(`${SITE}/api/protocol/overview`, { cache: 'no-store' });
  const o = await res.json().catch(() => ({}));
  console.log('DRY RUN — nothing wiped. Current live state:');
  console.log('  total nodes     :', o.totalNodes ?? '?');
  console.log('  oil rigs        :', o.totalOilRigs ?? '?');
  console.log('  mining shafts   :', o.totalMiningShafts ?? '?');
  console.log('  genesis         :', o.genesisMs ? new Date(o.genesisMs).toISOString() : '?');
  console.log('\nRe-run with --wipe to clear everything and reset the emission clock.');
  process.exit(0);
}

console.log('WIPING all game state on', SITE, '...');
const res = await fetch(`${SITE}/api/admin/reset`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
  body: JSON.stringify({ confirm: 'WIPE-ALL-GAME-STATE', genesisMs: Date.now() }),
});
const body = await res.json().catch(() => ({}));

if (!res.ok) {
  console.error(`failed (${res.status}):`, body.error ?? body);
  process.exit(1);
}

console.log('\nWIPED.');
console.log('  rows before:', JSON.stringify(body.before));
console.log('  rows after :', JSON.stringify(body.after));
console.log('  new genesis:', body.genesisIso);

const leftover = Object.entries(body.after || {}).filter(([, n]) => n > 0);
if (leftover.length) {
  console.error('\nWARNING: some tables are not empty:', leftover);
  process.exit(1);
}
console.log('\nGame state is clean. Emission clock restarted.');
