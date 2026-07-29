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
import { AURA_BANDS, auraRange } from '@/lib/aura';
import {
  COMPOUND_FEE_ETH,
  CRATE_FEE_ETH,
  CRATE_OPEN_BNTY,
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
  { href: '#overview', label: '1. What is Greenwood?' },
  { href: '#quickstart', label: '2. Quick start' },
  { href: '#nodes', label: '3. Desks: Equity vs Treasury' },
  { href: '#levels', label: '4. Desk Grades' },
  { href: '#components', label: '5. Instruments & Allocations' },
  { href: '#earning', label: '6. Earning & Claiming' },
  { href: '#compounding', label: '7. Portfolio Levels' },
  { href: '#outside', label: '8. Going outside' },
  { href: '#woodcutting', label: '9. Woodcutting & crafting' },
  { href: '#fees', label: '10. Fees' },
  { href: '#emission', label: '11. Why rewards can slow down' },
  { href: '#safety', label: '12. Safety & FAQ' },
];

const rarityLabel = (r: Rarity) => r.charAt(0).toUpperCase() + r.slice(1);

/**
 * The wood ladder, as a player meets it.
 *
 * Written out rather than derived from lib/woodcutting, because "where" is
 * guidance rather than data — the species table knows tiers and respawn times,
 * not which region is worth the walk. Tier and order are the parts that must
 * not drift, and woodcutting.test already pins those.
 */
const WOOD_LADDER: Array<{ name: string; tier: number; where: string }> = [
  { name: 'Pine', tier: 1, where: 'Everywhere' },
  { name: 'Birch', tier: 1, where: 'Everywhere' },
  { name: 'Oak', tier: 2, where: 'Grounds, Treeline' },
  { name: 'Black Pine', tier: 3, where: 'Treeline' },
  { name: 'Ironbark', tier: 4, where: 'Deep Forest only' },
];

// Milestones are computed from the halving period rather than written out, so
// retuning the schedule cannot leave the guide quoting the old curve.
const emittedByDay = (day: number) => 1 - Math.pow(0.5, day / HALVING_PERIOD_DAYS);
const EMISSION_CURVE = `E(t) = ${GENESIS_RATE_PER_SEC.toFixed(1)} BNTY/sec × 0.5 ^ (t / ${HALVING_PERIOD_DAYS}d)

Day ${String(0).padStart(3)}  : ${DAY_ONE_EMISSION_LABEL} BNTY emitted
${[1, 2, 4].
  map((c) => {
    const day = Math.round(c * HALVING_PERIOD_DAYS);
    return `Day ${String(day).padStart(3)}  : ${Math.round(emittedByDay(day) * 100)}% of lifetime emitted`;
  })
  .join('\n')}
Lifetime total: ${LIFETIME_EMISSION_LABEL} BNTY — the whole Emission Reserve,
${RESERVE_PCT_LABEL} of the ${SUPPLY_LABEL} fixed supply`;

const USER_RATE = `user_rate = min(your_gp / network_gp, 30%) × E(t) × welcome_boost

Two key mechanics:
  • Share cap: no user can capture more than 30% of emission
    (prevents lottery-in-thin-network wins)
  • Welcome boost: new users get 8× multiplier for 72h,
    linearly decaying — critical for latecomer retention`;

