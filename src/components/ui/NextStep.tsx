'use client';

// "What do I do next" guide.
//
// The dashboard has plenty of panels but no spine — a new operator sees eleven
// nav links and several buttons and has to guess the order. This reads the live
// operation state and always surfaces the single most important next action,
// with plain-language copy and a one-click path to it. The decision itself lives
// in src/lib/next-step.ts (pure + tested); this only renders it and wires the
// action to the right handler, link, or scroll target.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Lightning, Sparkle } from '@phosphor-icons/react';
import { api, type UserOperation, type InventoryItem } from '@/lib/api-client';
import { decideNextStep } from '@/lib/next-step';

function scroll(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

export default function NextStep({
  op,
  wallet,
  onMint,
  onClaim,
  onOpenPod,
}: {
  op: UserOperation;
  wallet: string;
  onMint: () => void;
  onClaim: () => void;
  onOpenPod: () => void;
}) {
  const [locker, setLocker] = useState<InventoryItem[]>([]);

  // The equip step needs the locker, which the dashboard does not otherwise
  // load. Fetch it once per wallet and refresh when production advances so a
  // just-equipped part drops out of the suggestion.
  useEffect(() => {
    let cancelled = false;
    if (!wallet || op.nodes.length === 0) return;
    void api
      .inventory(wallet)
      .then((r) => { if (!cancelled) setLocker(r.items); })
      .catch(() => { if (!cancelled) setLocker([]); });
    return () => { cancelled = true; };
  }, [wallet, op.nodes.length, op.totalProduced]);

  const step = decideNextStep(op, locker);
  const Icon = step.tone === 'act' ? Lightning : Sparkle;
  const a = step.action;

  return (
    <section
      aria-label="What to do next"
      className={`gpu-nextstep ${step.tone === 'act' ? 'is-act' : 'is-wait'}`}
    >
      <div className="gpu-nextstep-head">
        <Icon size={15} weight="fill" aria-hidden />
        <span>{step.tag}</span>
      </div>
      <h3>{step.title}</h3>
      <p>{step.body}</p>
      {a?.kind === 'link' ? (
        <Link className="gpu-nextstep-cta" href={a.href}>
          {a.label} <ArrowRight size={15} weight="bold" aria-hidden />
        </Link>
      ) : a ? (
        <button
          type="button"
          className="gpu-nextstep-cta"
          onClick={
            a.kind === 'mint' ? onMint
            : a.kind === 'claim' ? onClaim
            : a.kind === 'openPod' ? onOpenPod
            : () => scroll(a.scrollTo)
          }
        >
          {a.label} <ArrowRight size={15} weight="bold" aria-hidden />
        </button>
      ) : null}
    </section>
  );
}
