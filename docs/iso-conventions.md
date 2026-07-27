# Isometric scenes: what already exists

Read this before building anything that renders a room, a world, or a thing
standing in one.

It exists because a whole camera rig got rebuilt from scratch while a working,
better one sat two files away. The cost was not the duplicated code — it was
three sessions of bugs that only existed because the second rig introduced a
coordinate offset the first one does not have. Everything below is a "this
already exists" note, and every one of them has been re-invented at least once.

---

## The camera: `IsoRig` (components/iso/IsoScene)

**Always use it.** Do not write a camera, a pan handler, or a wheel-zoom
listener.

```tsx
<Canvas orthographic camera={CAMERA} shadows>
  <IsoRig dragRef={dragRef} interactive bounds={BOUNDS} zoom={30} />
  {/* scene */}
</Canvas>
```

It gives you hold-left-click to pan, wheel to zoom, framing on mount, and a
`dragRef` that lets click handlers tell a click from the end of a drag.

- Omit `zoom` and it frames the whole `bounds` on mount. Right for a room.
- Pass `zoom` and it uses that. Right for a world, where framing the whole thing
  would render the player as a speck.

**The rule that matters: never wrap the scene in a group that moves it.** A
camera-follow group translating the world by `-playerPosition` puts the player at
screen centre and, in doing so, makes world coordinates differ from map
coordinates. Every raycast hit then needs converting, and every conversion is a
bug waiting to happen. With `IsoRig` there is no offset: **world x/z ARE map
x/z**, and turning a hit into a tile is `Math.round`.

## Picking a tile from a click

```tsx
const cell = { x: Math.round(event.point.x), z: Math.round(event.point.z) };
```

That is the whole thing. Specifically **do not** use
`event.object.worldToLocal(...)` on a ground plane: ground planes are rotated
`-PI/2` about X to lie flat, and `worldToLocal` undoes the rotation as well as
the translation, so local `z` ends up tracking world **Y** — a value that is
always ~0 on a flat plane. Symptom: every click resolves to a tile near `z=0`,
and hover lights up somewhere far away.

Also: check `dragRef.current.moved` before acting on a click, or every camera pan
ends with an accidental order to walk.

## Markers on tiles

Every tile marker uses the same geometry, so they cannot drift apart:

```tsx
<ringGeometry args={[0.55, 0.7, 4, 1, Math.PI / 4]} />
```

`ringGeometry` approximates a circle with `thetaSegments` sides — 5 gives a
pentagon, 6 a hexagon. **Four segments plus a `PI/4` start** gives a square whose
sides run along the grid axes. Used by the hover tile, the destination marker,
the player ring and gathering nodes.

## Ground grids

If you draw a grid texture, **one repeat must equal one tile**. Drawing a 2x2
chequer inside a one-unit repeat makes every visible square half a tile, so
markers that are correctly one unit across line up with nothing and the floor
lies about the grid it represents.

## Labels

- **Players** get `<Html>` billboards — a person moves, and their name must be
  readable from wherever they are.
- **Places** get `GridLabel`, which is the same DOM node with the same CSS,
  rotated into the scene. Pass `rotation={[0, 0, 0]}` to sit in the parent's
  plane (a sign bolted to a structure); omit it for the default camera-facing
  iso angle (a sign floating over open ground).

`GridLabel` uses drei's `transform` mode with an explicit `scale`. **Never
`distanceFactor` under an orthographic camera** — it scales by distance from the
camera, a perspective concept, and produced a wrapper 24,676 x 31,814 CSS pixels:
an invisible overlay covering the whole canvas that hid everything behind it.

## Many copies of one thing

Use `InstancedForest` as the pattern: one `InstancedMesh` per geometry, matrices
written once in a layout effect, per-instance colour for variation. A few hundred
props as individual component instances is thousands of objects for three.js to
cull and submit every frame.

Set `frustumCulled = false` on them — the bounding sphere three.js computes comes
from the base geometry, not the spread of instances, so a map-wide instanced mesh
vanishes the moment its origin leaves view.

## `'use client'` does not mean browser-only

Next still server-renders client components. `document.createElement` at module
or render scope throws during SSR, and inside a Canvas subtree that throw takes
the **entire scene** with it — black canvas, nothing in the console. Guard with
`typeof document === 'undefined'` and return null.

---

# Where the world lives

## `lib/deep-forest-map.ts` — terrain, for both halves

**Zero imports, by design.** The client draws what it says; the server validates
against what it says. They cannot disagree because there is only one of them.

`propAt(x, z)` is a pure function of the coordinate — no stored map, nothing sent
over the wire, and collision costs nothing because there is no list to search.

If you add a region with terrain, copy this shape. A map generated inside a scene
component exists only in the browser, and a server that cannot see the terrain
cannot validate a step, a line of sight, or a claim to be standing next to loot.

**`REGIONS[].bounds` must match `EXTENT`.** They are two numbers in two files;
`deep-forest-map.test.ts` asserts they agree, because when they did not, spawning
placed players 170 tiles outside the world with nothing in any log.

## `lib/expedition.ts` — the authority

Position and health live in memory here, not SQLite: both change constantly, both
are meaningless after a session, and persisting them would put the hottest writes
in the game on disk for nothing.

**Loot proximity resolves against `positionOf(wallet)`, never against a
coordinate in the request body.** A route that trusts a posted position does not
have a proximity rule, it has a suggestion. `stepTo` validates one tile of
movement at a time for the same reason — a client that could cross the map in one
call could read every pile on it without ever being exposed.

## `lib/packs.ts` — what can be lost

`CARRIABLE` is an **allowlist**. A denylist fails open: every item type added
later would be losable until somebody remembered to exclude it. Adding a class is
a deliberate decision to put it at risk.

---

# Conventions that are easy to break

- **Robin Neon `#CCFF00` is for branding, signage, UI and status.** The world is
  lit in ordinary colour. This has been broken and reverted twice. In the Deep
  Forest it is load-bearing: neon appears only on your gear, extraction gates and
  live generators, so it reads as "this still works" rather than as a brand.
- **Props sit on the grid and on quarter turns.** The one exception is
  `CrateStack`, which leans deliberately — cargo should look set down, not laid
  out. It says so at the component.
- **A cosmetic must render.** Every catalogue entry needs a row in its render map
  or it is a purchase that changes nothing; `cosmetics-catalog.test.ts` fails if
  the two lists drift. Eight liveries shipped invisible before that test existed.
