# Evergreen — orientation

Read this first. It is short on purpose; the detail is in `docs/`.

## What this is

An idle DeFi yield game (token **GREEN**, Robinhood Chain) with a hidden layer.
The front is a Real-World-Asset fund: desks produce yield, you upgrade them, you
compete on a leaderboard. The turn — revealed environmentally between levels 3
and 10, never in a cutscene — is that **the yield is power and the desks are
generators**, and Evergreen is one of the last lit settlements in a zombie
apocalypse.

Full design: **`docs/evergreen-turn.md`**. Read it before touching regions,
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
| `osrBalance`, `osrAmount`, … | `greenBalance`, `greenAmount`, … |
| CSS `fab-*`, `gpu-*` | `eg-*` |
| package `gpu-fab-game` | `evergreen` |

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

### The third rename: Greenwood → Evergreen

The settlement, the fund and the package were called **Greenwood** until this
pass. Identifiers, CSS classes, copy, region ids (`greenwood-hq` →
`evergreen-hq`), shard ids and docs all moved together, and none of it needed a
migration: `expedition_state` has no region column and `loot_piles.region_id`
only ever receives a hostile region, so no `greenwood-*` value has ever reached
SQLite. That was checked before the rename, not assumed.

Three things were handled differently, and all three will surprise you:

- **Both domains are live, and that is deliberate.** `playevergreen.xyz` is the
  real one and the value of `NEXT_PUBLIC_SITE_URL`; `playgreenwood.xyz` still
  resolves and still serves, because links and share cards posted before the
  move point at it. The X account moved to `@evergreen_rh` — one constant,
  `X_URL` in `lib/config`, since `X_HANDLE` is derived from it rather than
  written out twice.

  Two things about this that are not obvious. The plan caps custom domains at
  TWO per service, so there is no `www` on either name and adding one means
  first turning a domain into a registrar-level redirect to free the slot.
  And the SIWE domain is NOT configuration: `api/auth/verify` checks the
  message against the request's own `Host`, so it follows whichever domain the
  player arrived on, and both work without a code change. That is also why a
  domain must never be pointed at the app before it is attached here — a host
  the server does not expect is a host sign-in rejects.
- **`OSR_DATA_DIR` is `/data/greenwood` and MUST STAY THAT WAY.** It is the
  directory the live SQLite database sits in, on a volume mounted at `/data`.
  Everything else on Railway was renamed to Evergreen — project, service,
  volume label, generated domain — but this one is a PATH, not a label:
  pointing it at `/data/evergreen` does not move the database, it creates an
  empty directory beside it and boots the game with no players, no balances and
  no funds. It moves only behind a deliberate copy, with backups, and never as
  part of a rename.
- **The ticker is GREEN, but the DEPLOYED TOKEN IS NOT.** The contract at
  `NEXT_PUBLIC_OSR_TOKEN` reports `symbol() = "BNTY"` and `name() = "Greenwood"`,
  and both are immutable. `EXPECTED_TOKEN_SYMBOL` in `lib/config` therefore
  still reads BNTY on purpose: `settlement-client` compares it against the
  contract and REFUSES TO BUILD A TRANSFER when they disagree, so "finishing"
  that rename would not rename anything — it would block every on-chain
  transaction in the game. It moves when a GREEN token is deployed, in lockstep
  with the address. A connected wallet also shows the chain's symbol, so it
  reads BNTY where the rest of the game reads GREEN; that is the deployed token
  being older than the name, and it is not a bug to "fix" in the UI.
- **Browser storage keys were renamed WITH a carry-over** (`lib/legacy-keys`).
  Storage is the third place state lives, after env vars and columns, and the
  argument that froze `OSR_*` applies to it: `gw-wallet-store` holds terms
  acceptance and the onboarding list, `evergreen_demo` holds somebody's
  half-built demo fund. Here the carry-over was cheap enough to do properly
  instead of freezing the name, so the new names are authoritative and the old
  ones are read once and copied forward. That file is the entire list and can be
  deleted when the old keys have aged out.
- **`public/GREENWOOD/`** is gitignored marketing output. Not served, not built,
  not renamed.

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

- **630 tests pass.** The suite is green; if it is not, that is new. (It was 639
  before `lib/next-step` went with the dashboard panel that was its only caller.)
