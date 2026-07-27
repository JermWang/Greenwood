'use client';

// The isometric floor builder.
//
// Deliberately a drop-in for the old walk-around sandbox: same props, same
// persistence contract, same CSS classes. Only the interaction model changed —
// pick a desk from the book, click a tile to set it down. There is no avatar to
// walk and no first-person camera, so placement is a single click rather than a
// walk-to-the-spot-and-aim.

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowsClockwise, CaretDown, CaretUp, ChartLineUp, Drop, Stack, Trash, Vault } from '@phosphor-icons/react';
import IsoScene from './IsoScene';
import { type BoardBounds } from './IsoBoard';
import { lookFor } from './Character';
import { type IsoMachine, type MachineKind, type PlacedIsoMachine } from './palette';
import MachineSpec from '@/components/ui/MachineSpec';
import { LAYOUT_RULES } from '@/lib/floor-rules';
import { api, type FloorBonus } from '@/lib/api-client';
import { useOperation } from '@/lib/useOperation';
import BuildPrompt, { type DeskFamily } from './BuildPrompt';

export type { MachineKind, IsoMachine };

/** Catalog glyph per silhouette, so the book reads the same way the board does. */
const KIND_ICON: Record<MachineKind, typeof ChartLineUp> = {
  euv: ChartLineUp,
  rack: Vault,
  cooling: Drop,
  packaging: Stack,
};

/** Opening arrangement for the wallet-free demo, so it never starts empty. */
function demoLayout(machines: IsoMachine[]): PlacedIsoMachine[] {
  const spots: Array<[number, number]> = [[-2, 0], [1, -1], [3, 2], [-4, 3], [0, 4], [4, -3]];
  return machines.slice(0, spots.length).map((machine, i) => ({
    id: machine.id,
    x: spots[i][0],
    z: spots[i][1],
    rotation: 0,
  }));
}

function readLocal(storageKey: string, machines: IsoMachine[]): PlacedIsoMachine[] {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PlacedIsoMachine[];
    if (!Array.isArray(parsed)) return [];
    const owned = new Set(machines.map((m) => m.id));
    return parsed.filter((p) => p && owned.has(p.id));
  } catch {
    return [];
  }
}

