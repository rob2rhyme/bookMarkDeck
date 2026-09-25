import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * `r2.ts` is DUPLICATED on purpose between inventory and filing, and the copy
 * earns its keep: baking the prefix into `isOwnedFilingPath` makes that function
 * STRUCTURALLY incapable of authorising an inventory object. A shared
 * `isOwnedPath(path, seg, prefix)` would downgrade that to a runtime argument —
 * on the exact check that stops one pillar deleting another's files.
 *
 * The policy is deliberate. What was missing is the other half of it — nothing
 * kept the copies honest, and they drifted. Filing's push client grew a
 * `pushSupported()` export (so a control that cannot work is not offered);
 * focus's copy never got it, and habits imported focus's copy. The result was a
 * "Turn on reminders" button on a deployment with no VAPID key: the browser
 * permission prompt was raised and granted, and the reminder could never fire.
 *
 * So the copies' PUBLIC SURFACES are asserted equal here. An improvement to one
 * copy fails until it is carried across — the whole bargain of choosing
 * duplication over a shared module.
 *
 * `push.ts` USED to be the second pair, and is the counter-example worth
 * keeping in view: its two copies bought nothing. They were code-identical but
 * for one default string, so the duplication was pure cost, and the bug above
 * was what it cost. It now lives at `src/lib/push.ts`. The lesson is not "never
 * duplicate" — it is that a copy has to buy a property you can name, as r2's
 * does.
 *
 * Export names only, NOT text. The copies legitimately differ in their comments,
 * and r2.ts deliberately differs in the scope of its ownership predicate. The
 * pillar name is normalised out (below) so that difference reads as sameness
 * while a genuinely missing export still reads as a gap.
 */

const SRC = join(process.cwd(), "src");

/** The `COPIED from` pairs, as their headers declare them. */
const PAIRS = [
  {
    what: "R2 presigner",
    a: "features/inventory/lib/r2.ts",
    b: "features/filing/lib/r2.ts",
  },
] as const;

/**
 * Pillar names differ by design — `isOwnedFilingPath` vs
 * `isOwnedInventoryPath` is the point of the copy, not a drift. Fold them to
 * one token so the comparison is about WHAT is exported, not which pillar owns
 * it. Anything outside this list still has to match exactly.
 */
const normalise = (name: string) =>
  name.replace(/Filing|Focus|Inventory/g, "Pillar");

/** Top-level `export` declarations, by name. */
function exportsOf(rel: string): string[] {
  const text = readFileSync(join(SRC, rel), "utf8");
  const names = [
    ...text.matchAll(
      /^export\s+(?:async\s+)?(?:function|const|let|class|type|interface)\s+([A-Za-z0-9_]+)/gm
    ),
  ].map((m) => m[1]);
  return [...new Set(names.map(normalise))].sort();
}

describe("deliberately copied modules keep the same public surface", () => {
  for (const { what, a, b } of PAIRS) {
    it(`${what}: ${a} and ${b} export the same names`, () => {
      const left = exportsOf(a);
      // Guards the scanner: a regex that matched nothing would make any two
      // files look identical, passing this test for the worst possible reason.
      expect(left.length).toBeGreaterThan(1);
      expect(exportsOf(b)).toEqual(left);
    });
  }
});
