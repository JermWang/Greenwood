'use client';

import { useState } from 'react';
import Link from 'next/link';
import PageShell from '@/components/ui/PageShell';
import ComponentTile from '@/components/ui/ComponentTile';
import NodePreview from '@/components/three/NodePreview';
import {
  LIFETIME_EMISSION_LABEL,
  SUPPLY_LABEL,
  EMISSION_RESERVE_LABEL,
  PUBLIC_FLOAT_LABEL,
  RESERVE_PCT_LABEL,
  FLOAT_PCT_LABEL,
  GENESIS_RATE_PER_SEC,
  DAY_ONE_EMISSION_LABEL,
  EMISSION_TAIL_DAY,
  HALVING_PERIOD_DAYS,
  HALVING_PERIOD_LABEL,
} from '@/lib/economy';
import { AURA_TIERS } from '@/lib/aura';
import {
  COMPOUND_FEE_ETH,
  CRATE_FEE_ETH,
  CRATE_OPEN_OSR,
  EXPEDITE_FEE_ETH,
  MINT_FEE_ETH,
  RARITY_MULT,
} from '@/lib/economy';
import {
  NODE_SLOTS,
  RARITIES,
  SLOT_LABELS,
  rarityHex,
  type NodeFamily,
  type Rarity,
} from '@/lib/rarity';

const CONTENTS: Array<{ href: string; label: string }> = [
  { href: '#trailer', label: 'New art direction' },
  { href: '#overview', label: '1. What is GPU?' },
  { href: '#quickstart', label: '2. Quick start' },
  { href: '#nodes', label: '3. Nodes: Fabs vs Cleanrooms' },
  { href: '#levels', label: '4. Levels & Auras' },
  { href: '#components', label: '5. Components & Supply Pods' },
  { href: '#earning', label: '6. Earning & Claiming' },
  { href: '#compounding', label: '7. Warehouse Levels' },
  { href: '#fees', label: '8. Fees' },
  { href: '#emission', label: '9. Why rewards can slow down' },
  { href: '#safety', label: '10. Safety & FAQ' },
];

const rarityLabel = (r: Rarity) => r.charAt(0).toUpperCase() + r.slice(1);

// Milestones are computed from the halving period rather than written out, so
// retuning the schedule cannot leave the guide quoting the old curve.
const emittedByDay = (day: number) => 1 - Math.pow(0.5, day / HALVING_PERIOD_DAYS);
const EMISSION_CURVE = `E(t) = ${GENESIS_RATE_PER_SEC.toFixed(1)} GPU/sec × 0.5 ^ (t / ${HALVING_PERIOD_DAYS}d)

Day ${String(0).padStart(3)}  : ${DAY_ONE_EMISSION_LABEL} GPU emitted
${[1, 2, 4].
  map((c) => {
    const day = Math.round(c * HALVING_PERIOD_DAYS);
    return `Day ${String(day).padStart(3)}  : ${Math.round(emittedByDay(day) * 100)}% of lifetime emitted`;
  })
  .join('\n')}
Lifetime total: ${LIFETIME_EMISSION_LABEL} GPU — the whole Emission Reserve,
${RESERVE_PCT_LABEL} of the ${SUPPLY_LABEL} fixed supply`;

const USER_RATE = `user_rate = min(your_gp / network_gp, 30%) × E(t) × welcome_boost

Two key mechanics:
  • Share cap: no user can capture more than 30% of emission
    (prevents lottery-in-thin-network wins)
  • Welcome boost: new users get 8× multiplier for 72h,
    linearly decaying — critical for latecomer retention`;

