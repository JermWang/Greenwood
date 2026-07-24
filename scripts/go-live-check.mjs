// Launch gate. Validates a candidate token contract and the treasury's funding
// against the emission schedule BEFORE the CA is flipped on production.
//
//   node scripts/go-live-check.mjs 0xREAL_CONTRACT_ADDRESS [--base https://your-deployment]
//
// Reads only — sends nothing, changes nothing. Prints a green/red verdict. The
// point is to catch an underfunded treasury before it goes live: a claim
// consumes the player's accrual before it pays out, so flipping the CA onto a
// treasury that cannot cover rewards turns every claim into a burnt reward and
// a refund we owe.
//
// With --base it also checks what the protocol already owes. Everything played
// before the flip is a real liability after it: mirrored balances become
// claimable GPU, open contracts pay principal plus interest out of the treasury,
// and accrued node rewards become payouts. The app decides whether it can
// underwrite a contract by comparing against EMISSION_RESERVE, a compile-time
// constant — it never reads the treasury's actual balance — so nothing at
// runtime notices a treasury seeded with less than the schedule promises.

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

const CA = (process.argv[2] || '').trim();
const BASE = (() => {
  const i = process.argv.indexOf('--base');
  return i > -1 ? (process.argv[i + 1] ?? '').replace(/\/$/, '') : '';
})();
const RPC = process.env.NEXT_PUBLIC_RH_RPC ?? 'https://rpc.mainnet.chain.robinhood.com';
const TREASURY = (process.env.NEXT_PUBLIC_OSR_TREASURY_WALLET ?? '').trim();
const SUPPLY = Number(process.env.NEXT_PUBLIC_OSR_TOTAL_SUPPLY ?? 1_000_000_000);
const RESERVE_PCT = Number(process.env.NEXT_PUBLIC_OSR_EMISSION_RESERVE_PCT ?? 0.05);
const RESERVE = SUPPLY * RESERVE_PCT;

if (!/^0x[0-9a-fA-F]{40}$/.test(CA)) {
  console.error('usage: node scripts/go-live-check.mjs 0x<40-hex contract address>');
  process.exit(1);
}

const call = async (method, params) => {
  const r = await fetch(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const j = await r.json();
  if (j.error) throw new Error(`${method}: ${JSON.stringify(j.error)}`);
  return j.result;
};
const ethCall = (to, data) => call('eth_call', [{ to, data }, 'latest']);
const dec = (h) => BigInt(h || '0x0');
const readStr = (h) => {
  if (!h || h === '0x') return '(none)';
  const b = Buffer.from(h.slice(2), 'hex');
  try {
    const len = Number(dec('0x' + b.slice(32, 64).toString('hex')));
    return b.slice(64, 64 + len).toString('utf8');
  } catch {
    return '(unparsed)';
  }
};

const fails = [];
const warns = [];

const code = await call('eth_getCode', [CA, 'latest']);
if (!code || code === '0x') {
  fails.push('CA is not a contract on this chain');
  report();
  process.exit(1);
}

const decimals = Number(dec(await ethCall(CA, '0x313ce567')));
const symbol = readStr(await ethCall(CA, '0x95d89b41'));
const name = readStr(await ethCall(CA, '0x06fdde03'));
const supply = Number(dec(await ethCall(CA, '0x18160ddd'))) / 10 ** decimals;

const treasuryOsr = Number(dec(await ethCall(CA, '0x70a08231' + TREASURY.slice(2).padStart(64, '0')))) / 10 ** decimals;
const treasuryEth = Number(dec(await call('eth_getBalance', [TREASURY, 'latest']))) / 1e18;

console.log('token   ', CA);
console.log('         ', `${symbol} / ${name} / ${decimals} decimals`);
console.log('         ', `supply ${supply.toLocaleString()}`);
console.log('treasury', TREASURY);
console.log('         ', `${treasuryOsr.toLocaleString()} ${symbol}  |  ${treasuryEth} ETH`);
console.log('schedule ', `reserve ${RESERVE.toLocaleString()} (${RESERVE_PCT * 100}% of ${SUPPLY.toLocaleString()})`);
console.log();

// Contract sanity.
if (decimals !== 18) warns.push(`token has ${decimals} decimals, not 18 — verify the app's assumptions hold`);
if (Math.abs(supply - SUPPLY) / SUPPLY > 0.01) {
  warns.push(`on-chain supply ${supply.toLocaleString()} differs from configured ${SUPPLY.toLocaleString()}`);
}

// Funding — the checks that actually matter.
if (treasuryOsr <= 0) {
  fails.push('treasury holds 0 of this token — every claim would burn accrual and fail');
} else if (treasuryOsr < RESERVE) {
  warns.push(
    `treasury holds ${treasuryOsr.toLocaleString()} but the schedule promises ${RESERVE.toLocaleString()}. ` +
    `Fine only if you are intentionally seeding less than the full reserve.`
  );
}
if (treasuryEth <= 0) {
  fails.push('treasury holds 0 ETH — payouts cannot pay gas');
} else if (treasuryEth < 0.002) {
  warns.push(`treasury ETH is low (${treasuryEth}); tops out around ${Math.floor(treasuryEth / 0.0000036)} payouts`);
}

// Existing liabilities — what the treasury has to be able to honour on day one.
if (BASE) {
  try {
    const res = await fetch(`${BASE}/api/protocol/overview`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const o = await res.json();
    const mirrored = Number(o.mirroredBalances ?? 0);
    const principal = Number(o.contracts?.lockedPrincipal ?? 0);
    const interest = Number(o.contracts?.committedInterest ?? 0);
    const owed = mirrored + principal + interest;

    console.log('owed     ', `${owed.toLocaleString()} ${symbol} across ${o.activeOperators ?? 0} operators`);
    console.log('         ', `mirrored ${mirrored.toLocaleString()} | principal ${principal.toLocaleString()} | interest ${interest.toLocaleString()}`);

    // Accrued-but-unclaimed node rewards are a liability too, and the overview
    // does not expose them, so this floor is optimistic by design. Treat a pass
    // here as necessary, not sufficient.
    if (owed > treasuryOsr) {
      fails.push(
        `protocol owes ${owed.toLocaleString()} ${symbol} but the treasury holds ` +
        `${treasuryOsr.toLocaleString()}. Every pre-flip balance, contract and accrual becomes ` +
        `a real claim the moment the CA is set. Fund the treasury or wipe game state first.`
      );
    } else if (owed > 0) {
      warns.push(
        `${owed.toLocaleString()} ${symbol} of pre-flip play will become real claims. ` +
        `Intentional only if this is carried-over state rather than test data — ` +
        `scripts/wipe-game-state.mjs clears it.`
      );
    }
  } catch (e) {
    warns.push(`could not read liabilities from ${BASE} (${e.message}); solvency was NOT checked`);
  }
} else {
  warns.push('no --base given, so existing balances, contracts and accruals were not checked');
}

report();
process.exit(fails.length ? 1 : 0);

function report() {
  for (const w of warns) console.log('  warn ', w);
  for (const f of fails) console.log('  FAIL ', f);
  console.log();
  if (fails.length) console.log('NOT READY — resolve the failures above before flipping the CA.');
  else if (warns.length) console.log('Ready, with warnings. Read them before proceeding.');
  else console.log('READY — token and treasury check out. Safe to flip the CA.');
}
