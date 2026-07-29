# Greenwood — orientation

Read this first. It is short on purpose; the detail is in `docs/`.

## What this is

An idle DeFi yield game (token **BNTY**, Robinhood Chain) with a hidden layer.
The front is a Real-World-Asset fund: desks produce yield, you upgrade them, you
compete on a leaderboard. The turn — revealed environmentally between levels 3
and 10, never in a cutscene — is that **the yield is power and the desks are
generators**, and Greenwood is one of the last lit settlements in a zombie
apocalypse.

Full design: **`docs/greenwood-turn.md`**. Read it before touching regions,
packs, loot or anything outdoors.

## Before you write rendering code

**`docs/iso-conventions.md`.** Non-optional. It documents `IsoRig`, tile picking,
markers, labels, instancing and the SSR trap — every one of which has been
re-invented at least once, and one of which cost three sessions of bugs because
a second camera rig got built while a working one sat two files away.

The single line that matters most: **there is already a camera. Use `IsoRig`.**

## Names

The codebase passed through two earlier themes — oil/mining, then GPU
fabrication — and for a long time the internal identifiers were deliberately
left in that state, on the reasoning that a player opening devtools should find
the industrial truth before the game tells them.

**That decision was reversed.** The identifiers now match the skin:

| Was | Is |
|---|---|
| `oil_rig` / `mine_shaft` | `equity_desk` / `treasury_desk` |
| `rig_crate` / `shaft_crate` | `equity_allocation` / `treasury_allocation` |
| `euv` / `packaging` machine kinds | `equity` / `settlement` |
| `wafer`, `cleanroom` | `desk`, `vault` |
| `osrBalance`, `osrAmount`, … | `bntyBalance`, `bntyAmount`, … |
| CSS `fab-*`, `gpu-*` | `gw-*` |
| package `gpu-fab-game` | `greenwood` |

Two categories were **deliberately not renamed**, and both will bite you if you
assume otherwise:

- **Env vars are still `OSR_*`** (`OSR_DATA_DIR`, `NEXT_PUBLIC_OSR_TOKEN`,
  `NEXT_PUBLIC_GPU_TOKEN_SYMBOL`, …). Renaming them means changing Railway in
  lockstep, and `OSR_DATA_DIR` throws on boot if it is wrong. The TypeScript
  constants that read them were renamed; the strings were not.
- **Stored column names are still `osr_*`** (`users.osr_balance`,
  `rig_crates_opened_today`, `price_osr`). `osr_balance` is the column real
  payouts are computed from — it gets renamed after backups exist, not before.

Stored *values* were migrated (`renameAllocationKinds` in `lib/db`), because a
CHECK constraint the code violates is a bug no fresh-database test can see.
`nodes.family` still stores `'oil'`/`'mine'` for the same reason the columns do.

Player-facing vocabulary: Warehouse→Portfolio, Equity Desk, Treasury Desk,
node→desk, crate→allocation, component→instrument, Capacity Contract→Fixed
Income Note, Trading Floor, The Vault.

## Rules that are load-bearing

- **Robin Neon `#CCFF00` is for branding, signage, UI and status — never the
  world.** The world is lit in ordinary colour under neutral light. Broken and
  reverted twice.
- **The server owns anything that can be contested.** Terrain lives in
  `lib/deep-forest-map` with zero imports so the renderer and the server read one
  definition. Position and loot proximity resolve server-side against recorded
  state, never against a coordinate in a request body.
- **`CARRIABLE` in `lib/packs` is an allowlist.** It decides what a player can
  lose. A denylist would fail open.
- **Navigation happens in the world.** There is no nav rail and no dock — the
  Exchange HUD is the single deliberate exception, because checking prices
  mid-run is a decision input rather than a destination.

## Working here

- `npm run dev` — app. `npx tsc --noEmit` and `npx vitest run` before calling
  anything done.
- `/dev/assets` — every model in the game on a turntable. **Look at anything you
  add here before wiring it into a scene.**
- `NEXT_PUBLIC_OSR_DEV_WALLET` in `.env.local` skips Privy sign-in and opens
  region gates locally. Null in every production build (`lib/dev-mode`).
- Comments explain **why**, not what. Several in this codebase record a bug that
  a plausible-looking change would reintroduce — those are the important ones.

## Known state

- **588 tests pass.** The suite is green; if it is not, that is new.
- The Deep Forest is playable: map, server-authoritative movement, loot
  visibility, extraction geometry, HUD, and combat against shamblers and wolves.
- **PvP is live.** Players see each other, can strike each other, and dying
  spills the pack as a loot pile where you fell. Creature bites kill too — both
  routes go through one damage() so there is a single definition of dying.
- **Greenwood Grounds is the hub, and it is what makes the no-nav-rail rule
  true.** Doors to the Machine Room, the Trading Floor and the Treeline are
  placed in `lib/grounds-map` and walked to. Movement there is client-side on
  purpose — nothing in that region can be contested — but the gate still runs
  server-side, at `/api/regions/enter`.
- **The Treeline is in `REGIONS` and has no scene.** It is the one region left,
  and it is not a scene job: it has hostiles and a pack, so movement has to be
  server-authoritative, and `lib/expedition` is currently hardcoded to
  `deep-forest` (it imports `isWalkable` straight from `deep-forest-map` and
  passes the region id as a literal in four routes). Making that region-aware is
  the real work; the scene is the easy half.
- **Enterable buildings exist now**, in the sense that mattered: the Machine Room
  and the Trading Floor are buildings in the Grounds that you walk into. The
  Deep Forest's generators are still solid props.

## Two things that were built and wired to nothing

Worth knowing because the pattern recurs here, and both cost a session to find:

`nextRegion()`, `availableRegions()`, `api.regions` and `/api/regions/enter`
were all written, commented and tested — and called by no UI at all, so a player
could reach the level cap without ever learning the outdoors existed. Likewise
`upgradePack()` had no route, which meant every `requiresPack` gate was
permanently shut and the introduction's Scrip budget was tuned to buy something
unbuyable.

**A gate with no UI is a locked door. A helper with no caller is a plan.** When
you add either, add the thing that calls it in the same pass, or write down that
you did not.

## A trap this codebase already fell into

**Never put session state in module-level variables.** Next bundles each route
handler separately, so a `Map` in `lib/expedition` is a *different* Map for
`/expedition/step` than it is for `/expedition/state`.

Player position and health were written that way, on the reasoning that they
change constantly and do not outlive a session — correct about the data, wrong
about the runtime. The symptom was a player who moved successfully and was then
told to "take a step first" when they tried to attack, because the attack route
had never seen them move.

It lives in SQLite now (`expedition_state`, `creature_state`): local,
synchronous, single-row upserts. The cost is nothing and it actually works.