const FAQ: Array<{ q: string; a: React.ReactNode }> = [
  {
    q: 'Is BNTY a financial product or investment?',
    a: (
      <p>
        No. Greenwood is an on-chain game. Rewards are not guaranteed — they depend on the halving
        emission schedule, reserve health, and the BNTY token&rsquo;s market value. Nothing here is
        investment advice; treat any token interaction as risk capital.
      </p>
    ),
  },
  {
    q: 'Can I lose my desks?',
    a: (
      <p>
        Desks don&rsquo;t disappear. What can happen: if the protocol is paused by admin, or if the
        halving curve has fully decayed (past day ~{EMISSION_TAIL_DAY}), accrual rates become very
        small or zero. The
        desks themselves stay in your wallet permanently — they just stop earning meaningful yield
        as the halving tail approaches zero.
      </p>
    ),
  },
  {
    q: 'What if I lose access to my wallet?',
    a: (
      <p>
        Greenwood cannot recover wallet access. Protect your seed phrase. If you switch wallets, your
        desks stay with the original wallet — there&rsquo;s no transfer or migration feature in v1.
      </p>
    ),
  },
  {
    q: 'Where does the reward money come from?',
    a: (
      <p>
        BNTY launches on Flap: the full <strong className="text-white">{SUPPLY_LABEL}</strong> supply
        is minted to the bonding curve and the contract has no mint function, so no new BNTY can ever
        be created. Of that, <strong className="text-white">{EMISSION_RESERVE_LABEL} BNTY</strong> (
        {RESERVE_PCT_LABEL}) is acquired at genesis and held as the Emission Reserve, which funds
        every reward the protocol will ever pay. The other {PUBLIC_FLOAT_LABEL} ({FLOAT_PCT_LABEL})
        is public float. Each second, the halving curve determines how much BNTY flows out to users
        proportional to their yield power share, and the reserve split on in-game spends recycles BNTY
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
    q: 'How many desks can I own?',
    a: (
      <p>
        It scales with your Portfolio Level: 2 per family at L1 up to 8 per family at L10.
        Treasury Desks add bonus slots on top (+2 at L5, +3 at L7, +4 at L9), so a maxed wallet can
        run 8 Equity Desks and 12 Treasury Desks. The caps keep the Machine Room walkable and stop
        anyone farming rewards with an unbounded number of bare desks.
      </p>
    ),
  },
  {
    q: 'What happens at Portfolio L10?',
    a: (
      <p>
        L10 is the current max for Portfolio Level, but it is not the end of the game. Individual
        desks keep levelling past it, yield growth comes from better instruments — higher rarity
        pools and pity protection on the top tiers — and the Deep Forest opens at Total Level 10,
        which is where the rest of it is.
      </p>
    ),
  },
  {
    q: 'Is my data safe?',
    a: (
      <p>
        Greenwood reads wallet addresses only — no email, no KYC. Your game state (desks, instruments,
        pending rewards) lives on Greenwood servers keyed to your wallet; token balances, burns, and claim
        payouts settle on Robinhood Chain to your wallet.
      </p>
    ),
  },
];

export default function DocsPage() {
  return (
    <PageShell
      title="Handbook"
      subtitle="Field procedures for opening desks, tuning instruments, and navigating the Greenwood network."
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

        {/* 1. What is BNTY? */}
        <Section id="overview" title="1. What is Greenwood?">
          <p>
            <strong className="text-white">Greenwood — Real-World Yield</strong> is a gamified,
            virtual real-world-asset (RWA) yield game on Robinhood Chain — an EVM L2 settling on Ethereum. You
            burn{' '}
            <strong className="text-white">$BNTY</strong> tokens to open virtual{' '}
            <strong className="text-white">Equity Desks</strong> and{' '}
            <strong className="text-white">Treasury Desks</strong> on a Machine Room floor you walk
            around. Those desks earn rewards over time, paid out from a {EMISSION_RESERVE_LABEL}{' '}
            $BNTY Emission Reserve released via a Bitcoin-style halving curve. Beyond the floor
            there is a settlement, and beyond that a treeline.
          </p>
          <p>
            Think of it like an incremental game where every action is on-chain: your Equity and
            Treasury Desks are real state, your burns reduce the $BNTY supply, and your rewards settle to
            your wallet.
          </p>
          <p>
            Both <strong className="text-white">Equity Desks</strong> and{' '}
            <strong className="text-white">Treasury Desks</strong> accrue{' '}
            <strong className="text-white">$BNTY</strong> per second. Progression is wallet-wide: you
            raise your <strong className="text-white">Portfolio Level</strong> to unlock more desk
            slots, more daily allocations, and higher rarity pools. Treasury Desks earn bonus slots
            at higher levels; Equity Desks are claim-only in v1.
          </p>
        </Section>

        {/* 2. Quick start */}
        <Section id="quickstart" title="2. Quick start">
          <ol className="space-y-4">
            <Step n={1} title="Connect a wallet">
              Open the{' '}
              <Link href="/app" className="text-amber-500 hover:underline">
                Trading Floor
              </Link>{' '}
              and sign in with email or Google to create a Privy embedded EVM wallet. You can also
              link MetaMask, Rabby, or Robinhood Wallet. Unauthenticated guest addresses are not
              supported because they cannot securely authorize transactions.
            </Step>
            <Step n={2} title="Open your first desk">
              Tap <strong className="text-white">Deploy</strong>. Pick an Equity or Treasury Desk,
              burn the required $BNTY + small ETH fee, and it appears in your portfolio.
            </Step>
            <Step n={3} title="Let it earn">
              Desks accrue rewards every second based on your instruments&rsquo; yield power and your
              share of the global halving emission. Watch{' '}
              <strong className="text-white">pending rewards</strong> tick up in your HUD.
            </Step>
            <Step n={4} title="Claim, open allocations, upgrade">
              Claim to cash out (2% fee, 1h cooldown), open allocations to upgrade your
              instruments, or upgrade your portfolio to unlock more desks and allocations. Repeat.
            </Step>
          </ol>
        </Section>

        {/* 3. Nodes */}
        <Section id="nodes" title="3. Desks: Equity vs Treasury">
          <p>
            Desk capacity scales with your <strong className="text-white">Portfolio Level</strong>: 2
            per family at L1, growing to <strong className="text-white">8 per family</strong> at L10
            — and Treasury Desks add bonus slots on top (+2 at L5, +3 at L7, +4 at L9). Each desk is
            an independent entity with its own instruments and yield rate.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            <NodeCard
              accent="#ffb347"
              title="Equity Desk"
              tagline="The higher-yielding desk family, and the one most instrument sets are built around."
              bullets={[
                <>
                  Earns <strong className="text-white">$BNTY</strong> via the halving emission
                </>,
                <>Funded by the {EMISSION_RESERVE_LABEL} BNTY Emission Reserve</>,
                <>
                  <strong className="text-white">Claim-only</strong> in v1 — direct reinvesting is a
                  Treasury Desk feature
                </>,
                <>Slots: Execution Terminal, Order Router, Market Data Feed, Settlement Rail</>,
              ]}
            />
            <NodeCard
              accent="#d4d8de"
              title="Treasury Desk"
              tagline="Tokenized Treasuries and bonds — steady, reinvestable fixed-income yield."
              bullets={[
                <>
                  Earns <strong className="text-white">$BNTY</strong>
                </>,
                <>Funded by the BNTY reserve wallet</>,
                <>
                  <strong className="text-white">Bonus desk slots</strong> at Portfolio L5/L7/L9
                  (+2/+3/+4 Treasury Desks)
                </>,
                <>Slots: Custody Module, Coupon Engine, Maturity Ladder, Liquidity Buffer</>,
              ]}
            />
          </div>
        </Section>

        {/* 4. Levels & Auras */}
        <Section id="levels" title="4. Desk Grades">
          <p>
            Every desk carries a <strong className="text-white">grade</strong> — a colour and a name
            for how far you have taken it. There are five, they band together ranges of desk levels
            rather than naming each one, and the top band is open-ended: a desk levelled past ten is
            still Benchmark, however far past.
          </p>
          <p>
            Grade is cosmetic. It is a fast read on a portfolio at a glance and nothing more — it
            does not change what a desk earns.
          </p>
          <p>
            Yield itself comes from your instruments, not the visual level:{' '}
            <code className="rounded bg-ink-700 px-1 font-mono text-xs text-amber-500">
              your rate = min(your GP / network GP, 30%) × E(t) × welcome boost
            </code>{' '}
            — where GP (yield power) is the Formula D multiplier of your installed instruments.
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {AURA_BANDS.map((band) => (
              <div key={band.label} className="panel flex flex-col items-center gap-1 p-3">
                <span
                  className="font-mono text-lg font-bold"
                  style={{ color: band.color, textShadow: `0 0 12px ${band.color}66` }}
                >
                  {auraRange(band)}
                </span>
                <span
                  className="h-2 w-full rounded-full"
                  style={{ background: band.color, boxShadow: `0 0 8px ${band.color}88` }}
                />
                <span className="font-mono text-[10px] uppercase tracking-widest text-steel-400">
                  {band.label}
                </span>
              </div>
            ))}
          </div>
          <InteractiveModelExplorer />
          <p className="text-xs text-steel-500">
            Grade sits alongside instrument rarity, which is a separate scale: rarity is what an
            instrument rolled when you opened it, grade is how far the desk holding it has been
            levelled.
          </p>
        </Section>

        {/* 5. Components & Supply Pods */}
        <Section id="components" title="5. Instruments & Allocations">
          <p>
            Each desk has <strong className="text-white">4 instrument slots</strong>. Instruments are
            earned by opening <strong className="text-white">Allocations</strong> —{' '}
            <strong className="text-white">{CRATE_OPEN_BNTY.toLocaleString()} $BNTY</strong> each (split
            burn / reserve / treasury), plus a flat{' '}
            {CRATE_FEE_ETH} ETH protocol fee. Your daily allocation limit scales with Portfolio Level — from 3/day
            at L1 up to 20/day at L10, per desk type. Every drop has a rarity tier that multiplies
            the desk&rsquo;s yield:
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
            A desk&rsquo;s total multiplier uses <strong className="text-white">Formula D</strong>:
            the average of its 4 slots&rsquo; durability-adjusted multipliers, raised to the power
            0.75 (capped at 500×), then multiplied by a rarity-boost stack (Epic ×1.05, Legendary
            ×1.15, Mythic ×1.4, Divine ×2.0 per instrument). Empty slots count as Common. Higher
            rarity pools unlock with Portfolio Level: Legendary at L4, Mythic at L6, Divine at L8.
            Drop odds are published and a bad-luck-protection (pity) system guarantees dry streaks
            on the top tiers can&rsquo;t run forever.
          </p>
          <p>
            <strong className="text-white">Slot compatibility:</strong> Equity Desk instruments fit only
            in Equity Desks, Treasury Desk instruments fit only in Treasury Desks. Each instrument has a specific
            slot (you can&rsquo;t put an Execution Terminal in an Order Router socket).
          </p>
          <p>
            Use the{' '}
            <Link href="/app/inventory" className="text-amber-500 hover:underline">
              Instruments
            </Link>{' '}
            page to move instruments between desks — unequip from one, equip on another. The
            displaced instrument falls back to your locker.
          </p>

          {/* Gallery */}
          <div>
            <p className="stat-label mb-3">Every slot, every rarity</p>
            <div className="space-y-6">
              {(
                [
                  { family: 'oil' as const, title: 'Equity Desk slots', accent: '#ffb347' },
                  { family: 'mine' as const, title: 'Treasury Desk slots', accent: '#c8e0f0' },
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
              Each tile shows that slot at that rarity. The live desk preview above shows the model
              these install into.
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
              Your <strong className="text-white">yield power</strong> (Formula D multiplier summed
              across your desks&rsquo; instruments)
            </li>
            <li>
              Your <strong className="text-white">share of total network yield power</strong> —
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
            <strong className="text-white">Claim All</strong>, every desk&rsquo;s pending balance is
            zeroed and the reserve wallet pays out the net amount to your wallet (2% fee retained in
            the reserve to keep emissions solvent). Claims have a{' '}
            <strong className="text-white">1-hour cooldown</strong> per wallet.
          </p>
          <p>
            Allocation opens and portfolio upgrades internally accrue first, so you never lose
            yield between actions — you&rsquo;re always paid at the rate you actually had for
            the time you had it.
          </p>
        </Section>

        {/* 7. Warehouse Levels */}
        <Section id="compounding" title="7. Portfolio Levels">
          <p>
            Your <strong className="text-white">Portfolio Level</strong> (L1 → L10) is your
            wallet-wide progression track. Each upgrade costs $BNTY — from{' '}
            <strong className="text-white">1,000 BNTY</strong> for L2 up to{' '}
            <strong className="text-white">120,000 BNTY</strong> for L10, split 50/30/20 burn /
            reserve / treasury — plus a flat {COMPOUND_FEE_ETH} ETH fee. Each level unlocks:
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              More <strong className="text-white">desk slots</strong> per family (2 at L1 → 8 at
              L10; Treasury Desks +2/+3/+4 bonus at L5/L7/L9)
            </li>
            <li>
              A higher <strong className="text-white">daily allocation limit</strong> (3/day at L1 →
              20/day at L10, per desk type)
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
              BNTY Model
            </Link>{' '}
            page.
          </p>
        </Section>

        {/*
          8 and 9 cover the half of the game the handbook did not mention at
          all: the world, woodcutting and crafting. Written in the fund's own
          register on purpose — this document is published BY Greenwood, so it
          calls the outdoors a site and the things living in it wildlife. What
          is actually out there is for the player to find, and a handbook that
          spoiled it would undo the pacing the whole design rests on.
        */}
        <Section id="outside" title="8. Going outside">
          <p>
            Greenwood is a place before it is a dashboard. Your desks sit in the{' '}
            <strong className="text-white">Machine Room</strong>; the{' '}
            <strong className="text-white">Trading Floor</strong> is where the stalls and the
            Outfitter are; and both are buildings on <strong className="text-white">Greenwood
            Grounds</strong>, which you walk around. There is no menu for travel — you walk to a
            door and through it.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <RegionCard
              name="Greenwood Grounds"
              gate="Open to everyone"
              body="The hub. Doors to the Machine Room, the Trading Floor, and the way north."
            />
            <RegionCard
              name="Greenwood HQ"
              gate="Total Level 3"
              body="The plaza and the tower. The most civilised address on the network, and the last one before the fence means anything."
            />
            <RegionCard
              name="The Treeline"
              gate="Total Level 6 · desk L3 · pack required"
              body="Managed woodland outside the fence. Site conditions apply: bring a pack, and expect wildlife."
              warn
            />
            <RegionCard
              name="The Deep Forest"
              gate="Total Level 10 · desk L8 · pack required"
              body="Unmanaged. Other operators are out there and may act against you. Reach an extraction gate to come back with what you are carrying."
              warn
            />
          </div>
          <p>
            The two gated regions ask for <strong className="text-white">two different things</strong>,
            and the difference is deliberate. Total Level measures how long you have played, and can
            be earned entirely by trading. Desk level measures whether you have actually built
            something. The outdoors wants both, because everyone out there should have something to
            lose.
          </p>
          <p className="text-xs text-steel-500">
            If you go down past the fence, your pack opens where you fell and anyone can take what
            was in it. Your desks, instruments and balance are never at risk — only what you chose
            to carry.
          </p>
        </Section>

        <Section id="woodcutting" title="9. Woodcutting & crafting">
          <p>
            Timber is the second economy. Buy an axe with{' '}
            <strong className="text-white">Scrip</strong> (earned in-game, not bought), fell trees,
            and take the logs to the <strong className="text-white">craft bench</strong> in the
            Machine Room. Everything on the bench is made from wood you cut yourself.
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {WOOD_LADDER.map((w) => (
              <div key={w.name} className="panel flex flex-col items-center gap-1 p-3">
                <span className="font-mono text-[10px] uppercase tracking-widest text-steel-500">
                  T{w.tier}
                </span>
                <strong className="text-sm text-white">{w.name}</strong>
                <span className="text-center font-mono text-[10px] text-steel-400">{w.where}</span>
              </div>
            ))}
          </div>
          <p>
            Your axe decides how far up that ladder you get, and each axe is cut from wood the
            previous one could fell — so you climb it or you buy your way up it. A Hatchet takes
            pine and birch and will bounce off everything else; that is the axe, not you.
          </p>
          <p className="text-xs text-steel-500">
            The bench makes axes, crossbows, bolts, and{' '}
            <strong className="text-white">Desk Frames</strong>. From desk level 5 an upgrade needs
            frames as well as BNTY — one per four levels, rounded up — so it is worth cutting timber
            before you need it rather than after.
          </p>
        </Section>

        {/* 10. Fees */}
        <Section id="fees" title="10. Fees">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <FeeCard label="Mint burn" value="70%" caption="of BNTY cost to burn wallet" />
            <FeeCard label="Mint treasury" value="30%" caption="of BNTY cost to treasury" />
            <FeeCard label="Mint ETH fee" value={`${MINT_FEE_ETH} ETH`} caption="flat, per mint" />
            <FeeCard label="Claim fee" value="2%" caption="retained in reserve · 1h cooldown" />
            <FeeCard
              label="Portfolio upgrade"
              value="1k → 120k BNTY"
              caption={`L2→L10 · +${COMPOUND_FEE_ETH} ETH · 12h cooldown`}
            />
            <FeeCard
              label="Expedite"
              value={`${EXPEDITE_FEE_ETH} ETH`}
              caption="skip the upgrade cooldown"
            />
            <FeeCard
              label="Allocation cost"
              value={`${CRATE_OPEN_BNTY.toLocaleString()} BNTY`}
              caption={`flat, per allocation · +${CRATE_FEE_ETH} ETH fee`}
            />
            <FeeCard
              label="Upgrade & allocation split"
              value="50/30/20"
              caption="burn / reserve / treasury"
            />
          </div>
          <p className="text-xs text-steel-500">
            Mints split 70/30 burn/treasury on the BNTY leg; portfolio upgrades and allocations split
            50/30/20 burn/reserve/treasury. See{' '}
            <Link href="/app/tokenomics" className="text-amber-500 hover:underline">
              BNTY Model
            </Link>{' '}
            for the live numbers straight from the backend.
          </p>
        </Section>

        {/* 11. Emission */}
        <Section id="emission" title="11. How emission works">
          <p>
            Greenwood uses a <strong className="text-white">halving emission curve</strong>. Global BNTY
            issuance starts at{' '}
            <strong className="text-white">{GENESIS_RATE_PER_SEC.toFixed(1)} BNTY/sec</strong> at
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
            <strong className="text-white">yield power</strong> (sum of instrument multipliers across
            their desks):
          </p>
          <div className="panel overflow-x-auto p-4">
            <pre className="font-mono text-[11px] leading-relaxed text-steel-300">{USER_RATE}</pre>
          </div>
          <p>
            <strong className="text-white">Why does emission halve?</strong> To front-load
            excitement during the first 2 weeks while still leaving meaningful yields for
            latecomers. By day 14, 75% of lifetime BNTY has been distributed — but latecomers with
            the welcome boost still earn well for their first 72 hours.
          </p>
          <p>
            You can always see current global emission and your share on the{' '}
            <Link href="/app/vault" className="text-amber-500 hover:underline">
              Vault
            </Link>{' '}
            page — it&rsquo;s fully public.
          </p>
        </Section>

        {/* 12. Safety & FAQ */}
        <Section id="safety" title="12. Safety & FAQ">
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
            <strong className="text-steel-300">Continue through the Greenwood terminal:</strong>{' '}
            <Link href="/app/tokenomics" className="text-amber-500 hover:underline">
              BNTY Network Model
            </Link>{' '}
            has live numbers and formulas,{' '}
            <Link href="/app/vault" className="text-amber-500 hover:underline">
              The Vault
            </Link>{' '}
            shows the raw treasury flow,{' '}
            <Link href="/app/leaderboard" className="text-amber-500 hover:underline">
              Leaderboard
            </Link>{' '}
            ranks funds by max level, sum of levels, and total yield.
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
            <option value="oil">Equity Desk</option>
            <option value="mine">Treasury Desk</option>
          </select>
        </div>
        <div>
          <label className="stat-label block" htmlFor="model-rarity">
            Instrument rarity
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
            Desk level
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

/**
 * One region, with what it costs to get in.
 *
 * `warn` marks the two that can actually hurt you. It is a border and a word,
 * not a skull: the handbook is written by the fund, and the fund would call it
 * a site notice.
 */
function RegionCard({ name, gate, body, warn }: { name: string; gate: string; body: string; warn?: boolean }) {
  return (
    <div className={`panel p-4${warn ? ' border-amber-500/40' : ''}`}>
      <p className="font-mono text-sm font-bold uppercase tracking-widest text-white">{name}</p>
      <p className={`mt-1 font-mono text-[11px] ${warn ? 'text-amber-500' : 'text-steel-500'}`}>{gate}</p>
      <p className="mt-2 text-sm text-steel-300">{body}</p>
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
