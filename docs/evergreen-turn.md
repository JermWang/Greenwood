# The Turn

Design spec for Evergreen's hidden layer: what the game is really about, how the
reveal is paced, and what has to exist for the Deep Forest to work.

This is a design document, not a record of built code. Nothing below is
implemented yet.

---

## 1. The premise

Evergreen presents as a Real-World-Asset yield game. You run a fund, your desks
produce BNTY, you upgrade them, you compete on a leaderboard. Nothing in the
first hour suggests otherwise, and nothing in the first hour is a lie.

The turn is that **the yield is power, and the desks are generators.** Evergreen
is one of the last lit settlements. What your fund "produces" is what keeps the
floodlights on. The reason instruments are scarce is that nobody manufactures
them any more — every one is salvage. The reason the emission schedule halves is
that the grid is dying.

The player is never told this. They work it out.

### The detail that makes it land

The reskin never renamed the internal identifiers. In the code as it stands
today, an Equity Desk is an `equity_desk`, a Treasury Desk is a `treasury_desk`, the
allocation crates are `equity_allocation` and `treasury_allocation`, and the CSS is prefixed
`eg-*`. That was a pragmatic decision about churn.

It is now canon. The corporate skin is the layer on top; the machinery
underneath was always industrial, and a player who opens devtools finds the
truth before the game tells them. Do not "clean this up" — it is foreshadowing
that costs nothing to maintain.

---

## 2. Pacing the reveal

The reveal is environmental. No cutscene, no exposition dump, and crucially **no
change to the mechanics the player already understands** — the same desks, the
same yield, recontextualised.

| Stage | Level | What the player sees | What they conclude |
|---|---|---|---|
| **Clean** | 1–2 | Corporate Evergreen exactly as it ships today | Nothing is wrong |
| **Wrongness** | 3–5 | Machine Room windows are boarded from the *outside*. Ticker headlines repeat with the same date. The Handbook has a redacted page. | Something is off, probably flavour |
| **Perimeter** | 6–9 | Evergreen Grounds unlocks. A fence. Floodlights aimed *outward*. Permanent overcast dusk. A locked gate with a queue of nobody. | This is not an office park |
| **The Turn** | 10 | Deep Forest unlocks. Full reveal. | Oh. |

The Grounds are the load-bearing stage. They must read as *pleasant* on first
visit — a park, a place to gather — and only reward a second look. The fence is
visible from the start; what changes is that at level 6 you can walk to it.

### Vocabulary after the turn

Nothing renames in the UI. The player's *reading* of the words changes, which is
the whole trick:

- Yield → what the settlement runs on
- Fixed Income Notes → power purchase agreements with the settlement
- The Vault → the bunker
- Instruments → salvaged parts (they always were)
- Leaderboard → who is keeping the most lights on

---

## 3. Zones

Three new regions, connected in a ring rather than a star so travel has
geography.

### Evergreen Grounds — level 1, safe
The first outdoor area. Bounded, no ceiling, tree lines and paths instead of
walls. Gathering nodes for quests. Roughly 4× the Machine Room's footprint.

### The Treeline — level 6, PvE only
Transition. Fog begins, light goes amber, the first shamblers appear — slow,
avoidable, and they do not chase past the boundary. This zone exists to teach
the combat loop somewhere it cannot cost you anything.

### The Deep Forest — level 10, PvP + PvE
Abandoned generator sites, collapsed substations, machine parts worth bringing
home. Dense fog, night lighting, no minimap. **Target size: 20–30× the Machine
Room.** See §7 for what that costs engineering-wise — it is the single biggest
technical item in this document.

---

## 4. PvP, and the rule that makes it survivable

Instruments and desks are tokenized. If another player can take them, Evergreen
becomes a venue where players lose real money to each other, which is a
different product with a different legal posture. It is also worse design.

**The rule: you can only lose what you carried in.**

- Entering the Deep Forest flags you for PvP. Entering is the consent.
- Everything you find goes in your **pack** (§4.1), which starts empty each run.
- Death spills the pack's contents where you fell. Anyone can loot them.
- **Only what is in the pack is at risk.** See §4.2 for the exact list.
- Salvage only becomes a real asset when you **extract** — carry it to a
  boundary gate and leave voluntarily.

This is the extraction-shooter loop, and it is doing three jobs at once: it
makes PvP consensual, it caps the downside at "an hour of my time", and it
generates the tension that makes the zone worth entering. The greedy player who
stays for one more generator is the entire game.

### 4.1 The pack

**A pack is required to enter the Deep Forest, and it is bought with Scrip.**

