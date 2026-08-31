'use client';

// The dashboard, which is a DOOR.
//
// It used to be a screen: a profile card, a command bar, a digital twin of the
// floor, a yield buffer, a desk list, a quest panel, an events panel, a changelog,
// a portfolio-upgrade panel, a desk inspector, an allocation card and an
// Outfitter teaser — eleven panels of read-outs about a game you were not yet in.
// Every one of them was a summary of somewhere else, so the screen you looked at
// most was the screen where nothing happened, and the actual game — the rooms,
// the desks, the forest — sat one click behind a wall of numbers.
//
// The verbs all live in the world now. Desks are built, levelled and drained in
// the Machine Room, at the desk in question. Allocations are opened there too,
// into the desk you are standing at. Looks are bought on the Trading Floor.
// Quests ride along in the top bar wherever you are. So what is left for this
// page to do is the one thing none of those can: get you back in.
//
// Two things, therefore, and nothing else:
//
//   YOU — the avatar you are about to be, wearing what you are actually wearing.
//   THE DOOR — one button, aimed at the region you were last standing in.
//
// The destination is checked against /api/regions before it is offered, so the
// button never points at a gate that would turn you away; if the remembered
// region has closed behind you, it falls back to the Grounds, which is ungated
// on purpose and is the way to everywhere else.

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Play } from '@phosphor-icons/react';
import { api, type CosmeticsResponse, type RegionView } from '@/lib/api-client';
import { useOperation } from '@/lib/useOperation';
import { lastRegion } from '@/lib/last-region';
import { playSfx } from '@/lib/sfx';

// ssr: false for the reason every scene in this codebase is: the portrait builds
// three.js objects at render scope, and a throw inside a Canvas subtree during
// the server pass takes the whole thing with it. See docs/iso-conventions.md.
const AvatarPortrait = dynamic(() => import('@/components/iso/AvatarPortrait'), { ssr: false });

/**
 * Where a fund with no history goes.
 *
 * The Grounds rather than the Machine Room, because a new fund starts outside
 * (see IntroGuide) and because the Grounds are the hub every other door hangs
 * off — sending someone straight to their own floor would drop them in the one
 * room with no way onward except the door they did not know to look for.
 */
const HOME = { id: 'grounds', name: 'Evergreen Grounds', href: '/app/grounds' } as const;

/** The avatar-slot cosmetic this catalogue says is worn, if any. */
function wornAvatar(catalog: CosmeticsResponse | null) {
  return catalog?.items.find((item) => item.slot === 'avatar' && item.equipped) ?? null;
}

export default function DashboardPage() {
  const router = useRouter();
  const wallet = useOperation((state) => state.wallet);
  const [catalog, setCatalog] = useState<CosmeticsResponse | null>(null);
  const [regions, setRegions] = useState<RegionView[] | null>(null);

  // What you are wearing, fetched here rather than inside the portrait: the
  // avatar has to know before anyone can see it, including on a first paint.
  useEffect(() => {
    if (!wallet) {
      setCatalog(null);
      return;
    }
    let cancelled = false;
    void api
      .cosmetics(wallet)
      .then((result) => {
        if (!cancelled) setCatalog(result);
      })
      .catch(() => {
        /* an undressed avatar is still the right avatar */
      });
    return () => {
      cancelled = true;
    };
  }, [wallet]);

  useEffect(() => {
    if (!wallet) {
      setRegions(null);
      return;
    }
    let cancelled = false;
    void api
      .regions(wallet)
      .then((result) => {
        if (!cancelled) setRegions(result.regions);
      })
      .catch(() => {
        /* Without a verdict the button still opens the Grounds, which is ungated. */
        if (!cancelled) setRegions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [wallet]);

  const worn = wornAvatar(catalog);

  /**
   * The door this button is.
   *
   * Resolved from the server's own verdict list rather than from the remembered
   * id alone. A region can close behind you — a pack is lost when you die, and
   * requiresPack is checked on entry — so the remembered value is a suggestion
   * that has to be confirmed, not a destination.
   */
  const destination = useMemo(() => {
    if (!regions) return null;
    const remembered = lastRegion(wallet);
    const hit = remembered ? regions.find((region) => region.id === remembered) : null;
    // `resuming` is what separates "carry on" from "go in", which is the only
    // thing the button has room to say and the only thing worth saying.
    if (hit?.allowed) return { ...hit, resuming: true };
    const home = regions.find((region) => region.id === HOME.id);
    return { ...(home ?? HOME), resuming: false };
  }, [regions, wallet]);

  const enter = useCallback(() => {
    if (!destination) return;
    playSfx('success');
    router.push(destination.href);
  }, [destination, router]);

  // Not signed in: the door is the sign-in, and the connect control lives in the
  // command bar above. /start is the same route the title screen's primary
  // action uses, and it forwards straight through once a fund already exists.
  if (!wallet) {
    return (
      <main className="eg-doorway">
        <div className="eg-doorway-figure">
          <AvatarPortrait wallet={null} outfit={null} outfitLevel={0} />
        </div>
        <button className="eg-doorway-play" onClick={() => router.push('/start')}>
          <Play size={26} weight="fill" />
          <b>Link a fund</b>
          <em>Connect a wallet to step into Evergreen</em>
        </button>
      </main>
    );
  }

  return (
    <main className="eg-doorway">
      <div className="eg-doorway-figure">
        <AvatarPortrait
          wallet={wallet}
          outfit={worn?.key ?? null}
          outfitLevel={worn?.level ?? 0}
        />
      </div>
      <button className="eg-doorway-play" onClick={enter} disabled={!destination}>
        <Play size={26} weight="fill" />
        <b>{destination?.resuming ? 'Continue' : 'Play'}</b>
        <em>{destination ? destination.name : 'Finding you…'}</em>
      </button>
    </main>
  );
}
