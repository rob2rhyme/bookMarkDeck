import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * A feature never imports another feature.
 *
 * The rule is stated as an absolute in four places — `CLAUDE.md` (the filing
 * section, and twice more explaining the copies), and the headers of
 * `features/filing/lib/push.ts` and `features/filing/lib/r2.ts`, which pay for it
 * in duplicated lines: "the price of `rm -rf src/features/filing` staying a
 * complete removal."
 *
 * Filing pays that price. Habits does not — it reaches into focus and inventory,
 * which is why deleting `src/features/focus` breaks the habits build. Those edges
 * are deliberate (see `MYSTUFF-DECOUPLING-READINESS.md` §C4/C5: correlating
 * habits with focus sessions is a product feature, and severing it is an open
 * call), so they are DECLARED below rather than removed.
 *
 * What was missing is enforcement. A new cross-feature import — a first
 * `filing → inventory` one, say, quietly undoing the reason `r2.ts` was copied —
 * passes lint, typecheck, tests and build. Nothing fails; the rule survives only
 * as long as everyone reads four scattered comments. So it is asserted here, and
 * the ledger the docs quote is a measurement rather than a hand count.
 *
 * Source-scanning is deliberate: this is a property of how the code is written,
 * not of what any function returns, so no runtime test could see it.
 */

const ROOT = process.cwd();
const FEATURES = join(ROOT, "src", "features");

/**
 * Quote-delimited specifiers only, in import position (`from "…"`,
 * `import("…")`, `import "…"`). Both the requirement of quotes and of an import
 * keyword matter: the file headers cited above discuss `features/focus/lib/push.ts`
 * in prose, and a bare `@/features/` scan would count those as dependencies.
 */
const IMPORT_RE = /(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+)"(@\/features\/[^"]+)"/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(p);
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : [];
  });
}

const rel = (p: string) => p.replace(ROOT + "/", "");

/** Every `@/features/*` import inside `src/features`, cross-feature or not. */
function featureImports(): { file: string; from: string; to: string }[] {
  return sourceFiles(FEATURES).flatMap((file) =>
    [...readFileSync(file, "utf8").matchAll(IMPORT_RE)].map((m) => ({
      file: rel(file),
      from: rel(file).split("/")[2],
      to: m[1].split("/")[2],
    }))
  );
}

/**
 * The cross-feature edges that exist on purpose, `<file> → <feature>` with the
 * count of import statements. Exact equality below, not a subset check: sever an
 * edge and this test fails telling you to delete its line, so the list cannot
 * quietly describe a coupling that is already gone — the way the rules script's
 * sample list came to name a `habitsLog` collection the app has never written.
 *
 * Every entry is habits reaching out; nothing else crosses. Adding a row here is
 * a decision to widen `MYSTUFF-DECOUPLING-READINESS.md` §C4/C5, not a formality.
 */
const DECLARED: Record<string, { count: number; why: string }> = {
  "src/features/habits/components/FocusCorrelationCard.tsx → focus": {
    count: 1,
    why: "FocusSessionRecord — the card correlates habits against focus sessions (C4)",
  },
  "src/features/habits/hooks/useFocusSessions.ts → focus": {
    count: 2,
    why: "subscribeSessions + FocusSessionRecord — the data behind that correlation (C4)",
  },
  "src/features/habits/hooks/useHabitReminders.ts → focus": {
    count: 1,
    why:
      "cancelPush/schedulePush — the odd one out: not a data dependency, and the " +
      "stated convention (see features/filing/lib/push.ts) is to copy rather than " +
      "import. Copying here would make a third copy, so whether to copy or promote " +
      "push.ts to src/lib is an open owner call (C4)",
  },
  "src/features/habits/lib/trackableSources.ts → focus": {
    count: 1,
    why: "six subscribe* fns — habits tracks focus signals as habit sources (C4)",
  },
  "src/features/habits/lib/trackableSources.ts → inventory": {
    count: 2,
    why: "subscribeItems + releasedOn — the same, for inventory activity (C5)",
  },
};

describe("features do not import each other", () => {
  const imports = featureImports();

  it("finds the imports at all (guards against the scan silently matching nothing)", () => {
    // 611 at the time of writing; the threshold only has to prove the regex and
    // the walk still see the tree, so it is deliberately far below that.
    expect(imports.length).toBeGreaterThan(100);
  });

  it("crosses features only where MYSTUFF-DECOUPLING-READINESS.md says it does", () => {
    const found: Record<string, number> = {};
    for (const i of imports) {
      if (i.to === i.from) continue;
      const key = `${i.file} → ${i.to}`;
      found[key] = (found[key] ?? 0) + 1;
    }
    const declared = Object.fromEntries(
      Object.entries(DECLARED).map(([k, v]) => [k, v.count])
    );
    expect(found).toEqual(declared);
  });

  it("keeps the edge count the docs quote honest", () => {
    const statements = Object.values(DECLARED).reduce((n, d) => n + d.count, 0);
    expect(statements).toBe(7);
    expect(Object.keys(DECLARED).length).toBe(5);
  });
});

describe("the shared shell does not import a feature", () => {
  /**
   * C1 in the readiness doc, recorded as resolved: `AppShell` used to import
   * `useInventoryReminderCount` for the nav badge, so deleting the inventory
   * folder broke the shell's build. The badge now arrives via `AppShellHost`,
   * the one composition point that is allowed to know about features — and which
   * sits in the same directory, so the regression would be an easy one to make.
   */
  it("leaves AppShell.tsx feature-free", () => {
    const shell = readFileSync(join(ROOT, "src/components/AppShell.tsx"), "utf8");
    expect([...shell.matchAll(IMPORT_RE)].map((m) => m[1])).toEqual([]);
  });
});