This is the single best structural decision in the design, and it is worth
spelling out why: it means **every player in the zone has something to lose.**
The failure mode of an open-PvP area is the player who enters carrying nothing,
because they cannot be punished and exist only to ruin other people's runs — the
zero-risk ganker. Requiring a purchased pack at the door removes them. A hunter
is now a player betting a pack that they can take yours, which is a fight worth
having.

Priced in Scrip rather than BNTY on purpose. `spendScrip` already spends **bound**
Scrip before **bearer**, so a player who earns their Scrip through quests and
streaks can supply themselves indefinitely without ever touching the token, while
a player in a hurry can buy in. The risk dial is entirely server-side.

**The pack is permanent.** You buy it once and you always have it. It is never
dropped, never traded, never taken. What drops on death is what was *inside* it.

**Capacity is the upgrade track.** The pack has slots, bought up with Scrip in
steps. Capacity is the whole risk dial: a bigger pack means a longer run before
you have to extract, and more sitting in it when someone kills you. Choosing when
to turn back is the decision the pack exists to create.

| Step | Slots | Reads as |
|---|---|---|
| Satchel | few | "I'm scouting" |
| Field pack | moderate | the default run |
| Hauler | many | "I intend to come back rich" |

**On death** the contents spill as a pile where you fell. The pile is a plain
container: no owner, no timer beyond a despawn, nothing bound to the killer.

**Walk-up preview — proximity only, and private.** You see what is in a pile only
by **physically standing next to it**. There is no click-to-inspect from range and
no shared broadcast; the contents resolve for the player who walked up, and only
for them.

This is the important constraint, and it should be enforced server-side rather
than by hiding a tooltip: the contents of a pile are **not sent to a client that
is not adjacent to it.** Otherwise the read is free — anyone could scan every pile
on the map from cover, and approaching would stop being a decision.

Because approach is the only way to know, approach *is* the commitment:

- You cannot tell a rich pile from a poor one until you are standing on it, which
  is exactly where you are most vulnerable.
- A pile near cover is bait whether or not anyone planted it there, because the
  only way to evaluate it is to walk into the ambush.
- Two players converging on the same pile are both gambling on something neither
  has seen.

**Taking it.** One action: **loot**, moving items into your own remaining slots.
There is no picking up the container, because there is no container to pick up.
What you cannot carry stays on the ground for whoever comes next.

**Consequence to watch (open):** because the pack is permanent, a player who owns
one can enter carrying nothing and hunt at zero risk — the zero-risk ganker the
pack purchase was going to remove. The purchase gates *access* but no longer
gates *each run*. Two candidate fixes, neither built:

1. A small Scrip **entry toll** per run, which rides in the pack and drops with
   everything else. Preserves the permanent pack and restores per-run stake.
2. A flat Scrip **death penalty** in the zone, independent of what you carried.

Recommendation: (1). It keeps every loss inside the pile, so the rule stays "you
lose what you carried", with no second and separate punishment to explain.

### 4.2 What can and cannot be lost

The line is **carried, not owned.** Only what is in the pack at the moment of
death spills. Anything installed, worn or held at home is untouchable — not
because it is safe by category, but because it was never in the zone.

**Drops on death:**
- Scrip carried in the pack (bearer only — bound Scrip is not transferable by
  definition, so it cannot be looted and must not be carryable)
- Upgrade components and instruments carried as cargo
- Salvaged machine parts, generator cores, and anything else picked up in the zone
- Ammunition and consumables

**Never drops, ever:**
- The pack itself, at any capacity
- Cosmetics and mounts — these are marketplace goods between players and are out
  of scope for combat, permanently
- **Desks installed on your floor, and instruments fitted to them.** These are not
  "protected"; they are simply not carryable, so they cannot be in the zone. If a
  player wants to move a fitted instrument they must unfit it first, at which
  point carrying it into the Deep Forest is a choice they made.
- BNTY balance, open Notes, XP and levels

That last distinction is what keeps the rule to one sentence. There is no schedule
of protected item classes to memorise and no argument about edge cases — if it is
in the pack it can be lost, and if it is at home it cannot.

Anti-griefing:
- No PvP within 30s of a player's spawn or within sight of an extraction gate.
- Killing another player marks you for 10 minutes: you glow to everyone, and you
  cannot extract while marked. Hunting is possible; hit-and-run is not.
- A daily cap on how many times one wallet can be killed by the same wallet, so
  spawn-camping a specific person is not a strategy.

---

## 5. Weapons

Melee is the floor, guns are the ceiling, and the ceiling is deliberately hard
to reach.

### Melee — the default
Crafted at the Workshop from common salvage. Repairable, never consumed. Every
player has one. Silent, which matters: noise draws shamblers.

