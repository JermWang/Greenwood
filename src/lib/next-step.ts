// The "what do I do next" decision, kept pure so it can be tested without a
// browser. Given the live operation state and the parts locker, it returns the
// single most important next action — walking the loop:
//
//   open first desk (start the 8x boost) -> route yield -> equip found parts ->
//   open an allocation -> upgrade portfolio -> expand -> level up ->
//   GO OUTSIDE -> (producing)
//
// The order IS the priority: the first branch that matches wins. It never
// suggests an action the balance cannot cover, so an allocation or upgrade only
// appears once it is actually affordable.
//
// THE OUTDOOR BRANCHES ARE WHY THIS FILE MATTERS BEYOND THE FIRST SESSION.
//
// Every branch used to be a fund action, and the chain terminated in a wait
// state that said "nothing needs your attention right now". That is the single
// most-read line of copy on the dashboard, and for an experienced player it was
// always the one showing — the guide's final advice to the people most invested
// in the game was that there was nothing to do. Meanwhile the Grounds, the
// Treeline and the Deep Forest existed, were gated, were tested, and were
// mentioned nowhere.
//
// So the outdoors sits directly BEFORE the idle states rather than competing
// with the fund: routing yield is time-sensitive and an expedition is not, so
// anything urgent still wins. What changed is what "nothing urgent" leads to.

import type { UserOperation, InventoryItem, RegionView } from './api-client';

/** The cheapest desk (a Treasury Desk) — the floor for "can I afford another desk". */
const NODE_MIN_COST = 750;

export type NextAction =
  | { kind: 'mint'; label: string }
  | { kind: 'claim'; label: string }
  | { kind: 'openPod'; label: string }
  | { kind: 'link'; label: string; href: string }
  | { kind: 'scroll'; label: string; scrollTo: string };

export interface NextStepView {
  /** Stable id for the branch, used in tests and analytics. */
  id: string;
  tag: string;
  title: string;
  body: string;
  tone: 'act' | 'wait';
  action?: NextAction;
}

function bnty(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return Math.round(n).toLocaleString();
}

/**
 * The outdoor regions, best first.
 *
 * "Best" means furthest from the settlement, which is the axis everything out
 * there is tuned along — the Deep Forest is the frontier, the Grounds are the
 * doorstep. Pointing a capable player at the doorstep would be technically
 * correct and useless.
 *
 * Ids, not names: these are the region ids from lib/regions, which are canon and
 * deliberately not renamed (see CLAUDE.md).
 */
const FRONTIER = ['deep-forest', 'treeline', 'grounds'] as const;

/** Where the Grounds live. Every outdoor suggestion routes through the hub. */
const GROUNDS_HREF = '/app/grounds';

/**
 * The outdoor half of the decision, or null when there is nothing to say.
 *
 * Split out because it answers a different question from the branches above it —
 * those ask "what can this fund afford", this asks "where may this player go" —
 * and because the region verdicts are optional. The dashboard fetches them
 * separately, so a caller without them still gets the whole fund chain rather
 * than an error.
 *
 * Everything routes to the Grounds rather than deep-linking to the region
 * itself. The Grounds are the hub: the doors are there, the gate that refuses
 * you is there, and the pack that gets you past it is sold at that gate. A link
 * straight to a locked region would land the player on a refusal screen with
 * nothing to do about it.
 */