const FAQ: Array<{ q: string; a: React.ReactNode }> = [
  {
    q: 'Is GPU a financial product or investment?',
    a: (
      <p>
        No. GPU is an on-chain game. Rewards are not guaranteed — they depend on the halving
        emission schedule, reserve health, and the GPU token&rsquo;s market value. Treat any token
        interaction as risk capital.
      </p>
    ),
  },
  {
    q: 'Can I lose my nodes?',
    a: (
      <p>
        Nodes don&rsquo;t disappear. What can happen: if the protocol is paused by admin, or if the
        halving curve has fully decayed (past day ~{EMISSION_TAIL_DAY}), accrual rates become very
        small or zero. The
        nodes themselves stay in your wallet permanently — they just stop earning meaningful yield
        as the halving tail approaches zero.
      </p>
    ),
  },
  {
    q: 'What if I lose access to my wallet?',
    a: (
      <p>
        GPU cannot recover wallet access. Protect your seed phrase. If you switch wallets, your
        nodes stay with the original wallet — there&rsquo;s no transfer or migration feature in v1.
      </p>
    ),
  },
  {
    q: 'Where does the reward money come from?',
    a: (
      <p>
        GPU launches on Flap: the full <strong className="text-white">{SUPPLY_LABEL}</strong> supply
        is minted to the bonding curve and the contract has no mint function, so no new GPU can ever
        be created. Of that, <strong className="text-white">{EMISSION_RESERVE_LABEL} GPU</strong> (
        {RESERVE_PCT_LABEL}) is acquired at genesis and held as the Emission Reserve, which funds
        every reward the protocol will ever pay. The other {PUBLIC_FLOAT_LABEL} ({FLOAT_PCT_LABEL})
        is public float. Each second, the halving curve determines how much GPU flows out to users
        proportional to their grow-power share, and the reserve split on in-game spends recycles GPU
        back into the pool. Protocol ETH revenue (ERC-20 transfer tax (2%)
        + DEX LP fees (2%)) goes to a separate treasury and funds infrastructure/ops, not user
        rewards. The{' '}
        <Link href="/app/vault" className="text-amber-500 hover:underline">
          Vault
        </Link>{' '}
        page shows the protocol&rsquo;s live ledger — reserve balances, burns, and treasury events;
        on-chain verification of the reserve wallet lands with real-mode launch.
      </p>
    ),
  },
  {
    q: 'How many nodes can I own?',
    a: (
      <p>
        It scales with your Warehouse Level: 2 per family at L1 up to 8 per family at L10.
        Cleanrooms add bonus slots on top (+2 at L5, +3 at L7, +4 at L9), so a maxed wallet can run 8
        fabs and 12 cleanrooms. The caps keep the 3D scene readable and prevent farming rewards with an
        unbounded number of bare nodes.
      </p>
    ),
  },
  {
    q: 'What happens at Compound L10?',
    a: (
      <p>
        L10 is the current max. From there, output growth comes from better components — higher
        rarity pools, pity protection on the top tiers, and keeping durability fresh. The prestige
        black-and-gold finish stays.
      </p>
    ),
  },
  {
    q: 'Is my data safe?',
    a: (
      <p>
        GPU reads wallet addresses only — no email, no KYC. Your game state (nodes, components,
        pending rewards) lives on GPU servers keyed to your wallet; token balances, burns, and claim
        payouts settle on Robinhood Chain to your wallet.
      </p>
    ),
  },
];

