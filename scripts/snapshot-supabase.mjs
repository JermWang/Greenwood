// Dump every Supabase table to a timestamped JSON file under data/.
//
// Used as the pre-wipe backup when the OSR deployment was rebranded to GPU, and
// kept as a re-runnable safety net before any future destructive migration.
// data/ is gitignored, so snapshots never reach the repository.
//
//   node scripts/snapshot-supabase.mjs [--out data/my-snapshot.json]

import fs from 'node:fs';
import path from 'node:path';

const TABLES = ['profiles', 'activity_history', 'privy_identities'];

/** Read .env.local without adding a dotenv dependency. */
function loadEnvLocal() {
  const file = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const value = match[2].trim().replace(/^["']|["']$/g, '');
    if (!process.env[match[1]]) process.env[match[1]] = value;
  }
}

loadEnvLocal();

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
const key = process.env.SUPABASE_SECRET_KEY ?? '';
if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set.');
  process.exit(1);
}

const outFlag = process.argv.indexOf('--out');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outFile =
  outFlag > -1 ? process.argv[outFlag + 1] : path.join('data', `supabase-snapshot-${stamp}.json`);

const snapshot = { takenAt: new Date().toISOString(), project: url, tables: {} };

for (const table of TABLES) {
  const response = await fetch(`${url}/rest/v1/${table}?select=*`, {
    headers: { apikey: key, authorization: `Bearer ${key}` },
  });
  if (!response.ok) {
    console.error(`${table}: ${response.status} ${await response.text()}`);
    process.exit(1);
  }
  const rows = await response.json();
  snapshot.tables[table] = rows;
  console.log(`${table}: ${rows.length} rows`);
}

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(snapshot, null, 2));
console.log(`\nWrote ${outFile}`);