function decideOutdoors(regions: RegionView[]): NextStepView | null {
  const outdoor = FRONTIER.map((id) => regions.find((r) => r.id === id)).filter(
    (r): r is RegionView => Boolean(r)
  );
  if (outdoor.length === 0) return null;

  // A gate blocked ONLY by a pack beats an open region, because it is a smaller
  // and more concrete action: something to buy, at a known price, that opens a
  // place. "Go for a walk" competes badly with that.
  const needsPack = outdoor.filter((r) => !r.allowed && r.code === 'pack')
    .sort((a, b) => a.minTotalLevel - b.minTotalLevel)[0];
  if (needsPack) {
    return {
      id: 'need-pack',
      tag: 'Outside · Blocked',
      title: `${needsPack.name} is open to you — but not empty-handed`,
      body:
        'You have the level for it. What you do not have is a pack, and nothing you find out there can come back without one. They are sold at the gate itself, in the Grounds.',
      tone: 'act',
      action: { kind: 'link', label: 'Walk to the gate', href: GROUNDS_HREF },
    };
  }

  const open = outdoor.find((r) => r.allowed);
  if (open) {
    return {
      id: 'go-outside',
      tag: 'Outside',
      title: `${open.name} is open`,
      body: `${open.blurb} Everything past the Machine Room door is reached on foot — walk out through the Grounds.`,
      tone: 'act',
      action: { kind: 'link', label: 'Step outside', href: GROUNDS_HREF },
    };
  }

  // Nothing open and nothing buyable: name the next gate and what it costs, so
  // an idle fund still has a direction. A locked region the player cannot see is
  // a locked region they cannot work toward.
  const next = outdoor.filter((r) => !r.allowed).sort((a, b) => a.minTotalLevel - b.minTotalLevel)[0];
  if (next) {
    return {
      id: 'next-region',
      tag: 'Outside · Locked',
      title: `${next.name} opens at level ${next.minTotalLevel}`,
      body: `${next.reason ?? next.blurb} Levels come from doing things — trading, treasury, allocations and running the floor each raise their own track.`,
      tone: 'wait',
      action: { kind: 'link', label: 'See your tracks', href: '/app/profile' },
    };
  }
  return null;
}

