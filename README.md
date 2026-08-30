# Evergreen

An idle DeFi yield game on Robinhood Chain — an EVM L2 settling on Ethereum
(chain ID 4663, gas token ETH). Token: **BNTY**.

The front is a Real-World-Asset fund. You open desks, they produce yield, you
route it, upgrade them, arrange your floor for the layout bonus, and compete on
a leaderboard. Then you go outside, and the game turns out to be about
something else.

The design of that turn is in [`docs/evergreen-turn.md`](docs/evergreen-turn.md).
Read it before touching regions, packs, loot, or anything outdoors — it is the
spine the world hangs off, and it is easy to break by accident.

## What is built

- **The idle game.** Equity and Treasury desks, instrument sockets with rarity
  tiers, sealed allocations, Fixed Income Notes, a player-to-player market, and
  a floor-layout bonus that makes desk placement a real decision rather than
  storage.
- **A walkable world.** Evergreen Grounds is the hub; the Machine Room, Trading
  Floor and Evergreen HQ are buildings you walk into, and the Treeline and Deep
  Forest are outdoors. There is no nav rail — navigation happens by walking,
  and doors transition you when you stand in them.
- **Woodcutting and crafting.** A species ladder gated by axe tier, a craft
  bench that turns timber into axes, crossbows, bolts and desk frames, and
  material costs on desks that scale with level.
- **Survival.** The Deep Forest has hostiles, PvP, and extraction gates. Dying
  spills your pack where you fell. Movement and loot proximity are resolved
  server-side against recorded state, never against a coordinate in a request.
- **Nineteen residents** across every region, whose dialogue is level-gated so
  the world gets quietly stranger as you get further in.

## On-chain settlement

There are **no custom contracts**. Every spend is an ordinary ERC-20 transfer
between the player and the treasury, which keeps the audit surface at roughly
zero and puts the entire burden on the server verifying correctly.

A spend runs quote → pay → settle: the server prices the action and records a
nonce, the player sends that many BNTY themselves, and the server reads the
receipt and verifies the token's own `Transfer` event before applying anything.
A nonce is only redeemable at the action it was priced for, a transaction hash
can back exactly one settlement, and quotes expire.

Payouts run the other way — the protocol signs from a Privy server wallet, so
no private key is ever held by this app. Claims consume the accrual *before*
sending, because the alternative lets the same rewards be claimed twice; a
transfer that fails afterwards is recorded as a debt rather than lost.

## Operations

| Route | What it is for |
|---|---|
| `GET/POST /api/admin/backup` | List or force a database snapshot |
| `GET /api/admin/solvency` | What the ledger promises vs. what the treasury holds |
| `POST /api/admin/solvency` | Pause or resume payouts — the emergency brake |
| `GET/POST /api/admin/owed` | List debts from failed payouts, and retry one |
| `POST /api/admin/reset` | Wipe game state. Refuses once the token is live |

All of these take `Authorization: Bearer $OSR_ADMIN_TOKEN`.

**The database is the money.** `users.osr_balance` is the number that becomes
real tokens, there is no replica, and snapshots survive the process but not the
volume — shipping them off-box is still outstanding. Take one before any
migration.

**Launch order matters.** Desks created before settlement is switched on keep
accruing, and those accruals become real payouts afterwards. Wipe *before*
configuring the token address, not after.

## Run

```bash
npm install
```

```bash
npm run dev
```

Copy `.env.example` to `.env.local`. Never put a private key in a
`NEXT_PUBLIC_*` variable or commit one.

Two naming traps that will cost you an afternoon: the environment variables are
still `OSR_*` and the stored column names are still `osr_*`, deliberately, while
the TypeScript that reads them is not. `OSR_DATA_DIR` throws on boot if it is
wrong, which is the safe direction — see the Names section of `CLAUDE.md`.

Supabase backs profiles, presence and the leaderboard only; no money touches it.

```bash
npx supabase link && npx supabase db push
```

## Verification

```bash
npm run typecheck && npm test
```

```bash
npm run test:rpc
```

`npm test` is the full Vitest suite. `test:rpc` checks the live chain ID and
block height against a real RPC.

To exercise settlement against a real chain without real money, point
`NEXT_PUBLIC_RH_NETWORK` at `testnet` (chain 46630), or run any local EVM on
chain 4663 and set `NEXT_PUBLIC_RH_RPC` — the quote/pay/settle path and every
guard on it can then be driven end to end.

## Layout

- `src/app` — App Router pages and the API routes that are the game backend
- `src/lib` — the rules: economy, rarity, capital, crafting, settlement, maps
- `src/components/iso` — the isometric world (scenes, characters, camera rig)
- `src/components/ui` — HUD and panels
- `src/components/three` — the free-camera pieces (allocation reveal, previews)
- `docs/` — the design of the turn, and the rendering conventions
- `public/` — the Evergreen mark, and nothing else

## Art

Everything visible is built from primitives in code. There are no image, model
or environment-map assets — the artwork from the previous themes was removed
wholesale, and commissioned Evergreen art will land here when it exists.

`/dev/assets` renders every model in the game on a turntable. Look at anything
you add there before wiring it into a scene.

## Before you write rendering code

[`docs/iso-conventions.md`](docs/iso-conventions.md), which is not optional. The
line that matters most: **there is already a camera — use `IsoRig`.** A second
rig has been built at least once, next to a working one, and cost three
sessions.
