// The "what do I do next" decision, kept pure so it can be tested without a
// browser. Given the live operation state and the parts locker, it returns the
// single most important next action — walking the loop:
//
//   mint first line (start the 8x boost) -> route yield -> equip found parts ->
//   open a pod -> upgrade warehouse -> expand -> level up -> (producing)
//
// The order IS the priority: the first branch that matches wins. It never
// suggests an action the balance cannot cover, so a pod or upgrade only appears
// once it is actually affordable.

import type { UserOperation, InventoryItem } from './api-client';

/** The cheapest line (a Cleanroom) — the floor for "can I afford another line". */
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

function gpu(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return Math.round(n).toLocaleString();
}

export function decideNextStep(op: UserOperation, locker: InventoryItem[]): NextStepView {
  const nodes = op.nodes ?? [];
  const balance = op.osrBalance ?? 0;
  const pending = Object.values(op.pending ?? {}).reduce((a, b) => a + b, 0);
  const families = new Set(nodes.map((n) => n.type));

  // 1) No lines — the first mint is the whole game and starts the once-only 72h
  //    8x boost, so surface that urgency here, at the decision.
  if (nodes.length === 0) {
    return {
      id: 'mint-first',
      tag: 'Step 1 · Commission',
      title: 'Build your first production line',
      body:
        'Your 1,000 GPU starter grant covers one line. Commissioning it also starts a 72-hour 8× production boost that only ever runs once — the sooner you build, the more you earn.',
      tone: 'act',
      action: { kind: 'mint', label: 'Commission a line' },
    };
  }

  // 2) Yield ready and off cooldown — route it.
  if (pending > 0 && op.claimCooldownRemainingMs <= 0) {
    return {
      id: 'claim',
      tag: 'Step 2 · Route yield',
      title: `Route your ${gpu(pending)} GPU`,
      body:
        'Your lines have produced GPU. Route it to your balance so you can spend it — and so your lines, which stop earning once full, keep producing.',
      tone: 'act',
      action: { kind: 'claim', label: `Route ${gpu(pending)} GPU` },
    };
  }

  // 3) A found part fits a line you own — free grow-power, and the walk to the
  //    Parts Bay is the single most-missed step.
  const fit = locker.find((i) => i.equippedNodeId == null && families.has(i.family));
  if (fit) {
    return {
      id: 'equip',
      tag: 'Step 3 · Equip',
      title: 'Fit your recovered component',
      body: `A ${fit.rarity} ${fit.slot.replace(/_/g, ' ')} part is in your Parts Bay locker. Fitting it to a matching line raises its grow-power — and your share of emissions — for free.`,
      tone: 'act',
      action: { kind: 'link', label: 'Open Parts Bay', href: '/app/inventory' },
    };
  }

  // 4) A pod is held AND affordable — only offer it once it can be paid for.
  const heldPods = op.crates?.length ?? 0;
  const unseen = op.unseenCrates?.length ?? 0;
  if (heldPods > 0 && balance >= op.compound.crateCost) {
    return {
      id: 'open-pod',
      tag: 'Step 4 · Open a pod',
      title: unseen > 0 ? 'Open your new supply pod' : 'Open a supply pod',
      body: `You have a sealed supply pod. Opening it (${gpu(op.compound.crateCost)} GPU) yields a random component you can fit to a line for more output.`,
      tone: 'act',
      action: { kind: 'openPod', label: 'Open a pod' },
    };
  }

  // 5) Warehouse upgrade affordable and off cooldown — more lines, better pods.
  const up = op.compound.nextUpgradeCost;
  if (up && balance >= up.totalOsr && op.compound.cooldownRemainingMs <= 0) {
    return {
      id: 'upgrade',
      tag: 'Step 5 · Upgrade',
      title: `Upgrade your warehouse to Tier ${up.targetLevel}`,
      body: `You can afford the upgrade (${gpu(up.totalOsr)} GPU). It raises your line capacity, daily pod finds, and the rarity of parts you can recover.`,
      tone: 'act',
      action: { kind: 'scroll', label: 'Upgrade warehouse', scrollTo: 'compound-panel' },
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
      title: 'Add another production line',
      body: 'You have the GPU and the capacity for another line. More lines mean a bigger share of the emission network.',
      tone: 'act',
      action: { kind: 'mint', label: 'Commission a line' },
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
      title: 'Level up a production line',
      body: `You can afford to level up a line (${gpu(affordableLevel.nextLevelCost)} GPU). Higher levels produce more GPU per second.`,
      tone: 'act',
      action: { kind: 'scroll', label: 'Inspect lines', scrollTo: 'production-lines' },
    };
  }

  // 8) Nothing to act on — lines are producing. Point idle GPU at the vault.
  if (pending > 0 && op.claimCooldownRemainingMs > 0) {
    const mins = Math.ceil(op.claimCooldownRemainingMs / 60000);
    return {
      id: 'cooldown',
      tag: 'Producing',
      title: `Yield unlocks in ${mins}m`,
      body: 'Your lines are producing. Routing is on a short cooldown after each claim — come back when it clears, or put idle GPU to work below.',
      tone: 'wait',
      action: { kind: 'link', label: 'Explore Capacity Contracts', href: '/app/stake' },
    };
  }
  return {
    id: 'producing',
    tag: 'Producing',
    title: 'Your fab is producing GPU',
    body: 'Nothing needs your attention right now — lines earn while you are away. Check back to route yield, or lock idle GPU in a Capacity Contract for a fixed return.',
    tone: 'wait',
    action: { kind: 'link', label: 'Explore Capacity Contracts', href: '/app/stake' },
  };
}
