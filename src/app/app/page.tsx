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
import { api, type CosmeticsResponse, type InventoryItem, type PackState, type RegionView } from '@/lib/api-client';
import { useOperation } from '@/lib/useOperation';
import { lastRegion } from '@/lib/last-region';
import type { RegionId } from '@/lib/regions';
import ComponentTile from '@/components/ui/ComponentTile';
import { COMPONENT_RARITIES, RARITIES, SLOT_LABELS, asRarity } from '@/lib/rarity';
import { playSfx, startMenuMusic, stopMenuMusic } from '@/lib/sfx';

// ssr: false for the reason every scene in this codebase is: the portrait builds
// three.js objects at render scope, and a throw inside a Canvas subtree during
// the server pass takes the whole thing with it. See docs/iso-conventions.md.
const AvatarPortrait = dynamic(() => import('@/components/iso/AvatarPortrait'), { ssr: false });
/**
 * The region you were last standing in, live behind the button that returns
 * you to it. Same reasoning as the portrait for ssr:false, and loaded on
 * demand because it is a whole scene and the first paint should not wait on it.
 */
const RegionCinematic = dynamic(() => import('@/components/iso/RegionCinematic'), { ssr: false });

/**
 * Rank and coerce a rarity, both off RARITIES.
 *
 * Its index IS the order, so there is no second table to drift from the first
 * — which lib/rarity's own header records as having happened three times over.
 */
const rarityRank = (r: string) => RARITIES.indexOf(asRarity(r));

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

/**
 * What the player is carrying, in one line.
 *
 * The dashboard is a door, and this is the pocket-check you do on the way
 * through it: the instruments you own, how many of them are actually fitted,
 * the allocations still sealed, and how full the pack is. Four numbers, chosen
 * because each one changes a decision you are about to make in the next minute
 * — an unfitted instrument is yield you are not earning, a sealed allocation is
 * a thing to go and open, and a full pack is why you cannot pick anything up.
 *
 * NOT a locker. The Portfolio exists and does this properly; repeating it here
 * is how the eleven panels came back. Every figure is a count, nothing is
 * clickable, and the five tiles are the five RAREST rather than the five most
 * recent, because rarity is the only ordering that survives having thirty of
 * them.
 */
function Carrying({
  inventory,
  allocations,
  pack,
}: {
  inventory: InventoryItem[] | null;
  allocations: number;
  pack: PackState | null;
}) {
  const top = useMemo(() => {
    if (!inventory) return [];
    return [...inventory]
      .sort((a, b) => rarityRank(b.rarity) - rarityRank(a.rarity))
      .slice(0, 5);
  }, [inventory]);

  // Nothing to say yet, so say nothing. A row of zeroes under the button is
  // the dashboard growing panels again.
  if (!inventory || (inventory.length === 0 && allocations === 0)) return null;

  const fitted = inventory.filter((item) => item.equippedNodeId != null).length;

  return (
    <section className="eg-doorway-carry" aria-label="What you are carrying">
      <div className="eg-carry-tiles">
        {top.map((item) => (
          /*
           * SLOT_LABELS, never `item.slot`.
           *
           * The stored keys are the oldest layer in the codebase — derrick,
           * pump_jack, flare_stack — frozen for the same reason the osr_*
           * columns are, because renaming them is a data migration for no
           * player-visible gain. SLOT_LABELS exists so that vocabulary never
           * reaches a player, and printing the raw key here put the oil rig
           * back on the first screen of a fund-management game.
           */
          <span
            key={item.id}
            title={`${COMPONENT_RARITIES[asRarity(item.rarity)].label} ${SLOT_LABELS[item.slot] ?? 'Instrument'}`}
          >
            <ComponentTile slot={item.slot} rarity={asRarity(item.rarity)} size={30} />
          </span>
        ))}
      </div>
      <dl className="eg-carry-figures">
        <div>
          <dt>Instruments</dt>
          <dd>
            {inventory.length}
            {/* Fitted is the number that matters: an instrument in the locker
                is worth nothing until it is on a desk. */}
            <small>{fitted} fitted</small>
          </dd>
        </div>
        <div>
          <dt>Allocations</dt>
          <dd>
            {allocations}
            <small>{allocations === 1 ? 'sealed' : 'sealed'}</small>
          </dd>
        </div>
        {pack?.name && (
          <div>
            <dt>{pack.name}</dt>
            <dd>
              {pack.used}/{pack.slots}
              <small>{pack.free === 0 ? 'full' : 'carried'}</small>
            </dd>
          </div>
        )}
      </dl>
    </section>
  );
}

export default function DashboardPage() {
  /*
   * The menu track, for as long as this screen is the one on top.
   *
   * Started on mount and released on unmount rather than left running
   * globally: walking into a region should leave the music behind, and the
   * cleanup is what makes that automatic instead of something every scene
   * has to remember to do. It is a no-op while muted, and the browser will
   * not let it begin before a gesture anyway, so it simply arrives the
   * moment the player touches anything.
   */
  useEffect(() => {
    startMenuMusic();
    return () => stopMenuMusic();
  }, []);
  const router = useRouter();
  const wallet = useOperation((state) => state.wallet);
  const op = useOperation((state) => state.op);
  const [catalog, setCatalog] = useState<CosmeticsResponse | null>(null);
  const [regions, setRegions] = useState<RegionView[] | null>(null);
  /** What the player is carrying. See the strip under the button.  */
  const [inventory, setInventory] = useState<InventoryItem[] | null>(null);
  const [pack, setPack] = useState<PackState | null>(null);

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
        if (cancelled) return;
        setRegions(result.regions);
        // The pack rides along on this response, so carrying it costs no
        // second request.
        setPack(result.pack as PackState);
      })
      .catch(() => {
        /* Without a verdict the button still opens the Grounds, which is ungated. */
        if (!cancelled) setRegions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [wallet]);

  useEffect(() => {
    if (!wallet) {
      setInventory(null);
      return;
    }
    let cancelled = false;
    void api
      .inventory(wallet)
      .then((result) => {
        if (!cancelled) setInventory(result.items);
      })
      .catch(() => {
        /* An unreachable locker is an empty strip, not a broken door. */
        if (!cancelled) setInventory([]);
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
      {/*
        The region you were last standing in, moving, behind everything.

        Mounted only once the destination is known: the whole point is that it
        is THE PLACE THIS BUTTON GOES, so opening on the Grounds and cutting to
        the Deep Forest a moment later would show the player somewhere they are
        not about to be.
      */}
      {destination && (
        <div className="eg-doorway-world" aria-hidden>
          <RegionCinematic region={(destination.id as RegionId) ?? null} />
        </div>
      )}
      {/* The world is a backdrop, not the subject. Without this the avatar
          reads as a sticker on a photograph rather than as the thing in front. */}
      <div className="eg-doorway-scrim" aria-hidden />

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

      <Carrying inventory={inventory} allocations={op?.crates.length ?? 0} pack={pack} />
    </main>
  );
}