export default function DocsPage() {
  return (
    <PageShell
      title="Fab Manual"
      subtitle="Field procedures for commissioning lines, tuning equipment, and navigating the GPU network."
      maxWidth="max-w-4xl"
    >
      <div className="space-y-10">
        {/* Contents */}
        <nav className="panel p-4">
          <p className="stat-label mb-2">Contents</p>
          <ul className="grid gap-1 text-sm sm:grid-cols-2">
            {CONTENTS.map(({ href, label }) => (
              <li key={href}>
                <a href={href} className="text-steel-300 transition hover:text-amber-500">
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {/* New visual system */}
        <section id="trailer" className="scroll-mt-20 space-y-3">
          <h2 className="font-mono text-xs font-bold uppercase tracking-widest text-amber-500">
            New fab art direction
          </h2>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {[
              ['Lithography', '/assets/fab/lithography-machine-reference.png'],
              ['Wafer Stack', '/assets/fab/wafer-stack-reference.png'],
              ['Dicing Saw', '/assets/fab/dicing-saw-reference.png'],
              ['Packaging', '/assets/fab/packaging-line-reference.png'],
            ].map(([label, src]) => (
              <figure key={label} className="panel overflow-hidden p-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt={`${label} reference render`} className="aspect-square w-full object-cover" />
                <figcaption className="px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-amber-300">{label}</figcaption>
              </figure>
            ))}
          </div>
          <p className="text-sm leading-relaxed text-steel-400">
            Rounded cleanroom machinery, toy-like proportions, and readable color-coded subsystems
            keep the campus playful while every model remains procedural and animation-ready.
          </p>
        </section>

        {/* 1. What is GPU? */}
        <Section id="overview" title="1. What is GPU?">
          <p>
            <strong className="text-white">Graphics Processing Utility (GPU)</strong> is a gamified,
            virtual silicon-farming game on Robinhood Chain — an EVM L2 settling on Ethereum. You
            burn{' '}
            <strong className="text-white">$GPU</strong> tokens to deploy virtual{' '}
            <strong className="text-white">Wafer Fabs</strong> and{' '}
            <strong className="text-white">Cleanrooms</strong> in your own 3D warehouse. Those
            facilities produce rewards over time, paid out from a {EMISSION_RESERVE_LABEL} $GPU
            Emission Reserve released via a Bitcoin-style halving curve.
          </p>
          <p>
            Think of it like an incremental game where every action is on-chain: your fabs and
            cleanrooms are real state, your burns reduce the $GPU supply, and your rewards settle to
            your wallet.
          </p>
          <p>
            Both <strong className="text-white">Wafer Fabs</strong> and{' '}
            <strong className="text-white">Cleanrooms</strong> accrue{' '}
            <strong className="text-white">$GPU</strong> per second. Progression is wallet-wide: you
            raise your <strong className="text-white">Warehouse Level</strong> to unlock more facility
            slots, more daily supply pods, and higher rarity pools. Cleanrooms earn bonus slots
            at higher levels; Wafer Fabs are claim-only in v1.
          </p>
        </Section>

        {/* 2. Quick start */}
        <Section id="quickstart" title="2. Quick start">
          <ol className="space-y-4">
            <Step n={1} title="Connect a wallet">
              Open the{' '}
              <Link href="/app" className="text-amber-500 hover:underline">
                Fab Floor
              </Link>{' '}
              and sign in with email or Google to create a Privy embedded EVM wallet. You can also
              link MetaMask, Rabby, or Robinhood Wallet. Unauthenticated guest addresses are not
              supported because they cannot securely authorize transactions.
            </Step>
            <Step n={2} title="Deploy your first facility">
              Tap <strong className="text-white">Deploy</strong>. Pick a Wafer Fab or Cleanroom,
              burn the required $GPU + small ETH fee, and it appears in your warehouse.
            </Step>
            <Step n={3} title="Let it produce">
              Nodes accrue rewards every second based on your components&rsquo; grow-power and your
              share of the global halving emission. Watch{' '}
              <strong className="text-white">pending rewards</strong> tick up in your HUD.
            </Step>
            <Step n={4} title="Claim, open supply pods, upgrade">
              Claim to cash out (2% fee, 1h cooldown), open Supply Pods to upgrade your
              components, or upgrade your warehouse to unlock more facilities and pods. Repeat.
            </Step>
          </ol>
        </Section>

        {/* 3. Nodes */}
        <Section id="nodes" title="3. Nodes: Fabs vs Cleanrooms">
          <p>
            Node capacity scales with your <strong className="text-white">Warehouse Level</strong>: 2
            per family at L1, growing to <strong className="text-white">8 per family</strong> at L10
            — and Cleanrooms add bonus slots on top (+2 at L5, +3 at L7, +4 at L9). Each node is
            an independent entity with its own components and production rate.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            <NodeCard
              accent="#ffb347"
              title="Wafer Fab"
              tagline="Front-end silicon production with lithography and wafer handling."
              bullets={[
                <>
                  Earns <strong className="text-white">$GPU</strong> via the halving emission
                </>,
                <>Funded by the {EMISSION_RESERVE_LABEL} GPU Emission Reserve</>,
                <>
                  <strong className="text-white">Claim-only</strong> in v1 — direct compounding is a
                  Cleanroom feature
                </>,
                <>Slots: Lithography Machine, Wafer Stack, Etch Chamber, Power Bus</>,
              ]}
            />
            <NodeCard
              accent="#d4d8de"
              title="Cleanroom"
              tagline="Back-end dicing, testing, cooling, and chip packaging."
              bullets={[
                <>
                  Earns <strong className="text-white">$GPU</strong>
                </>,
                <>Funded by the GPU reserve wallet</>,
                <>
                  <strong className="text-white">Bonus facility slots</strong> at Warehouse L5/L7/L9
                  (+2/+3/+4 cleanrooms)
                </>,
                <>Slots: Dicing Saw, Packaging Line, Test Handler, Cooling Array</>,
              ]}
            />
          </div>
        </Section>

        {/* 4. Levels & Auras */}
        <Section id="levels" title="4. Levels & Auras">
          <p>
            Your nodes&rsquo; visual level mirrors your wallet&rsquo;s{' '}
            <strong className="text-white">Warehouse Level (L1 → L10)</strong>. Each level upgrades
            the fab&rsquo;s <strong className="text-white">material era</strong> — rough steel
            through reinforced and high-tech to a black-and-gold prestige finish — and grows its
            size, making progress visible at a glance on the compound.
          </p>
          <p>
            Production itself comes from your components, not the visual level:{' '}
            <code className="rounded bg-ink-700 px-1 font-mono text-xs text-amber-500">
              your rate = min(your GP / network GP, 30%) × E(t) × welcome boost
            </code>{' '}
            — where GP (grow-power) is the Formula D multiplier of your installed components.
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {Object.entries(AURA_TIERS).map(([lvl, tier]) => (
              <div key={lvl} className="panel flex flex-col items-center gap-1 p-3">
                <span
                  className="font-mono text-lg font-bold"
                  style={{ color: tier.color, textShadow: `0 0 12px ${tier.color}66` }}
                >
                  L{lvl}
                </span>
                <span
                  className="h-2 w-full rounded-full"
                  style={{ background: tier.color, boxShadow: `0 0 8px ${tier.color}88` }}
                />
                <span className="font-mono text-[10px] uppercase tracking-widest text-steel-400">
                  {tier.label}
                </span>
              </div>
            ))}
          </div>
          <p>
            Higher levels also pump up the scene&rsquo;s bloom intensity — a max-level compound
            looks visibly brighter than a fresh one.
          </p>
          <InteractiveModelExplorer />
          <p className="text-xs text-steel-500">
            Higher levels upgrade the fab&rsquo;s material era (rough steel → reinforced → high-tech
            → black-and-gold prestige), grow its size, and light a powered deck ring at the
            milestone levels. The per-component rarity glow layers on top.
          </p>
        </Section>

        {/* 5. Components & Supply Pods */}
        <Section id="components" title="5. Components & Supply Pods">
          <p>
            Each node has <strong className="text-white">4 component slots</strong>. Components are
            earned by opening <strong className="text-white">Supply Pods</strong> —{' '}
            <strong className="text-white">{CRATE_OPEN_OSR.toLocaleString()} $GPU</strong> each (split
            burn / reserve / treasury), plus a flat{' '}
            {CRATE_FEE_ETH} ETH protocol fee. Your daily crate limit scales with Warehouse Level — from 3/day
            at L1 up to 20/day at L10, per node type. Every drop has a rarity tier that multiplies
            the node&rsquo;s output:
          </p>
          <div className="panel overflow-x-auto">
            <table className="w-full whitespace-nowrap text-left text-sm">
              <thead>
                <tr className="border-b border-ink-600">
                  <th className="stat-label px-4 py-3 font-normal">Rarity</th>
                  <th className="stat-label px-4 py-3 text-right font-normal">Multiplier</th>
                  <th className="stat-label px-4 py-3 text-right font-normal">Visual</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-600/60">
                {RARITIES.map((r) => (
                  <tr key={r}>
                    <td
                      className="px-4 py-2.5 font-mono text-xs font-bold uppercase tracking-widest"
                      style={{ color: rarityHex(r) }}
                    >
                      {rarityLabel(r)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-white">
                      {RARITY_MULT[r].toLocaleString()}×
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className="ml-auto block h-3 w-3 rounded-full"
                        style={{
                          background: rarityHex(r),
                          boxShadow: `0 0 8px ${rarityHex(r)}aa`,
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            A node&rsquo;s total multiplier uses <strong className="text-white">Formula D</strong>:
            the average of its 4 slots&rsquo; durability-adjusted multipliers, raised to the power
            0.75 (capped at 500×), then multiplied by a rarity-boost stack (Epic ×1.05, Legendary
            ×1.15, Mythic ×1.4, Divine ×2.0 per component). Empty slots count as Common. Higher
            rarity pools unlock with Warehouse Level: Legendary at L4, Mythic at L6, Divine at L8.
            Drop odds are published and a bad-luck-protection (pity) system guarantees dry streaks
            on the top tiers can&rsquo;t run forever.
          </p>
          <p>
            <strong className="text-white">Slot compatibility:</strong> Wafer Fab components fit only
            in Wafer Fabs, Cleanroom components fit only in Cleanrooms. Each component has a specific
            slot (you can&rsquo;t put a Lithography Machine in a Wafer Stack socket).
          </p>
          <p>
            Use the{' '}
            <Link href="/app/inventory" className="text-amber-500 hover:underline">
              Inventory
            </Link>{' '}
            page to move components between nodes — unequip from one, equip on another. The
            displaced component falls back to your locker.
          </p>

          {/* Gallery */}
          <div>
            <p className="stat-label mb-3">Every slot, every rarity</p>
            <div className="space-y-6">
              {(
                [
                  { family: 'oil' as const, title: 'Wafer Fab slots', accent: '#ffb347' },
                  { family: 'mine' as const, title: 'Cleanroom slots', accent: '#c8e0f0' },
                ] as const
              ).map(({ family, title, accent }) => (
                <div key={family} className="panel overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-ink-600">
                        <th
                          className="whitespace-nowrap px-3 py-3 font-mono text-[11px] font-bold uppercase tracking-widest"
                          style={{ color: accent }}
                        >
                          {title}
                        </th>
                        {RARITIES.map((r) => (
                          <th key={r} className="px-2 py-3 text-center">
                            <span
                              className="block font-mono text-[10px] font-bold uppercase tracking-wider"
                              style={{ color: rarityHex(r) }}
                            >
                              {rarityLabel(r)}
                            </span>
                            <span className="block font-mono text-[9px] text-steel-500">
                              {RARITY_MULT[r].toFixed(2)}×
                            </span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-600/60">
                      {NODE_SLOTS[family].map((slot) => (
                        <tr key={slot}>
                          <td className="whitespace-nowrap px-3 py-2 text-xs text-steel-300">
                            {SLOT_LABELS[slot]}
                          </td>
                          {RARITIES.map((r) => (
                            <td key={r} className="px-2 py-2">
                              <div className="mx-auto flex h-16 w-16 items-center justify-center">
                                <ComponentTile slot={slot} rarity={r} size={56} />
                              </div>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-steel-500">
              Each tile shows that slot at that rarity — rarer tiers add emissive glow that blooms
              in the scene. The live fab preview above shows the hero model these install into.
            </p>
          </div>
        </Section>

        {/* 6. Earning & Claiming */}
        <Section id="earning" title="6. Earning & Claiming">
          <p>
            Rewards accrue <strong className="text-white">continuously, per second</strong>, based
            on:
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Your <strong className="text-white">grow-power</strong> (Formula D multiplier summed
              across your nodes&rsquo; components)
            </li>
            <li>
              Your <strong className="text-white">share of total network grow-power</strong> —
              capped at 30% per user
            </li>
            <li>
              The global <strong className="text-white">halving emission rate</strong> E(t) (see
              section 9)
            </li>
            <li>
              Your <strong className="text-white">welcome boost</strong> (8× → 1× over your first 72
              hours)
            </li>
          </ul>
          <p>
            Pending rewards are kept server-side and streamed to your HUD every ~10s. When you{' '}
            <strong className="text-white">Claim All</strong>, every node&rsquo;s pending balance is
            zeroed and the reserve wallet pays out the net amount to your wallet (2% fee retained in
            the reserve to keep emissions solvent). Claims have a{' '}
            <strong className="text-white">1-hour cooldown</strong> per wallet.
          </p>
          <p>
            Crate installs and warehouse upgrades internally accrue first, so you never lose
            production between actions — you&rsquo;re always paid at the rate you actually had for
            the time you had it.
          </p>
        </Section>

        {/* 7. Warehouse Levels */}
        <Section id="compounding" title="7. Warehouse Levels">
          <p>
            Your <strong className="text-white">Warehouse Level</strong> (L1 → L10) is your
            wallet-wide progression track. Each upgrade costs $GPU — from{' '}
            <strong className="text-white">1,000 GPU</strong> for L2 up to{' '}
            <strong className="text-white">120,000 GPU</strong> for L10, split 50/30/20 burn /
            reserve / treasury — plus a flat {COMPOUND_FEE_ETH} ETH fee. Each level unlocks:
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              More <strong className="text-white">node slots</strong> per family (2 at L1 → 8 at
              L10; cleanrooms +2/+3/+4 bonus at L5/L7/L9)
            </li>
            <li>
              A higher <strong className="text-white">daily crate limit</strong> (3/day at L1 →
              20/day at L10, per node type)
            </li>
            <li>
              Higher <strong className="text-white">rarity pools</strong> (Legendary at L4, Mythic
              at L6, Divine at L8)
            </li>
          </ul>
          <p>
            Upgrades have a <strong className="text-white">12-hour cooldown</strong>. In a hurry,
            you can <strong className="text-white">expedite</strong>: pay {EXPEDITE_FEE_ETH} ETH to
            skip the cooldown for one upgrade (the fee goes to the treasury).
          </p>
          <p>
            See the full level table on the{' '}
            <Link href="/app/tokenomics" className="text-amber-500 hover:underline">
              Tokenomics
            </Link>{' '}
            page.
          </p>
        </Section>

        {/* 8. Fees */}
        <Section id="fees" title="8. Fees">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <FeeCard label="Mint burn" value="70%" caption="of GPU cost to burn wallet" />
            <FeeCard label="Mint treasury" value="30%" caption="of GPU cost to treasury" />
            <FeeCard label="Mint ETH fee" value={`${MINT_FEE_ETH} ETH`} caption="flat, per mint" />
            <FeeCard label="Claim fee" value="2%" caption="retained in reserve · 1h cooldown" />
            <FeeCard
              label="Warehouse upgrade"
              value="1k → 120k GPU"
              caption={`L2→L10 · +${COMPOUND_FEE_ETH} ETH · 12h cooldown`}
            />
            <FeeCard
              label="Expedite"
              value={`${EXPEDITE_FEE_ETH} ETH`}
              caption="skip the compound cooldown"
            />
            <FeeCard
              label="Crate cost"
              value={`${CRATE_OPEN_OSR.toLocaleString()} GPU`}
              caption={`flat, per pod · +${CRATE_FEE_ETH} ETH fee`}
            />
            <FeeCard
              label="Upgrade & crate split"
              value="50/30/20"
              caption="burn / reserve / treasury"
            />
          </div>
          <p className="text-xs text-steel-500">
            Mints split 70/30 burn/treasury on the GPU leg; warehouse upgrades and crates split
            50/30/20 burn/reserve/treasury. See{' '}
            <Link href="/app/tokenomics" className="text-amber-500 hover:underline">
              Tokenomics
            </Link>{' '}
            for the live numbers straight from the backend.
          </p>
        </Section>

        {/* 9. Emission */}
        <Section id="emission" title="9. How emission works">
          <p>
            GPU uses a <strong className="text-white">halving emission curve</strong>. Global GPU
            issuance starts at{' '}
            <strong className="text-white">{GENESIS_RATE_PER_SEC.toFixed(1)} GPU/sec</strong> at
            genesis and halves every <strong className="text-white">{HALVING_PERIOD_LABEL}</strong>{' '}
            until the
            Emission Reserve is fully paid out.
          </p>
          <div className="panel overflow-x-auto p-4">
            <pre className="font-mono text-[11px] leading-relaxed text-steel-300">
              {EMISSION_CURVE}
            </pre>
          </div>
          <p>
            Each user earns a share of each second&rsquo;s emission, proportional to their{' '}
            <strong className="text-white">grow-power</strong> (sum of component multipliers across
            their nodes):
          </p>
          <div className="panel overflow-x-auto p-4">
            <pre className="font-mono text-[11px] leading-relaxed text-steel-300">{USER_RATE}</pre>
          </div>
          <p>
            <strong className="text-white">Why does emission halve?</strong> To front-load
            excitement during the first 2 weeks while still leaving meaningful yields for
            latecomers. By day 14, 75% of lifetime GPU has been distributed — but latecomers with
            the welcome boost still earn well for their first 72 hours.
          </p>
          <p>
            You can always see current global emission and your share on the{' '}
            <Link href="/app/vault" className="text-amber-500 hover:underline">
              Treasury Core
            </Link>{' '}
            page — it&rsquo;s fully public.
          </p>
        </Section>

        {/* 10. Safety & FAQ */}
        <Section id="safety" title="10. Safety & FAQ">
          <div className="space-y-2">
            {FAQ.map(({ q, a }) => (
              <details key={q} className="panel group p-0">
                <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-steel-200 transition hover:text-amber-500">
                  {q}
                </summary>
                <div className="border-t border-ink-600/60 px-4 py-3 text-sm leading-relaxed text-steel-300">
                  {a}
                </div>
              </details>
            ))}
          </div>
        </Section>

        {/* Footer */}
        <footer className="space-y-2 border-t border-ink-600 pt-4 text-xs text-steel-500">
          <p>
            <strong className="text-steel-300">Continue through the fab OS:</strong>{' '}
            <Link href="/app/tokenomics" className="text-amber-500 hover:underline">
              GPU Network Model
            </Link>{' '}
            has live numbers and formulas,{' '}
            <Link href="/app/vault" className="text-amber-500 hover:underline">
              Treasury Core
            </Link>{' '}
            shows the raw treasury flow,{' '}
            <Link href="/app/leaderboard" className="text-amber-500 hover:underline">
              Silicon Race
            </Link>{' '}
            ranks operators by max level, sum of levels, and total production.
          </p>
          <p>
            This guide describes current behavior. Mechanics may change as the protocol evolves —
            we&rsquo;ll update this page first when they do.
          </p>
        </footer>
      </div>
    </PageShell>
  );
}

function InteractiveModelExplorer() {
  const [family, setFamily] = useState<NodeFamily>('oil');
  const [rarity, setRarity] = useState<Rarity>('common');
  const [level, setLevel] = useState(1);
  const components = NODE_SLOTS[family].map((slot) => ({ slot, rarity }));

  return (
    <div className="overflow-hidden rounded-lg border border-steel-500/40 bg-ink-800/60">
      <div className="flex flex-wrap items-end gap-3 border-b border-ink-600 p-3">
        <div>
          <label className="stat-label block" htmlFor="model-family">
            Family
          </label>
          <select
            id="model-family"
            className="mt-1 rounded border border-ink-600 bg-ink-900 px-3 py-2 text-sm text-white"
            value={family}
            onChange={(event) => setFamily(event.target.value as NodeFamily)}
          >
            <option value="oil">Wafer Fab</option>
            <option value="mine">Cleanroom</option>
          </select>
        </div>
        <div>
          <label className="stat-label block" htmlFor="model-rarity">
            Component rarity
          </label>
          <select
            id="model-rarity"
            className="mt-1 rounded border border-ink-600 bg-ink-900 px-3 py-2 text-sm text-white"
            value={rarity}
            onChange={(event) => setRarity(event.target.value as Rarity)}
          >
            {RARITIES.map((item) => (
              <option key={item} value={item}>
                {rarityLabel(item)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="stat-label block" htmlFor="model-level">
            Node level
          </label>
          <select
            id="model-level"
            className="mt-1 rounded border border-ink-600 bg-ink-900 px-3 py-2 text-sm text-white"
            value={level}
            onChange={(event) => setLevel(Number(event.target.value))}
          >
            {Array.from({ length: 10 }, (_, index) => index + 1).map((item) => (
              <option key={item} value={item}>
                Level {item}
              </option>
            ))}
          </select>
        </div>
        <p className="ml-auto text-xs text-steel-500">
          Procedural Three.js sculpt · animation-ready hierarchy · 7 material tiers
        </p>
      </div>
      <NodePreview
        className="h-[360px] rounded-none border-0"
        node={{ id: 'guide-preview', type: family, level, isActive: true, components }}
      />
    </div>
  );
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20 space-y-4 text-sm leading-relaxed text-steel-300">
      <h2 className="font-mono text-xs font-bold uppercase tracking-widest text-amber-500">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-500 font-mono text-sm font-bold text-ink-900">
        {n}
      </span>
      <div>
        <p className="font-semibold text-white">{title}</p>
        <p className="mt-0.5 text-steel-300">{children}</p>
      </div>
    </li>
  );
}

function NodeCard({
  accent,
  title,
  tagline,
  bullets,
}: {
  accent: string;
  title: string;
  tagline: string;
  bullets: React.ReactNode[];
}) {
  return (
    <div className="panel p-4" style={{ borderColor: `${accent}55` }}>
      <h3
        className="font-mono text-sm font-bold uppercase tracking-widest"
        style={{ color: accent }}
      >
        {title}
      </h3>
      <p className="mt-1 text-xs text-steel-400">{tagline}</p>
      <ul className="mt-3 space-y-1.5 text-sm text-steel-300">
        {bullets.map((b, i) => (
          <li key={i} className="flex gap-2">
            <span style={{ color: accent }}>›</span>
            <span>{b}</span>
          </li>
        ))}
      </ul>
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
