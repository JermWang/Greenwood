# GPU — Graphics Processing Utility

A DeFi farming and fab-management game on Robinhood Chain — an EVM L2 settling
on Ethereum (mainnet, chain ID 4663, gas token ETH). Start with a wafer fab,
expand into cleanrooms, equip rarity-tiered silicon machinery, open supply pods,
route GPU yield, upgrade the campus, and compete in the Silicon Race.

GPU presents the protocol as a complete semiconductor-fab operating system. The
public experience is built around cleanroom production, silicon throughput,
equipment routing, reserve telemetry, and a playful industrial campus. Existing
settlement and economic compatibility stays behind that product boundary:

- **Procedural Three.js fab equipment** — Lithography Machine, Wafer Stack,
  Dicing Saw, Packaging Line, EUV Utility Core, and AI Accelerator Test Rack
  models are reconstructed in code from a unified
  Wii-like 3D reference set. Named pivots, sockets, colliders, and destruction
  groups keep the equipment animation-ready and diffable.
- **GPU-native fab OS** — a left operations rail, route-specific command
  surfaces, mobile module dock, live digital twin, component staging bay, chip
  exchange, treasury reactor, network model, and race circuit replace the old
  product hierarchy. Historical database keys stay private to the compatibility
  layer so existing state and integrations continue to work.
- **Privy embedded wallets** — email, Google, or wallet login provisions a
  persistent embedded EVM hot wallet for every player. MetaMask, Rabby, and
  Robinhood Wallet can still be linked. Every server-side write verifies both
  the Privy access token and the wallet contained in the signed identity token.
- **No pretend settlement** — generated guest wallets, starter credits,
  simulated network participation, fabricated reserve addresses, and local
  transaction signatures are removed. Financial mutation
  routes remain locked until audited GPU token, game, vault, and treasury
  deployments are configured.
- **Mainnet safety lock** — the legacy local mutation escape path is removed.
  Financial routes remain unavailable until audited mainnet contracts and
  server-side transaction receipt verification are deployed.
- **Global player network** — Supabase stores persistent wallet-keyed profiles,
  session and game activity history, online presence, and the shared leaderboard.
  Public clients have read-only access; all writes use server-only credentials,
  row-level security, and idempotency keys. The session heartbeat only opens a
  new session row after 30 idle minutes, so polling cannot flood history.
  Server-side request rate limiting is still outstanding and should be in place
  before the game is opened to the public.

The default Privy integration is an embedded user-wallet flow, not regulated
third-party custody. Privy custodial wallets currently require its Enterprise
plan, a supported custody partner such as Bridge, and beneficiary KYC. Do not
describe embedded wallets as licensed custody unless that separate program has
been approved and configured.

## Run

```bash
npm install
npm run dev   # http://localhost:3000
```

Copy `.env.example` to `.env.local` and configure a production Robinhood Chain
RPC plus the deployed contract addresses. Never put private keys in a `NEXT_PUBLIC_*`
variable or commit them to the repository.

Create a Supabase project, link it with the Supabase CLI, and apply the checked-in
schema before starting the app:

```bash
npx supabase login
npx supabase link
npx supabase db push
```

Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and the
server-only `SUPABASE_SECRET_KEY`. The migration in `supabase/migrations` enables
RLS plus Realtime for profiles and activity history.

## Verification

```bash
npm test             # wallet discovery, switching, balance, and API guards
npm run test:rpc     # live mainnet chain ID/block verification
npm run typecheck
npm run build
```

## Layout

- `src/app` — Next.js App Router pages + API route handlers (the game backend)
- `src/lib` — game rules: rarity system, economy constants, DB
- `src/components` — UI (tabs, HUD) and the Three.js scene
- `public/assets/fab` — generated reference images for the procedural fab assets
- `design-qa-evidence/fab-sculpts` — img2threejs intake and reconstruction evidence
- `public/models/authored` — retained legacy source models (not used by the new facility scene)
- `public/models/crates` — the retained v2 crate models
- `public/models/original` — the original Blender-exported sand/source GLBs
- `public/models/runtime` — derived Meshopt/WebP copies used by the live scene
- `ORS MODELS/` — source art and delivery packages (kept locally)

## Rebuild optimized model copies

The runtime assets can be regenerated without modifying the authoritative
exports. The script imports each source into a clean Blender scene and only
writes to `public/models/runtime`:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup --python scripts\optimize-authored-models.py
```