- **The introduction DEFERS steps it cannot act on** rather than stopping at
  them (`canAct` in `lib/intro`, context assembled in `api/intro/[wallet]`).
  Five of the ten steps wait on a random find, money not yet earned, or another
  player having listed something, and the chain used to halt at the first of
  them with both outdoor steps stranded behind it — on a real account that was
  step three of ten, because the starter grant is zero once the token is live.
  If you add a step that can be blocked by anything the player does not
  control, give it a `canAct` and a `waiting` line, or you have rebuilt the
  wall.
- **The title screen renders the live Deep Forest.** `TitleCinematic` mounts the
  real `DeepForestScene` behind the lockup and drives `IsoRig`'s `followRef`
  along a slow rail — there is no second camera and no video file. The
  consequence worth knowing: **the landing page is now a consumer of
  `DeepForestScene`**, so a change to the region's lighting, props or ground
  shows up on the front page too. Its two title-only deviations (a fill light,
  and a quieter tile grid via `gridStrength`) are argued at the component.
- The Deep Forest is playable: map, server-authoritative movement, loot
  visibility, extraction geometry, HUD, and combat against shamblers and wolves.
- **PvP is live.** Players see each other, can strike each other, and dying
  spills the pack as a loot pile where you fell. Creature bites kill too — both
  routes go through one damage() so there is a single definition of dying.
- **Evergreen Grounds is the hub, and it is what makes the no-nav-rail rule
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
- **`/app` is a DOOR, not a dashboard.** It holds your avatar on a turntable and
  one button, aimed at the region you were last standing in — nothing else. It
  used to be eleven panels of read-outs about a game you were not yet in, which
  made the screen you looked at most the screen where nothing happened.

  The rule that made the deletion safe is the one below about gates and callers,
  applied in reverse: **every verb the dashboard owned had to land somewhere in
  the world before its panel could go.** Two of them only lived there, and both
  moved into the Machine Room, at the desk they concern —
  `api.openCrate` (which has always taken a target desk, and on the dashboard
  got whichever row you happened to have selected) and `upgradeCompound` /
  `expediteCompound`, now "Floor capacity" under the desk book, beside the count
  it raises. Route, level-up and build were already there.

  The resume target is `lib/last-region`: per-browser, client-side, and never
  trusted — the dashboard checks it against `/api/regions` before offering it,
  and the region page gates again on arrival. A remembered region that has since
  closed falls back to the Grounds. If you add a region, give its page
  `useRememberRegion` or the button will never send anyone back to it.
- **The HUD is budgeted, and the budget is about a tenth of the screen.** It was
  measured at 34% of a 1280x720 board — a 70px top bar, a 380x193 guide, and two
  corner panels of ~220px each sitting over the near half of the room. It is 17%
  with the guide open and 9% with it closed. If you add a panel, measure.

  Three things hold that, and all three are easy to undo by accident:

  - **The room panels start FOLDED** and remember what the player chose
    (`togglePanel` in `IsoFloor`). Persistence is written on the CLICK, not in an
    effect watching the state — the effect version needed a "skip the first
    write" ref, and a ref survives React's dev double-invoke while state does
    not, so it saved the default over the value it had just restored.
  - **`[hidden]` is honoured globally**, last rule in `globals.css`. The
    attribute only carries `display: none` from the UA sheet, so any author rule
    setting `display` beats it. That was tracked by a hand-maintained list of
    four selectors, and `.eg-layout-rules` had already fallen off it.
  - **No scene computes its height from the top bar.** The bar is sized by its
    contents (53px desktop, 55px mobile), so every `calc(100svh - <constant>)`
    is a guess that was wrong on one of them. `.eg-sandbox` and `.df-page` both
    use `position: absolute; inset: 0` against the positioned `.eg-stage-content`
    instead — a definite height at every viewport, with no number to keep in step.
- **The introduction is a CHECKLIST**, and the code used to argue at length that
  it must not be. The old reasoning — ten tasks on a fresh account is a wall, and
  a wall gets dismissed — was right about walls and wrong about what replaced
  one: showing only the current step meant nothing on screen said the
  introduction was finite. Ten rows with three ticked is evidence; "3 / 10" in a
  corner is a claim. The wall is avoided by the rows being one line each with
  **only the current row opening**, carrying its `why`, its reward and its one
  call to action. Keep that shape — a panel where every row expands is the wall
  again.

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
