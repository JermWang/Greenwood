// A class name in the JSX is not evidence that anything styles it.
//
// The Exchange HUD shipped with markup and NO CSS — every `.mkt-hud` rule in
// globals.css amounted to a single mobile touch-target minimum, written by
// somebody who reasonably assumed the base rules existed. So it rendered as an
// unstyled button and an unstyled <aside> in normal document flow: bare text
// across the bottom of the screen, on top of the chat, in production, for as
// long as it had been there. The same audit turned up `.df-prompt-close`, a
// naked UA button sitting in the middle of a designed panel in the Deep Forest.
//
// Nothing catches this. It type-checks, it builds, it renders, and it only
// looks wrong to a person who opens that exact screen — which for a HUD in one
// region can be a long time. So it is a test, in the same spirit as
// codebase.test.ts: the failure is structural, so the guard is structural.
//
// SCOPED TO PROJECT PREFIXES, because Tailwind supplies most of the class names
// in this codebase and none of them appear in globals.css. A name only counts
// if it carries one of the prefixes below — which is what the project's own
// hand-written CSS uses, and what somebody inventing a new component will
// reach for.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(process.cwd(), 'src');
const CSS = path.join(ROOT, 'app', 'globals.css');

/**
 * Class names that legitimately have no rule of their own, and why.
 *
 * Both are GROUPING HOOKS: an element that is positioned entirely by Tailwind
 * utilities or whose children carry all the styling, given a stable name so
 * tests and scripts can find it. Adding an entry here is a claim that the
 * element looks right without a rule — check it before you make it.
 */
const UNSTYLED_ON_PURPOSE: Record<string, string> = {
  'crate-cinematic': 'positioned entirely by the Tailwind utilities beside it; a query hook',
  'wm-you': 'an <g> wrapper; wm-you-pulse and wm-you-dot carry the drawing',
};

/** Prefixes the project uses for its own hand-written CSS. */
const PROJECT =
  /^(eg|mk|mkt|wm|exchange|df|gr|npc|machine|iso|hq|tf|intro|stat|btn|desk|op|quest|craft|pack|loot|tree|world|vault|stake|lb|prof|demo|tx|guide|dock|chat|wp|comp|node|crate|rar|slot|hud|toast|panel|card|scene|title|onboarding)-/;

function tsxFiles(dir = ROOT, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) tsxFiles(full, out);
    else if (/\.tsx$/.test(entry.name) && !/\.test\.tsx$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe('every project class name has a rule behind it', () => {
  it('finds no className that globals.css never defines', () => {
    const css = fs.readFileSync(CSS, 'utf8');
    const defined = new Set([...css.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]));

    const missing = new Map<string, Set<string>>();
    for (const file of tsxFiles()) {
      const src = fs.readFileSync(file, 'utf8');
      // Static strings and template literals both, because a conditional class
      // is exactly the kind that gets added without a matching rule.
      for (const m of src.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\}|\{'([^']*)'\})/g)) {
        const raw = m[1] ?? m[2] ?? m[3] ?? '';
        for (const cls of raw.split(/[\s${}?:'"()[\]]+/)) {
          if (!cls || !PROJECT.test(cls) || cls.includes('.')) continue;
          if (defined.has(cls) || UNSTYLED_ON_PURPOSE[cls]) continue;
          if (!missing.has(cls)) missing.set(cls, new Set());
          missing.get(cls)!.add(path.relative(ROOT, file).split(path.sep).join('/'));
        }
      }
    }

    const report = [...missing.entries()].map(([cls, where]) => `${cls}  —  ${[...where].join(', ')}`);
    expect(
      report,
      report.length
        ? `\nThese class names are used in JSX and styled nowhere. The element will\n` +
            `render with browser defaults, which type-checks and builds and looks\n` +
            `broken only to somebody who opens that screen.\n\n` +
            `Write the rule, or — if the element really is styled by Tailwind or by\n` +
            `its children — add it to UNSTYLED_ON_PURPOSE with the reason.\n\n` +
            report.join('\n') +
            '\n'
        : ''
    ).toEqual([]);
  });

  /*
   * The allowlist has to stay honest too. An entry that later GAINS a rule is
   * not a bug, but it is a stale claim, and stale claims are how the last list
   * in this codebase rotted into being wrong about twelve tables.
   */
  it('keeps no allowlist entry that has since been styled', () => {
    const css = fs.readFileSync(CSS, 'utf8');
    const defined = new Set([...css.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]));
    const stale = Object.keys(UNSTYLED_ON_PURPOSE).filter((cls) => defined.has(cls));
    expect(stale, `these are styled now and can leave UNSTYLED_ON_PURPOSE`).toEqual([]);
  });
});