export default function IsoFloor({
  machines,
  storageKey,
  demo = false,
  wallet,
}: {
  machines: IsoMachine[];
  storageKey: string;
  demo?: boolean;
  wallet?: string;
}) {
  const [layout, setLayout] = useState<PlacedIsoMachine[]>([]);
  const [holdingId, setHoldingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  /** The empty tile a build was started on. Null when no prompt is open. */
  const [buildAt, setBuildAt] = useState<{ x: number; z: number } | null>(null);
  const [building, setBuilding] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [routing, setRouting] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  /** Live fund, for what a desk costs against and to refresh after building. */
  const op = useOperation((s) => s.op);
  const refresh = useOperation((s) => s.refresh);
  const [bonus, setBonus] = useState<FloorBonus | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'error'>('idle');
  // Both HUD panels fold to their title bar. On a board you are constantly
  // clicking, panels that cannot get out of the way are just obstacles.
  const [bookOpen, setBookOpen] = useState(true);
  const [yieldOpen, setYieldOpen] = useState(true);
  const [worn, setWorn] = useState<Record<string, { key: string; level: number }>>({});

  /**
   * Everything this wallet has equipped, by slot.
   *
   * All three slots matter in this room, not just the jacket: desk and plinth
   * liveries are sold as applying to "every desk on your floor", and this is the
   * floor. A cosmetic that takes BNTY and then renders nowhere is the worst
   * possible version of a cosmetic.
   */
  useEffect(() => {
    if (!wallet) { setWorn({}); return; }
    let cancelled = false;
    void api.cosmetics(wallet)
      .then((result) => {
        if (cancelled) return;
        setWorn(
          Object.fromEntries(
            result.items
              .filter((item) => item.equipped)
              .map((item) => [item.slot, { key: item.key, level: item.level }])
          )
        );
      })
      .catch(() => { /* an undressed fund is still a working one */ });
    return () => { cancelled = true; };
  }, [wallet]);

  const livery = useMemo(
    () => ({
      desk: worn.desk?.key ?? null,
      deskLevel: worn.desk?.level ?? 0,
      plinth: worn.plinth?.key ?? null,
      plinthLevel: worn.plinth?.level ?? 0,
    }),
    [worn]
  );

  /** Demo visitors get a character too — walking the room is the demo. */
  const avatar = useMemo(
    () => ({
      look: lookFor({
        wallet: wallet ?? 'guest',
        outfit: worn.avatar?.key ?? null,
        outfitLevel: worn.avatar?.level ?? 0,
        isSelf: true,
      }),
      name: wallet ? `${wallet.slice(0, 6)}…${wallet.slice(-4)}` : 'Guest',
    }),
    [wallet, worn]
  );

  // Identity of the owned set, not the array: the parent rebuilds `machines`
  // whenever inventory refreshes, and depending on the array itself would re-run
  // the load and wipe placements the player just made.
  const machineKey = useMemo(() => machines.map((m) => m.id).join(','), [machines]);
  const machinesRef = useRef(machines);
  machinesRef.current = machines;

  useEffect(() => {
    if (!wallet) {
      const restored = readLocal(storageKey, machinesRef.current);
      setLayout(restored.length > 0 || !demo ? restored : demoLayout(machinesRef.current));
      setHydrated(true);
      return;
    }
    let cancelled = false;
    void api.floor(wallet)
      .then((result) => {
        if (cancelled) return;
        const owned = new Set(machinesRef.current.map((m) => m.id));
        setLayout(result.layout.filter((entry) => owned.has(entry.id)));
        setBonus(result.bonus);
      })
      .catch(() => {
        /* An unreachable floor is an empty floor, not a broken page. */
      })
      .finally(() => {
        if (!cancelled) setHydrated(true);
      });
    return () => { cancelled = true; };
  }, [demo, machineKey, storageKey, wallet]);

  useEffect(() => {
    if (!hydrated) return;
    if (!wallet) {
      window.localStorage.setItem(storageKey, JSON.stringify(layout));
      return;
    }
    // Debounced: moving a desk produces a placement per click, and each one
    // would otherwise be a round trip that rescores the network denominator.
    setSaveState('saving');
    const timer = window.setTimeout(() => {
      void api.saveFloor(wallet, layout)
        .then((result) => {
          setBonus(result.bonus);
          setSaveState('idle');
          // The server drops anything it will not accept, so render what it
          // actually stored rather than what we asked it to store.
          setLayout((current) =>
            result.layout.length === current.length ? current : result.layout
          );
        })
        .catch(() => setSaveState('error'));
    }, 700);
    return () => window.clearTimeout(timer);
  }, [hydrated, layout, storageKey, wallet]);

  const rotateSelected = useCallback(() => {
    if (!selectedId) return;
    setLayout((cur) =>
      cur.map((p) => (p.id === selectedId ? { ...p, rotation: p.rotation + Math.PI / 2 } : p))
    );
  }, [selectedId]);

  const storeSelected = useCallback(() => {
    if (!selectedId) return;
    setLayout((cur) => cur.filter((p) => p.id !== selectedId));
    setSelectedId(null);
  }, [selectedId]);

  // On a phone the book is a full-width sheet over the board, so it starts
  // folded — the board is the thing you came to look at. Set after mount rather
  // than in the initial state so server and client render the same markup.
  useEffect(() => {
    if (window.innerWidth <= 760) setBookOpen(false);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return;
      const key = event.key.toLowerCase();
      if (key === 'r') rotateSelected();
      if (key === 'delete' || key === 'backspace') storeSelected();
      if (key === 'escape') { setHoldingId(null); setSelectedId(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rotateSelected, storeSelected]);

  const placedIds = useMemo(() => new Set(layout.map((p) => p.id)), [layout]);

  /**
   * The board the player actually sees.
   *
   * The server accepts a 25x33 area, but rendering all of it makes a mostly
   * empty floor that has to be zoomed out until the desks are specks. So the
   * default is 23x23 — every cell of which the server accepts — and it only
   * grows to take in machines an older layout left further out. It is a room
   * you walk around now, not just a board you drop things on, which is why it
   * wants the extra space.
   */
  const bounds = useMemo<BoardBounds>(() => {
    const b = { minX: -11, maxX: 11, minZ: -11, maxZ: 11 };
    for (const p of layout) {
      b.minX = Math.min(b.minX, p.x - 1);
      b.maxX = Math.max(b.maxX, p.x + 1);
      b.minZ = Math.min(b.minZ, p.z - 1);
      b.maxZ = Math.max(b.maxZ, p.z + 1);
    }
    return b;
  }, [layout]);

  const onTileClick = useCallback((x: number, z: number) => {
    if (!holdingId) return;
    const taken = layout.find((p) => p.x === x && p.z === z);

    // Refuse a drop onto a cell another desk already holds; the server would
    // reject it anyway and the board already shows the cell in red.
    if (taken && taken.id !== holdingId) return;
    setLayout((cur) =>
      cur.some((p) => p.id === holdingId)
        ? cur.map((p) => (p.id === holdingId ? { ...p, x, z } : p))
        : [...cur, { id: holdingId, x, z, rotation: 0 }]
    );
    setSelectedId(holdingId);
    setHoldingId(null);
  }, [holdingId, layout]);

  /**
   * Where the player is standing, and whether they could build there.
   *
   * BUILDING HAPPENS WHERE YOU STAND, not where you click.
   *
   * Click-to-build was the obvious first attempt and it is wrong: a click with
   * nothing in hand already means "walk there", so overloading it would turn
   * every step across the room into a decision about whether you meant to move
   * or to spend a thousand BNTY. Walking to the spot and building there is also
   * simply the more truthful version of the interaction — it is how the doors in
   * the Grounds work, and it is the reason to have a room at all.
   */
  const [standingAt, setStandingAt] = useState<{ x: number; z: number } | null>(null);
  const onPlayerMove = useCallback((cell: { x: number; z: number }) => {
    setStandingAt(cell);
    // Moving cancels a build you had not confirmed. A prompt that followed you
    // across the floor would have detached from the tile it was about.
    setBuildAt(null);
  }, []);

  /**
   * The desk you are standing next to, and what it is holding.
   *
   * ROUTING YIELD IS A DESK INTERACTION, not a fund-wide button.
   *
   * On the dashboard this was one control that drained every desk at once, which
   * made the floor decorative: where a desk stood, whether it was full, whether
   * it had been sitting at its ceiling all night — none of it was visible at the
   * moment you collected, so none of it felt like it mattered. Walking to a full
   * desk and taking what it made is the same transaction with the information
   * put back in.
   *
   * Adjacent rather than on top of, because a desk occupies its tile. Chebyshev,
   * matching every other adjacency rule in this game.
   */
  const nearbyDesk = useMemo(() => {
    if (!standingAt || holdingId) return null;
    for (const placed of layout) {
      if (Math.max(Math.abs(placed.x - standingAt.x), Math.abs(placed.z - standingAt.z)) > 1) continue;
      const nodeId = Number(placed.id.replace('line:', ''));
      const node = op?.nodes.find((n) => Number(n.id) === nodeId);
      if (node) return { placed, node };
    }
    return null;
  }, [standingAt, holdingId, layout, op?.nodes]);

  /**
   * Collect from the desk you are standing at.
   *
   * The engine and the route have always taken an optional nodeId — the
   * dashboard simply never passed one. So this is the same settlement path a
   * fund-wide claim uses, aimed at a single desk.
   */
  const routeYield = useCallback(async () => {
    if (!nearbyDesk || !wallet || routing) return;
    setRouting(true);
    setRouteError(null);
    try {
      await api.claim(wallet, nearbyDesk.node.id);
      void refresh();
    } catch (e) {
      setRouteError(e instanceof Error ? e.message : 'That did not go through.');
    } finally {
      setRouting(false);
    }
  }, [nearbyDesk, wallet, routing, refresh]);

  const canBuildHere =
    !demo &&
    !!wallet &&
    !holdingId &&
    !!standingAt &&
    !layout.some((p) => p.x === standingAt.x && p.z === standingAt.z);

  /**
   * Build the chosen desk, then put it on the tile that was clicked.
   *
   * Placed optimistically from the id the mint returns rather than waiting for
   * the next operation poll: the point of building in the room is that the desk
   * appears where you asked for it, and a fifteen-second gap before it shows up
   * would make the spot feel like a coincidence.
   */
  const build = useCallback(
    async (family: DeskFamily) => {
      if (!buildAt || !wallet || building) return;
      setBuilding(true);
      setBuildError(null);
      try {
        const result = await api.mintNode(wallet, family.key);
        const id = `line:${result.node.id}`;
        setLayout((cur) => [...cur.filter((p) => p.id !== id), { id, ...buildAt, rotation: 0 }]);
        setSelectedId(id);
        setBuildAt(null);
        // The dashboard reads the same store, so refreshing here keeps the
        // balance and the desk count honest everywhere at once.
        void refresh();
      } catch (e) {
        setBuildError(e instanceof Error ? e.message : 'That did not go through.');
      } finally {
        setBuilding(false);
      }
    },
    [buildAt, wallet, building, refresh]
  );

  const selectedMachine = selectedId ? machines.find((m) => m.id === selectedId) : null;

  return (
    <main className="fab-sandbox">
      <IsoScene
        machines={machines}
        layout={layout}
        bounds={bounds}
        dressed
        avatar={avatar}
        livery={livery}
        holdingId={holdingId}
        selectedId={selectedId}
        onTileClick={onTileClick}
        onDeskClick={(id) => { setSelectedId(id); setHoldingId(null); setBuildAt(null); }}
        onPlayerMove={onPlayerMove}
        onBackgroundClick={() => { setSelectedId(null); setHoldingId(null); setBuildAt(null); }}
      />

      {/*
        Standing at a desk: what it has made, and taking it.

        Takes the same corner as the build affordance because they are mutually
        exclusive — you are either next to a desk or on bare floor, never both.
      */}
      {nearbyDesk && !buildAt && (
        <div className={`desk-here${nearbyDesk.node.pendingOsr > 0 ? ' is-ready' : ''}`}>
          <span className="desk-here-head">
            <b>{nearbyDesk.node.type === 'oil' ? 'Equity Desk' : 'Treasury Desk'}</b>
            <em>L{nearbyDesk.node.level}</em>
          </span>

          {/*
            The storage bar is the reason this belongs in the room.

            Yield stops accruing at the ceiling, and on the dashboard that fact
            was a number in a list nobody read — you found out you had been
            earning nothing overnight after the fact, if at all. A desk standing
            in front of you with a full bar is the same information as a thing
            you can see.
          */}
          <span className="desk-here-bar">
            <i
              style={{
                width: `${Math.min(100, (nearbyDesk.node.pendingOsr / Math.max(1, nearbyDesk.node.storageCap)) * 100)}%`,
              }}
            />
          </span>
          <span className="desk-here-amount">
            {nearbyDesk.node.pendingOsr.toFixed(2)}
            <small> / {Math.round(nearbyDesk.node.storageCap)} BNTY</small>
          </span>

          {routeError && <em className="desk-here-error">{routeError}</em>}

          <button
            className="desk-here-go"
            onClick={() => void routeYield()}
            disabled={routing || nearbyDesk.node.pendingOsr <= 0}
          >
            {routing
              ? 'Routing…'
              : nearbyDesk.node.pendingOsr > 0
                ? `Route ${nearbyDesk.node.pendingOsr.toFixed(2)} BNTY`
                : 'Nothing to route yet'}
          </button>
        </div>
      )}

      {/* The affordance: stand on bare floor and this appears. Deliberately a
          small button rather than the panel itself — the panel is the decision,
          and opening it should be something you chose to do. */}
      {canBuildHere && !nearbyDesk && !buildAt && standingAt && (
        <button className="build-here" onClick={() => setBuildAt(standingAt)}>
          + Build a desk here
          <em>{standingAt.x}, {standingAt.z}</em>
        </button>
      )}

      <BuildPrompt
        cell={buildAt}
        balance={op?.osrBalance ?? 0}
        busy={building}
        error={buildError}
        onBuild={build}
        onClose={() => { setBuildAt(null); setBuildError(null); }}
      />

      <header className="fab-sandbox-top">
        <div>
          <b>{demo ? 'DEMO MACHINE ROOM' : 'MACHINE ROOM'}</b>
          <span>{holdingId ? 'CLICK A TILE TO PLACE' : `${layout.length}/${machines.length} DESKS RUNNING`}</span>
        </div>
      </header>

      <aside className="fab-build-catalog is-open">
        <button className="fab-build-title" onClick={() => setBookOpen((v) => !v)} aria-expanded={bookOpen}>
          <span>DESK BOOK</span>
          <b>{layout.length}/{machines.length} placed {bookOpen ? <CaretUp size={10} weight="bold" /> : <CaretDown size={10} weight="bold" />}</b>
        </button>
        <div className="fab-build-items" hidden={!bookOpen}>
          {machines.map((machine) => {
            const isPlaced = placedIds.has(machine.id);
            const active = holdingId === machine.id || selectedId === machine.id;
            const Icon = KIND_ICON[machine.kind] ?? ChartLineUp;
            return (
              <button
                key={machine.id}
                onClick={() => {
                  setHoldingId(machine.id);
                  setSelectedId(isPlaced ? machine.id : null);
                }}
                className={active ? 'is-active' : ''}
                style={{ '--machine-accent': machine.accent } as React.CSSProperties}
              >
                <span><Icon size={16} weight="duotone" /></span>
                <b>
                  {machine.label}
                  {machine.cost != null && (
                    <em className="fab-build-cost">{Math.round(machine.cost).toLocaleString()} BNTY</em>
                  )}
                </b>
                {machine.detail && <small className="fab-build-detail">{machine.detail}</small>}
                {machine.blurb && <small>{machine.blurb}</small>}
                <small>{isPlaced ? 'Placed · click a tile to move' : 'Click a tile to place'}</small>
              </button>
            );
          })}
        </div>
        <div className="fab-build-actions" hidden={!bookOpen}>
          <button onClick={rotateSelected} disabled={!selectedId}><ArrowsClockwise size={15} /> Rotate</button>
          <button onClick={storeSelected} disabled={!selectedId}><Trash size={15} /> Store</button>
        </div>

        {/* What the highlighted machine actually does. Shown here rather than in
            a separate modal because this is the moment the player is choosing
            where to put it — the multipliers are the decision. */}
        {bookOpen && selectedMachine && (
          <div className="fab-build-spec">
            <MachineSpec kind={selectedMachine.kind} />
          </div>
        )}
      </aside>

      <aside className="fab-yield-panel">
        <button className="fab-yield-head" onClick={() => setYieldOpen((v) => !v)} aria-expanded={yieldOpen}>
          <span>LAYOUT YIELD</span>
          <b className={bonus && bonus.multiplier < 1 ? 'is-down' : 'is-up'}>
            {bonus ? `${bonus.multiplier >= 1 ? '+' : ''}${Math.round((bonus.multiplier - 1) * 100)}%` : '—'}
            {yieldOpen ? <CaretUp size={10} weight="bold" /> : <CaretDown size={10} weight="bold" />}
          </b>
        </button>
        <ul hidden={!yieldOpen}>
          {bonus?.effects?.length ? (
            bonus.effects.map((effect) => (
              <li key={effect.key} className={effect.delta < 0 ? 'is-down' : ''}>
                <span>{effect.label}</span>
                <b>{effect.delta >= 0 ? '+' : ''}{Math.round(effect.delta * 100)}%</b>
                <small>{effect.lines} desk{effect.lines === 1 ? '' : 's'}</small>
              </li>
            ))
          ) : (
            <li className="is-empty">
              <span>Place desks on the board to score your layout. Keep support desks in reach and don&rsquo;t crowd them.</span>
            </li>
          )}
        </ul>
        {/* The placement rules the score is computed from, stated outright. */}
        <dl className="fab-layout-rules" hidden={!yieldOpen}>
          {LAYOUT_RULES.map((rule) => (
            <div key={rule.label}>
              <dt>{rule.label}</dt>
              <dd className={rule.tone === 'good' ? 'is-good' : rule.tone === 'bad' ? 'is-bad' : ''}>
                {rule.value}
              </dd>
            </div>
          ))}
        </dl>
        <footer hidden={!yieldOpen}>
          {!wallet
            ? 'Demo layout · this device only'
            : saveState === 'saving'
              ? 'Saving layout…'
              : saveState === 'error'
                ? 'Could not save — retrying'
                : 'Layout saved to your fund'}
        </footer>
      </aside>

      <div className="fab-sandbox-controls">
        {selectedMachine ? (
          <><b>{selectedMachine.label}</b><kbd>R</kbd><span>Rotate</span><kbd>DEL</kbd><span>Store</span></>
        ) : (
          <><span>Pick a desk, then click a tile</span><kbd>DRAG</kbd><span>Pan</span><kbd>SCROLL</kbd><span>Zoom</span></>
        )}
      </div>

      {demo && (
        <div className="fab-demo-exit">
          <span><b>DEMO MODE</b><small>No wallet. Layout saved only on this device.</small></span>
          <Link href="/start">Create your fund</Link>
        </div>
      )}
    </main>
  );
}
