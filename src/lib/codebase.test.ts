// Guards against the failure mode that keeps costing this project sessions:
// building something that already exists because nobody knew it was there.
//
// It has happened repeatedly and in the same shape every time. A route search
// was written twice and the copy drifted. Instanced batching was written twice.
// A grid texture was written twice. `Planter` was written twice, in two files,
// both live, and the second author did not know the first existed. A door label
// was written twice — once as data, once hardcoded in a scene — and the scene
// went on naming a region the door had stopped leading to.
//
// Prose cannot fix this. CLAUDE.md and docs/iso-conventions.md both say "look
// before you build" and both were written by somebody who had just failed to.
// The only thing that reliably surfaces a collision is a red test at the moment
// the collision is introduced, which is what this is.
//
// It is deliberately a TEST rather than a lint rule: it runs in the same command
// everything else does, and its allowlists are the place to write down WHY a
// duplicate name is legitimate — which is documentation that cannot go stale,
// because removing the reason breaks the build.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(process.cwd(), 'src');

function sourceFiles(dir = ROOT, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

const rel = (f: string) => path.relative(ROOT, f).split(path.sep).join('/');

/** Every exported name, and which files export it. */
function exportIndex(): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>();
  for (const file of sourceFiles()) {
    const src = fs.readFileSync(file, 'utf8');
    const re = /export\s+(?:async\s+)?(?:function|const|class|interface|type)\s+([A-Za-z0-9_]+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      if (!index.has(m[1])) index.set(m[1], new Set());
      index.get(m[1])!.add(rel(file));
    }
  }
  return index;
}

/**
 * Names that are allowed to appear in more than one module, with the reason.
 *
 * Anything NOT in here that collides is a bug: either two things doing one job,
 * or one job done twice under one name. Adding an entry is a decision, and the
 * comment beside it is the argument for that decision.
 */
const SHARED_NAMES: Record<string, string> = {
  // Next.js route conventions. Every route file exports these by definition.
  GET: 'Next route handler',
  POST: 'Next route handler',
  PATCH: 'Next route handler',
  DELETE: 'Next route handler',
  dynamic: 'Next route segment config',
  metadata: 'Next page metadata',
  revalidate: 'Next route segment config',
  // Next's generated-image convention. Every icon/opengraph-image route
  // declares these by name — they are how the framework learns the dimensions
  // and MIME type without opening the file — so opengraph-image, icon and
  // apple-icon necessarily all export the same three.
  runtime: 'Next route segment config',
  size: 'Next generated-image route convention',
  contentType: 'Next generated-image route convention',
  alt: 'Next generated-image route convention',

  /*
   * The per-region map contract.
   *
   * lib/deep-forest-map, lib/grounds-map and lib/hq-map each export the same
   * shape ON PURPOSE: every one is zero-import so the renderer and the server
   * read one definition of a region and cannot disagree about it. Factoring
   * them into a shared base would either reintroduce imports or produce a
   * generic map module that no longer says anything specific about a place.
   *
   * The cost is real — three modules to keep in step — and is paid knowingly.
   */
  BOUNDS: 'per-region map contract',
  ARRIVAL: 'per-region map contract',
  DOORS: 'per-region map contract',
  DOOR_HALF: 'per-region map contract',
  DOOR_DEPTH: 'per-region map contract',
  Doorway: 'per-region map contract',
  MAP_SEED: 'per-region map contract',
  MapProp: 'per-region map contract',
  PropKind: 'per-region map contract',
  propAt: 'per-region map contract',
  allProps: 'per-region map contract',
  isWalkable: 'per-region map contract',
  onPath: 'per-region map contract',
  doorAt: 'per-region map contract, plus the room portals table',
  doorCells: 'per-region map contract, plus the room portals table',

  /*
   * Wire types, mirrored between server and client.
   *
   * lib/api-client redeclares what the server returns rather than importing it,
   * because importing a lib module into the browser drags node:sqlite in behind
   * it and the build fails on "Can't resolve 'fs'". The duplication is the
   * price of that boundary.
   *
   * It is the weakest entry in this list: these CAN drift, silently, and the
   * only thing stopping them is that a mismatch usually shows up as a type
   * error at the call site. A shared types-only module would be better.
   */
  CreatureView: 'wire type mirrored in api-client',
  PlayerView: 'wire type mirrored in api-client',
  PackState: 'wire type mirrored in api-client',
  VisiblePile: 'wire type mirrored in api-client',
  IntroState: 'wire type mirrored in api-client',
  IntroStepView: 'wire type mirrored in api-client',
  QuestView: 'wire type mirrored in api-client',
  TrackProgress: 'wire type mirrored in api-client',
  StakePosition: 'wire type mirrored in api-client',
  GlobalProfile: 'wire type mirrored in api-client',
  ActivityItem: 'wire type mirrored in api-client',
  CosmeticSlot: 'wire type mirrored in api-client',
  CosmeticCurrency: 'wire type mirrored in api-client',
  PaymentRequest: 'wire type mirrored across the settlement boundary',

  MapNode: 'gathering node in deep-forest-map; diagram node in world-map',
  // Two genuinely different concepts that happen to share a word. Renaming
  // either would be worse than the collision: a gather node and a map node are
  // both "nodes" in their own file and neither is ambiguous there.
  // The render-side kind list and the rules-side one. floor-rules exists apart
  // from lib/floor precisely so a client can read it without the database.
  MachineKind: 'palette is the render list, floor-rules the rules list',
  GatherKind: 'deep-forest-map decides which; OutdoorDressing decides how it looks',
};

describe('the codebase does not build the same thing twice', () => {
  it('has no export name in two modules without a stated reason', () => {
    const collisions: string[] = [];
    for (const [name, files] of exportIndex()) {
      if (files.size < 2) continue;
      if (SHARED_NAMES[name]) continue;
      collisions.push(`${name}  —  ${[...files].join('  |  ')}`);
    }
    expect(
      collisions,
      collisions.length
        ? `\nTwo modules export the same name. Either one of them already does the\n` +
            `job you are about to do, or the name is wrong. If the duplication is\n` +
            `genuinely correct, add it to SHARED_NAMES with the reason.\n\n` +
            collisions.join('\n') +
            '\n'
        : ''
    ).toEqual([]);
  });

  /**
   * Every module in the iso set should be findable from its own name.
   *
   * Not a strong property, but it catches the specific thing that went wrong
   * with the bench: HqScene built a flat box because whoever wrote it did not
   * think to look in MapDressing, which is where furniture lives. Listing the
   * prop modules here at least means one file names them all.
   */
  it('keeps the prop vocabulary in the two files that own it', () => {
    const propModules = ['components/iso/MapDressing.tsx', 'components/iso/OutdoorDressing.tsx'];
    for (const m of propModules) {
      expect(fs.existsSync(path.join(ROOT, m)), `${m} is missing`).toBe(true);
    }
  });
});
