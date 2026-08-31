'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import PageShell from '@/components/ui/PageShell';
import { api, type ProtocolOverview } from '@/lib/api-client';
import { AURA_BANDS, auraRange } from '@/lib/aura';
import {
  CLAIM_FEE_BPS,
  COMPOUND_FEE_ETH,
  COMPOUND_LEVELS,
  CRATE_FEE_ETH,
  CRATE_OPEN_USD,
  EXPEDITE_FEE_ETH,
  MAX_COMPOUND_LEVEL,
  MINT_FEE_ETH,
  LIFETIME_EMISSION_LABEL,
  SUPPLY_LABEL,
  EMISSION_RESERVE_LABEL,
  PUBLIC_FLOAT_LABEL,
  RESERVE_PCT_LABEL,
  FLOAT_PCT_LABEL,
  GENESIS_RATE_PER_SEC,
  EMISSION_TAIL_DAY,
  HALVING_PERIOD_DAYS,
  HALVING_PERIOD_LABEL,
  HALVING_SCHEDULE_TEXT,
  getShaftBonusSlots,
} from '@/lib/economy';

// Actual server response shape for /api/nodes/families (NODE_FAMILIES).
interface FamilyEcon {
  key: string;
  name: string;
  description: string;
  family: 'oil' | 'mine';
  burnCostGreen: number;
  burnShareBps: number;
  treasuryShareBps: number;
  mintFeeEth: number;
}

// Column widths are padded from the values rather than hardcoded, so the
// diagram stays aligned if the supply or reserve share is ever retuned.
const FLOW_COL = 24;
const FLOW_BOX = 29;

const REWARD_FLOW = `Launch: ${SUPPLY_LABEL} GREEN minted by Flap to the bonding curve
        (fixed supply — the token contract has no mint function)
                │
       ┌────────┴────────┐
       ▼                 ▼
 ${`${PUBLIC_FLOAT_LABEL} public float`.padEnd(FLOW_COL)}${EMISSION_RESERVE_LABEL} acquired at genesis
 ${`(${FLOAT_PCT_LABEL}, trades freely)`.padEnd(FLOW_COL)}(${RESERVE_PCT_LABEL}, funds all rewards)
                                 │
  ┌─────────────────────────────┐│
  │${'   GREEN Emission Reserve'.padEnd(FLOW_BOX)}│◀┘
  │${`   ${EMISSION_RESERVE_LABEL} GREEN`.padEnd(FLOW_BOX)}│◀── reserve split on in-game
  └──────────────┬──────────────┘     spends tops the pool back up
                 │  halving curve E(t) = ${GENESIS_RATE_PER_SEC.toFixed(1)} × 0.5^(t/${HALVING_PERIOD_DAYS}d)
                 ▼
    Each user's per-second rate:
    share = min(userGP / totalGP, 30%) × welcomeBoost(elapsed)
                 │
                 ▼
  ┌─────────────────────────┐       ┌──────────────────────────┐
  │  Equity Desk claims     │       │  Treasury Desk claims    │
  │  pay GREEN               │       │  pay GREEN (reinvestable) │
  └─────────────────────────┘       └──────────────────────────┘

  Separately: Protocol ETH revenue (ERC-20 tax 2% + LP 2%) → treasury ops`;

const HALVING_TABLE = `E(t) = E₀ × 0.5 ^ (t / ${HALVING_PERIOD_LABEL})

${HALVING_SCHEDULE_TEXT}
Day ${EMISSION_TAIL_DAY} : ~0            (99% emitted — tail is negligible)`;

const USER_RATE = `user_rate = min(user_gp / total_network_gp, 30%) × E(t) × welcome_boost

user_gp = Σ componentMult for each node (Formula D: base × Π rarityBoost)`;

const WELCOME_BOOST = `boost(elapsed) = 1 + 7 × max(0, 1 − elapsed / 72h)

Hour 0  : 8.00×
Hour 24 : 5.67×
Hour 48 : 3.33×
Hour 72 : 1.00× (boost expired)`;