### Crossbow — the mid tier
Crafted, but bolts are consumable. **Roughly 70% of bolts are recoverable from
what you hit**, so it is sustainable if you are accurate and expensive if you
are not. Silent. This should be the weapon most experienced players actually
carry.

### Firearms — rare, and kept rare by ammo, not by drop rate
Guns themselves drop from Deep Forest caches. Making the *gun* rare is a weak
lever, because a player only needs one. **Ammunition is the real constraint:**

- Ammo is **not craftable.** There is no recipe, ever.
- Ammo enters the world through a **global daily budget with a per-wallet cap** —
  the same mechanism `CRATES_FOUND_PER_DAY` and `CRATE_WALLET_DAILY_CAP` already
  use for allocations, which is proven and already tuned against whales.
- Guns are **loud.** Firing pulls shamblers from a wide radius. The gun is what
  you use to survive a mistake, not what you plan around.
- Durability degrades and repair needs Deep Forest parts, so a gun you fire
  every run costs you salvage you would rather have extracted.

The design target: a competent player fights with melee, carries a crossbow, and
has perhaps eight rounds they are saving for something bad.

---

## 6. Lighting and texture direction

The established brand rule holds and is not up for renegotiation: **the world
uses ordinary real-world colours under neutral light; Robin Neon `#CCFF00` is
reserved for branding, signage, UI and status.** Two previous attempts to tint
the world green were reverted.

The Deep Forest is where that rule pays off. In a zone lit almost entirely by
failing sodium and moonlight, Robin Neon appears on exactly three things: your
own equipment, an extraction gate, and a working generator. **It stops being a
brand colour and becomes the colour of things that still work.** That is a
reveal delivered through the palette, and it needs no dialogue.

| Zone | Key light | Fill | Fog | Ground |
|---|---|---|---|---|
| Machine Room | Neutral overhead, 4.6u | Cool bounce | None | Poured concrete |
| Grounds | Overcast late afternoon, soft | Broad sky | Light, far | Gravel, grass, path |
| Treeline | Low amber sun, long shadows | Dim | Mid-distance | Leaf litter, mud |
| Deep Forest | Moonlight only, near-blue | Almost none | Heavy, near | Wet earth, rusted steel, roots through concrete |

Texture direction for the outdoor zones: the same flat-shaded, low-poly language
as the interiors — this must not become a different game visually. Weathering is
carried by *colour and geometry*, not by detail maps: bent railings, collapsed
roof sections, saplings growing through floors. Reuse `hash2` for variation and
keep every prop on the grid and on quarter turns, per the alignment pass already
done on the interiors.

---

## 7. What this costs to build

Honest engineering notes, because the size ask is the hard part.

**The map cannot be one board.** `IsoBoard` renders every tile as one
InstancedMesh and rebuilds colours in a `useEffect` over all cells. That is fine
at 25×33 (825 tiles). At 30× that it is ~25,000 tiles, and the per-cell colour
loop, the `findPath` flood fill, and the prop list all become frame hazards. The
Deep Forest needs **chunking**: fixed-size tiles streamed around the player, with
pathfinding scoped to loaded chunks.

**PvP needs a server authority that does not exist yet.** Presence today is
`useFloorPresence` — cosmetic, position-only, no validation. Combat requires
server-side hit resolution, or the first player to open devtools wins every
fight. This is the largest single item here and should not be underestimated.

**What is already in place and should be reused:**
- The door table is data-driven and directionally correct, so adding regions is a
  table entry plus a scene.
- `quests.ts` already records progress by event key — gathering and salvage
  quests need no new machinery.
- `progression.ts` already has four XP tracks; combat and salvage fit as a fifth
  and sixth, or fold into `scouting`.
- The global-budget-plus-wallet-cap pattern from crates is exactly what ammo
  needs.

**Suggested build order** — each stage playable on its own:

1. **Region model + level gating + packs.** Server-side, testable, no art
   required. Regions get bounds, a lighting profile, a PvP flag and a level
   gate; packs get tiers, Scrip pricing, capacity and the entry check. All of it
   is pure state and enforceable before a single tree is modelled.
2. **Evergreen Grounds.** One outdoor scene, safe, gathering nodes. Proves the
   outdoor art direction at a size the current renderer handles.
3. **Chunked terrain.** The renderer work, proven on the Grounds before the
   Deep Forest depends on it.
4. **Melee combat + shamblers, PvE only, in the Treeline.**
5. **Salvage bag + extraction.** Still PvE. The loop is fun without PvP; if it
   is not, PvP will not save it.
6. **PvP with server-authoritative combat.**
7. **Firearms and the ammo economy.**

Stage 5 is the checkpoint. If the extraction loop is not compelling against
shamblers alone, adding hostile players adds frustration, not tension.