export function decideNextStep(
  op: UserOperation,
  locker: InventoryItem[],
  /** Region verdicts from /api/regions. Omitted when the caller has not loaded them. */
  regions?: RegionView[]
): NextStepView {
  const nodes = op.nodes ?? [];
  const balance = op.bntyBalance ?? 0;
  const pending = Object.values(op.pending ?? {}).reduce((a, b) => a + b, 0);
  const families = new Set(nodes.map((n) => n.type));

  // 1) No lines — the first mint is the whole game and starts the once-only 72h
  //    8x boost, so surface that urgency here, at the decision.
  if (nodes.length === 0) {
    return {
      id: 'mint-first',
      tag: 'Step 1 · Open',
      title: 'Open your first desk',
      body:
        'Your 1,000 BNTY starter grant covers one desk. Opening it also starts a 72-hour 8× yield boost that only ever runs once — the sooner you build, the more you earn.',
      tone: 'act',
      action: { kind: 'mint', label: 'Open a desk' },
    };
  }

  // 2) Yield ready and off cooldown — route it.
  if (pending > 0 && op.claimCooldownRemainingMs <= 0) {
    return {
      id: 'claim',
      tag: 'Step 2 · Route yield',
      title: `Route your ${bnty(pending)} BNTY`,
      body:
        'Your desks have produced BNTY. Route it to your balance so you can spend it — and so your desks, which stop earning once full, keep producing.',
      tone: 'act',
      action: { kind: 'claim', label: `Route ${bnty(pending)} BNTY` },
    };
  }

  // 3) A found part fits a line you own — free grow-power, and the walk to the
  //    Parts Bay is the single most-missed step.
  const fit = locker.find((i) => i.equippedNodeId == null && families.has(i.family));
  if (fit) {
    return {
      id: 'equip',
      tag: 'Step 3 · Equip',
      title: 'Equip your new instrument',
      body: `A ${fit.rarity} ${fit.slot.replace(/_/g, ' ')} instrument is in your Instruments locker. Fitting it to a matching desk raises its yield power — and your share of emissions — for free.`,
      tone: 'act',
      action: { kind: 'link', label: 'Open Instruments', href: '/app/inventory' },
    };
  }

  // 4) A pod is held AND affordable — only offer it once it can be paid for.
  const heldPods = op.crates?.length ?? 0;
  const unseen = op.unseenCrates?.length ?? 0;
  if (heldPods > 0 && balance >= op.compound.crateCost) {
    return {
      id: 'open-pod',
      tag: 'Step 4 · Open an allocation',
      title: unseen > 0 ? 'Open your new allocation' : 'Open an allocation',
      body: `You have a sealed allocation. Opening it (${bnty(op.compound.crateCost)} BNTY) yields a random instrument you can fit to a desk for more output.`,
      tone: 'act',
      action: { kind: 'openPod', label: 'Open an allocation' },
    };
  }

  // 5) Warehouse upgrade affordable and off cooldown — more lines, better pods.
  const up = op.compound.nextUpgradeCost;
  if (up && balance >= up.totalBnty && op.compound.cooldownRemainingMs <= 0) {
    return {
      id: 'upgrade',
      tag: 'Step 5 · Upgrade',
      title: `Upgrade your portfolio to Tier ${up.targetLevel}`,
      body: `You can afford the upgrade (${bnty(up.totalBnty)} BNTY). It raises your desk capacity, daily allocation finds, and the rarity of instruments you can recover.`,
      tone: 'act',
      action: { kind: 'scroll', label: 'Upgrade portfolio', scrollTo: 'compound-panel' },
    };
  }

  // 6) Room and funds for another line.
  const capOil = op.maxNodes;
  const capMine = op.maxNodes + op.shaftBonusSlots;
  const oil = nodes.filter((n) => n.type === 'oil').length;
  const mine = nodes.filter((n) => n.type === 'mine').length;
  const capacityFull = oil >= capOil && mine >= capMine;
  if (!capacityFull && balance >= NODE_MIN_COST) {
    return {
      id: 'expand',
      tag: 'Step 6 · Expand',
      title: 'Add another desk',
      body: 'You have the BNTY and the capacity for another desk. More desks mean a bigger share of the emission network.',
      tone: 'act',
      action: { kind: 'mint', label: 'Open a desk' },
    };
  }

  // 7) Level up the cheapest line you can afford.
  const affordableLevel = nodes
    .filter((n) => balance >= n.nextLevelCost)
    .sort((a, b) => a.nextLevelCost - b.nextLevelCost)[0];
  if (affordableLevel) {
    return {
      id: 'level-up',
      tag: 'Step 7 · Level up',
      title: 'Level up a desk',
      body: `You can afford to level up a desk (${bnty(affordableLevel.nextLevelCost)} BNTY). Higher levels produce more BNTY per second.`,
      tone: 'act',
      action: { kind: 'scroll', label: 'Inspect desks', scrollTo: 'production-lines' },
    };
  }

  // 8) The fund has nothing urgent. THIS is where the rest of the world lives —
  //    before the idle states, not after them, because "nothing needs your
  //    attention" should never be the last thing a player is told while three
  //    regions sit unvisited.
  const outdoors = regions ? decideOutdoors(regions) : null;
  if (outdoors?.tone === 'act') return outdoors;

  // 9) Nothing to act on — lines are producing. Point idle BNTY at the vault.
  if (pending > 0 && op.claimCooldownRemainingMs > 0) {
    const mins = Math.ceil(op.claimCooldownRemainingMs / 60000);
    return {
      id: 'cooldown',
      tag: 'Producing',
      title: `Yield unlocks in ${mins}m`,
      body: 'Your desks are producing. Routing is on a short cooldown after each claim — come back when it clears, or put idle BNTY to work below.',
      tone: 'wait',
      action: { kind: 'link', label: 'Explore Fixed Income', href: '/app/stake' },
    };
  }
  // 10) Still nothing, but a gate is within sight. Naming it beats "nothing
  //     needs your attention", which is true and demoralising.
  if (outdoors) return outdoors;

  return {
    id: 'producing',
    tag: 'Producing',
    title: 'Your fund is earning BNTY',
    body: 'Nothing needs your attention right now — desks earn while you are away. Check back to route yield, or lock idle BNTY in a Fixed-Income Note for a fixed return.',
    tone: 'wait',
    action: { kind: 'link', label: 'Explore Fixed Income', href: '/app/stake' },
  };
}