const THROTTLE = `runwayDays = reserveBalance / unconstrainedDailyBurn

runway ≥ 45d  →  f = 1.0      (healthy)
14d → 45d     →  f 0.7 → 1.0  (gentle)
7d  → 14d     →  f 0.3 → 0.7  (notable)
3d  → 7d      →  f 0   → 0.3  (emergency)
≤ 3d          →  f = 0        (halted)`;

export default function TokenomicsPage() {
  const [families, setFamilies] = useState<FamilyEcon[] | null>(null);
  const [overview, setOverview] = useState<ProtocolOverview | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [fams, ov] = await Promise.all([api.families(), api.overview()]);
        setFamilies(fams as unknown as FamilyEcon[]);
        setOverview(ov);
      } catch {
        /* silently swallowed — static copy still renders */
      }
    })();
  }, []);

  const mintEthFee = families?.[0]?.mintFeeEth ?? MINT_FEE_ETH;

  return (
    <PageShell
      title="GREEN Network Model"
      subtitle="The live emission, burn, treasury, and yield logic behind the Evergreen economy."
    >
      <div className="space-y-10">
        {/* 1. The Economic Loop */}
        <Section title="01 / Yield Flywheel">
          <ol className="list-decimal space-y-3 pl-5 text-sm leading-relaxed text-steel-300">
            <li>
              Users burn GREEN + pay an ETH fee to open virtual desks (Equity or Treasury Desks).
            </li>
            <li>
              Every mint burns <strong className="text-white">70%</strong> of the GREEN cost to the
              burn wallet, routing the other <strong className="text-white">30%</strong> into the
              treasury wallet. Portfolio upgrades and allocations split their GREEN cost{' '}
              <strong className="text-white">50/30/20</strong> burn / reserve / treasury.
            </li>
            <li>
              A halving emission curve (E₀ = {GENESIS_RATE_PER_SEC.toFixed(1)} GREEN/sec, halves
              every {HALVING_PERIOD_LABEL}) distributes GREEN from the{' '}
              <strong className="text-white">{EMISSION_RESERVE_LABEL} reserve</strong>. The rate is
              derived from the reserve rather than fixed, so the schedule spends it exactly and can
              never promise GREEN the protocol does not hold. Each user earns a share proportional to
              their yield power, capped at 30% per user to prevent lottery-in-thin-network wins.
            </li>
            <li>
              Under v2 accrual, both <strong className="text-white">Equity Desks</strong> and{' '}
              <strong className="text-white">Treasury Desks</strong> accrue{' '}
              <strong className="text-white">$GREEN</strong> per second out of that reserve.
              Progression is wallet-wide: <strong className="text-white">portfolio upgrades</strong>{' '}
              (GREEN + {COMPOUND_FEE_ETH} ETH, 12h cooldown) raise your Portfolio Level, unlocking
              more desk slots,
              more daily allocations, and higher rarity pools. Treasury Desks add bonus desk slots at L5+.
            </li>
            <li>
              Protocol ETH revenue (ERC-20 transfer tax (2%) + DEX LP fees (2%)) flows to the
              treasury ops budget — it funds infrastructure, not user rewards. User accrual is
              GREEN-only from the halving reserve.
            </li>
          </ol>
        </Section>

        {/* 2. Node Family Economics */}
        <Section title="02 / Desk Economics">
          {!families ? (
            <p className="text-sm text-steel-400">Loading…</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {families.map((f) => (
                <div key={f.key} className="panel p-4">
                  <h3 className="font-mono text-sm font-bold uppercase tracking-widest text-lime-300">
                    {f.name}
                  </h3>
                  <p className="mt-1 text-xs text-steel-400">{f.description}</p>
                  <dl className="mt-3 space-y-1.5 text-sm">
                    <Row k="Mint cost" v={`${f.burnCostGreen.toLocaleString()} GREEN`} />
                    <Row
                      k="→ burned (70%)"
                      v={`${((f.burnCostGreen * f.burnShareBps) / 10000).toLocaleString()} GREEN`}
                      dim
                    />
                    <Row
                      k="→ treasury (30%)"
                      v={`${((f.burnCostGreen * f.treasuryShareBps) / 10000).toLocaleString()} GREEN`}
                      dim
                    />
                    <Row k="ETH mint fee" v={`${f.mintFeeEth} ETH`} />
                    <Row k="Reward asset" v="GREEN (halving share)" />
                    <Row k="Share formula" v="min(userGp / totalGp, 30%) × E(t) × welcomeBoost" />
                    <Row
                      k="Family perk"
                      v={
                        f.family === 'mine'
                          ? 'Bonus desk slots at L5/L7/L9 (+2/+3/+4)'
                          : 'Claim-only earnings in v1'
                      }
                    />
                  </dl>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* 3. Fees */}
        <Section title="03 / Network Routing Costs">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <FeeCard label="Mint burn" value="70%" caption="of GREEN cost" />
            <FeeCard label="Mint treasury" value="30%" caption="of GREEN cost" />
            <FeeCard label="Mint ETH fee" value={`${mintEthFee} ETH`} caption="flat, per mint" />
            <FeeCard
              label="Claim fee"
              value={`${CLAIM_FEE_BPS / 100}%`}
              caption="on gross claim · 1h cooldown"
            />
            <FeeCard
              label="Portfolio upgrade"
              value="500 → 60k GREEN"
              caption={`L2→L10 ladder · +${COMPOUND_FEE_ETH} ETH · 12h cooldown`}
            />
            <FeeCard
              label="Expedite"
              value={`${EXPEDITE_FEE_ETH} ETH`}
              caption="skip the upgrade cooldown"
            />
            <FeeCard
              label="Allocation cost"
              value={`$${CRATE_OPEN_USD} of GREEN`}
              caption={`priced in USD, so it does not drift with the token · +${CRATE_FEE_ETH} ETH fee`}
            />
            <FeeCard
              label="Upgrade & allocation split"
              value="50/30/20"
              caption="burn / reserve / treasury"
            />
          </div>
        </Section>

        {/* 4. Reward Flow */}
        <Section title="04 / Yield Routing Diagram">
          <div className="mb-4 grid gap-2 md:grid-cols-4">
            {['Acquire GREEN', 'Open desks', 'Farm emissions', 'Reinvest & upgrade'].map((label, index) => (
              <div key={label} className="panel relative px-3 py-4 text-center font-mono text-[11px] uppercase tracking-wider text-lime-300">
                <span className="mb-2 block text-lg text-white">0{index + 1}</span>
                {label}
              </div>
            ))}
          </div>
          <div className="panel overflow-x-auto p-4">
            <pre className="font-mono text-[11px] leading-relaxed text-steel-300">{REWARD_FLOW}</pre>
          </div>
        </Section>

        {/* 5. Halving Emission Model */}
        <Section title="05 / GREEN Emission Clock">
          <p className="text-sm leading-relaxed text-steel-300">
            Global GREEN emission follows a Bitcoin-style halving curve. Starting at{' '}
            <code className="rounded bg-ink-700 px-1 font-mono text-xs text-lime-300">
              E₀ = {GENESIS_RATE_PER_SEC.toFixed(1)} GREEN/sec
            </code>{' '}
            at genesis, the rate halves every{' '}
            <strong className="text-white">{HALVING_PERIOD_LABEL}</strong> until
            the reserve is fully paid out.
          </p>
          <div className="panel mt-3 overflow-x-auto p-4">
            <pre className="font-mono text-[11px] leading-relaxed text-steel-300">
              {HALVING_TABLE}
            </pre>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-steel-300">
            Lifetime emission ={' '}
            <strong className="text-white">{LIFETIME_EMISSION_LABEL} GREEN</strong> — exactly the{' '}
            {RESERVE_PCT_LABEL} of the {SUPPLY_LABEL} supply held in the Emission Reserve. The
            remaining <strong className="text-white">{PUBLIC_FLOAT_LABEL}</strong> ({FLOAT_PCT_LABEL}
            ) is public float that trades on the Flap curve. Supply is fixed at launch — the token
            contract has no mint function, so no new GREEN can ever be created.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-steel-300">
            Each user earns a proportional share of each second&rsquo;s emission:
          </p>
          <div className="panel mt-3 overflow-x-auto p-4">
            <pre className="font-mono text-[11px] leading-relaxed text-steel-300">{USER_RATE}</pre>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-steel-300">
            A 30% per-user share cap prevents lucky-in-thin-network lottery wins, keeping the
            experience fair across network sizes.
          </p>
        </Section>

        {/* 5b. Welcome Boost */}
        <Section title="05B / New-Fund Accelerator">
          <p className="text-sm leading-relaxed text-steel-300">
            New users receive an <strong className="text-white">8× share multiplier</strong> that
            linearly decays to 1× over their first 72 hours. This is critical for latecomers joining
            mid-cycle when the halving curve has already decayed.
          </p>
          <div className="panel mt-3 overflow-x-auto p-4">
            <pre className="font-mono text-[11px] leading-relaxed text-steel-300">
              {WELCOME_BOOST}
            </pre>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-steel-300">
            The boost applies from your first mint. Separately, the one-time{' '}
            <strong className="text-white">welcome stipend</strong> unlocks only after reaching
            Portfolio L4 — that gate is what stops $100 × 10 alt-wallets from draining the welcome
            allocation.
          </p>
        </Section>

        {/* 5c. Emission Throttle */}
        <Section title="05C / Reserve Safety Interlock">
          <p className="text-sm leading-relaxed text-steel-300">
            Orthogonal to the halving, a runway-based throttle factor{' '}
            <code className="rounded bg-ink-700 px-1 font-mono text-xs text-lime-300">
              f ∈ [0, 1]
            </code>{' '}
            protects against pathological drain on legacy flat-rate families (not used for GREEN under
            the halving model, but retained for any future secondary-asset families):
          </p>
          <div className="panel mt-3 overflow-x-auto p-4">
            <pre className="font-mono text-[11px] leading-relaxed text-steel-300">{THROTTLE}</pre>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-steel-300">
            Under the halving model for GREEN, the emission reserve is pre-minted and cannot deplete
            beyond lifetime emission, so{' '}
            <code className="rounded bg-ink-700 px-1 font-mono text-xs text-lime-300">f = 1.0</code>{' '}
            effectively always. When paused by admin, f is forced to 0 across all families.
          </p>
        </Section>

        {/* 6. Warehouse Levels */}
        <Section title="06 / Portfolio Tiers">
          <p className="text-sm leading-relaxed text-steel-300">
            Progression is wallet-wide. Each portfolio level unlocks more desk slots per family, a
            higher daily allocation limit, and pricier allocations. Upgrades cost GREEN (split 50/30/20 burn /
            reserve / treasury) + {COMPOUND_FEE_ETH} ETH, on a 12h cooldown ({EXPEDITE_FEE_ETH} ETH
            expedite skips it). Treasury Desks get bonus desk slots on top: +2 at L5, +3 at L7, +4 at L9. Rarity pools unlock by
            level too — Legendary at L4, Mythic at L6, Divine at L8.
          </p>
          <div className="panel mt-3 overflow-x-auto">
            <table className="w-full whitespace-nowrap text-left text-sm">
              <thead>
                <tr className="border-b border-ink-600">
                  <th className="stat-label px-4 py-3 font-normal">Level</th>
                  <th className="stat-label px-4 py-3 text-right font-normal">Upgrade cost</th>
                  <th className="stat-label px-4 py-3 text-right font-normal">Max desks / family</th>
                  <th className="stat-label px-4 py-3 text-right font-normal">Treasury Desk bonus</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-600/60">
                {Array.from({ length: MAX_COMPOUND_LEVEL }, (_, i) => i + 1).map((lvl) => {
                  const row = COMPOUND_LEVELS[lvl];
                  const bonus = getShaftBonusSlots(lvl);
                  return (
                    <tr key={lvl}>
                      <td className="px-4 py-2.5 font-mono text-lime-300">L{lvl}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-white">
                        {lvl === 1 ? '—' : `${row.greenUpgradeCost.toLocaleString()} GREEN`}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-white">{row.maxNodes}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-steel-300">
                        {bonus > 0 ? `+${bonus} treasury desks` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Section>

        {/* 7. Aura Tier Palette */}
        <Section title="07 / Desk Aura Spectrum">
          <p className="text-sm leading-relaxed text-steel-300">
            Each desk&rsquo;s emissive material color shifts with its level, making progression
            visible at a glance in the 3D scene.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {AURA_BANDS.map((band) => (
              <div key={band.label} className="eg-grade" style={{ ['--grade' as string]: band.color }}>
                <b>{auraRange(band)}</b>
                <small>{band.label}</small>
              </div>
            ))}
          </div>
        </Section>

        {/* 8. Live Protocol State */}
        <Section title="08 / Live Network Analytics">
          {!overview ? (
            <p className="text-sm text-steel-400">Loading live state…</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <LiveCard
                label="GREEN Burned"
                value={overview.totalGreenBurned.toLocaleString()}
                suffix="GREEN"
              />
              <LiveCard
                label="Desks Opened"
                value={String(overview.totalNodes)}
                suffix={`${overview.totalEquityDesks} equity desks · ${overview.totalTreasuryDesks} treasury desks`}
              />
              <LiveCard
                label="Protocol ETH Revenue"
                value={overview.totalCreatorRewardsProcessed.toFixed(4)}
                suffix="ETH (transfer tax + LP)"
              />
              <LiveCard
                label="GREEN Reserve"
                value={overview.greenReserveBalance.toLocaleString()}
                suffix="GREEN"
                color="#ffd24d"
              />
            </div>
          )}
          <p className="mt-3 text-xs text-steel-400">
            See{' '}
            <Link href="/app/vault" className="text-lime-300 hover:underline">
              <strong>The Vault</strong>
            </Link>{' '}
            for the full event feed. The Exchange is a table you walk to on the{' '}
            <Link href="/app/trading-floor" className="text-lime-300 hover:underline">
              <strong>Trading Floor</strong>
            </Link>
            .
          </p>
        </Section>

        {/* 9. Source of Truth */}
        <Section title="09 / Protocol Source Matrix">
          <p className="text-sm leading-relaxed text-steel-300">
            All constants on this page are imported from{' '}
            <code className="rounded bg-ink-700 px-1 font-mono text-xs text-lime-300">
              @evergreen/protocol
            </code>{' '}
            and{' '}
            <code className="rounded bg-ink-700 px-1 font-mono text-xs text-lime-300">
              @evergreen/yield-engine
            </code>
            , and the live family config comes from{' '}
            <code className="rounded bg-ink-700 px-1 font-mono text-xs text-lime-300">
              GET /api/nodes/families
            </code>
            , so this page can never drift from what the backend actually enforces. Admin config
            changes appear here on the next reload.
          </p>
        </Section>
      </div>
    </PageShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="eg-doc-heading mb-3">{title}</h2>
      {children}
    </section>
  );
}

function Row({ k, v, dim }: { k: string; v: string; dim?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={`text-xs ${dim ? 'text-steel-500' : 'text-steel-400'}`}>{k}</dt>
      <dd
        className={`text-right font-mono text-xs ${dim ? 'text-steel-500' : 'text-steel-200'}`}
      >
        {v}
      </dd>
    </div>
  );
}

function FeeCard({ label, value, caption }: { label: string; value: string; caption: string }) {
  return (
    <div className="panel p-4">
      <p className="stat-label">{label}</p>
      <p className="mt-1 font-mono text-lg text-white">{value}</p>
      <p className="mt-0.5 text-[11px] text-steel-500">{caption}</p>
    </div>
  );
}

function LiveCard({
  label,
  value,
  suffix,
  color,
}: {
  label: string;
  value: string;
  suffix: string;
  color?: string;
}) {
  return (
    <div className="panel p-4">
      <p className="stat-label">{label}</p>
      <p className="mt-1 break-words font-mono text-lg" style={{ color: color ?? '#ffffff' }}>
        {value}
      </p>
      <p className="mt-0.5 text-[11px] text-steel-500">{suffix}</p>
    </div>
  );
}
