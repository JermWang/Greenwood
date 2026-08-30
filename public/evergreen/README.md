# EVERGREEN — rollout package

Token: **$GREEN** · Chain: Robinhood Chain (4663)

Every figure and prop in here is a render of the game's own shipped geometry —
the repo's `tmp/glb/*.glb` exports — lit with the rig from
`components/iso/IsoScene.tsx` (ambient 0.55, hemisphere #cfe0ee/#6d6154 at 0.85,
warm key #ffeeda 2.0 at [16,24,10], cool fill #9fbcd6 0.5 at [-14,9,-12], ACES
tone mapping at 1.06) and shot through ONE orthographic isometric camera at
ISO_OFFSET [26,26,26].

Nothing in this kit names the turn.

## Artboards

| File | Size | Use |
|---|---|---|
| 02-cast-sheet.png | 1600×1293 | The 19 residents, the player, and the two hostiles |
| 03-world-map-1240x1060.png | 1240×1060 | All eight regions, gates and roads |
| 04-keyart-grounds-1600x900.png | 1600×900 | Evergreen Grounds — the hub |
| 05-keyart-treeline-1600x900.png | 1600×900 | The Treeline — past the fence |
| 06-keyart-deep-forest-1600x900.png | 1600×900 | The Deep Forest — extraction only |
| 07-world-props.png | 1600×548 | The 17 set-dressing models |
| 08-og-share-card-1200x630.png | 1200×630 | Open Graph / Twitter card |
| 09-x-banner-1500x500.png | 1500×500 | X profile header |
| 10-pfp-1000x1000.png | 1000×1000 | Avatar — circle-crop safe |
| 11-square-post-1080x1080.png | 1080×1080 | Feed post |
| 12-launch-announce-1600x900.png | 1600×900 | Launch announcement |
| 13-launch-thread-1..4-1200x675.png | 1200×675 | Four-part launch thread |
| 14-ingame-launch-modal-1600x900.png | 1600×900 | In-game token-live modal |
| 15-green-tokenomics-card-1080x1350.png | 1080×1350 | $GREEN model |
| 16-poster-1000x1414.png | 1000×1414 | Print poster |
| 17-sticker-sheet-1200x900.png | 1200×900 | 16 stickers / emotes |
| 18-press-one-pager-850x1100.png | 850×1100 | Press sheet, US Letter |
| 19-brand-guidelines-1000x1400.png | 1000×1400 | Colour, type, model usage |

## Sprite library

Transparent PNGs, trimmed to silhouette. All rendered at the SAME camera scale
— **119.07 px per world unit** — so any sprite composites against
any other at true relative scale. Never rescale one on its own.

- `sprites/characters/` — 19 residents + player operator + wolf + shambler
- `sprites/world/` — 17 outdoor and dressing props
- `sprites/desks/` — Equity, Treasury, Liquidity, Structured
- `logo/` — the mark, and its inverse for neon grounds

### Isometric placement

For a sprite at world position (x, z) on a ground plane:

    screenX = originX + (x - z) * 0.8660254 * 119.07 - anchorX
    screenY = originY + (x + z) * 0.5       * 119.07 - anchorY

Draw in ascending (x + z) order for correct occlusion. Per-sprite anchors are in
`sprites/manifest.json`.

## The cast

Colourways read straight out of `lib/npcs.ts` — jacket, cap, trim, gloves,
boots and skin tone. Staff wear a contrasting trim players cannot buy, which is
what makes "that is staff" a silhouette judgement at any distance.

| Name | Role | Region | Sprite |
|---|---|---|---|
| Operator | Player avatar | All regions | `operator.png` |
| Dez Okafor | Floor Technician | Grounds | `npc-dez.png` |
| Marta Vane | Quartermaster | Grounds | `npc-marta.png` |
| Halvard Reyes | Perimeter Watch | Grounds | `npc-hal.png` |
| Iris Sunna | Exchange Clerk | Grounds | `npc-iris.png` |
| Beatrix Coyle | Retired Operator | Grounds | `npc-bess.png` |
| Pim Vasquez | Floor Engineer | Machine Room | `npc-pim.png` |
| Tobi Adeyemi | Materials Clerk | Machine Room | `npc-tobi.png` |
| Nell Braithwaite | Load Scheduler | Machine Room | `npc-nell.png` |
| Sunil Rao | Outfitter | Trading Floor | `npc-sunil.png` |
| Greta Lindqvist | Note Desk | Trading Floor | `npc-greta.png` |
| Abe Ferreira | Allocations Runner | Trading Floor | `npc-abe.png` |
| Col Whitmore | Front of House | Evergreen HQ | `npc-col.png` |
| Yusuf Demir | Grounds Keeper | Evergreen HQ | `npc-yusuf.png` |
| Rae Okonkwo | Yard Supervisor | Evergreen HQ | `npc-rae.png` |
| Bram Halloway | Forestry Lead | Treeline | `npc-bram.png` |
| Nesrin Kaya | Track Warden | Treeline | `npc-nesrin.png` |
| Ollie Sparrow | Log Buyer | Treeline | `npc-ollie.png` |
| Judd Marrow | Salvage Buyer | Deep Forest | `npc-judd.png` |
| Wen Xiuying | Line Inspector | Deep Forest | `npc-wen.png` |
| Shambler | Hostile · 18 damage | Treeline · Deep Forest | `shambler.png` |
| Wolf | Hostile · 7 damage | Deep Forest | `wolf.png` |

## Brand rules

- **Robin Neon `#CCFF00` is the only brand colour.** It is extremely bright, so
  it always carries dark text — never white.
- Reserve it for the mark, primary actions, live state, signage and positive
  values. The Heather greys and the world materials carry everything else.
- Never paint a desk body or a jacket in the brand colour. The neon on a desk is
  a signage strip or a status lamp.
- An asset whose silhouette edge is `#CCFF00` cannot sit on a `#CCFF00`
  ground — use `ev-mark-inverse.svg` for the mark on neon.
- Display type: Space Grotesk, 600 weight, tight negative tracking.
  Mono: JetBrains Mono, 7–9px at .16–.25em tracking, uppercase. Never body copy.

## Known gap

The character GLB exports with a fixed cap, so the residents' hat *silhouettes*
(hardhat, bucket, beanie, visor, bare) do not vary yet — only colour does. Fix by
exporting per-hat GLBs from `/dev/assets`.
