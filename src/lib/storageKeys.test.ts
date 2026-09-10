import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Several localStorage keys are written in one file and read in another, as
 * hardcoded string literals in both. `CLAUDE.md` asks twice for these to be kept
 * in sync by hand — "it duplicates the storage key by necessity, so keep the two
 * in sync" for the pre-paint theme script, and "Keep the key in sync with
 * `storageKeyV2ForUser`" for filing's bookmark reads.
 *
 * Nothing checked either, and a scan found the problem is wider than the two the
 * docs name: ELEVEN key literals appear in more than one file.
 *
 * The failure mode is uniform and completely silent. Bump the writer's copy and
 * the reader's `getItem` returns null against the old key — no error, no type
 * error, no failing test. The feature just quietly shows an empty state: habits'
 * water tracking stops seeing focus's hydration, the filing badge stops counting,
 * the anti-flash script stops finding the theme and the flash it exists to
 * prevent comes back.
 *
 * A "these must be equal" assertion is not expressible, which is the trap here:
 * once someone bumps one copy the two literals are simply different strings with
 * nothing linking them. So the registry below pins each shared key to the exact
 * set of files that must contain it. Change one copy and its file set shrinks,
 * which fails and names it.
 *
 * The real fix for any single row is to export the key from one module and import
 * it — then there is nothing to keep in sync. This test does not force that; it
 * makes the drift loud so the choice stays open.
 */

const SRC = join(process.cwd(), "src");

/**
 * Keys in this app are `bd:…`, `bookmarkdeck:…`, or `<name>:v<N>`. Matching the
 * shape rather than a list is deliberate: a NEW duplicated key has to fail too,
 * not just the ones known today.
 */
const KEY = /"((?:bd|bookmarkdeck)[:\w.-]*|[a-z][\w.-]*:v\d+[\w:.-]*)"/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(p);
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : [];
  });
}

/** key -> the files that hardcode it, for keys hardcoded more than once. */
function sharedKeys(): Record<string, string[]> {
  const byKey = new Map<string, Set<string>>();
  for (const file of sourceFiles(SRC)) {
    const rel = file.replace(process.cwd() + "/", "");
    for (const m of readFileSync(file, "utf8").matchAll(KEY)) {
      if (!byKey.has(m[1])) byKey.set(m[1], new Set());
      byKey.get(m[1])!.add(rel);
    }
  }
  return Object.fromEntries(
    [...byKey]
      .filter(([, files]) => files.size > 1)
      .map(([k, files]) => [k, [...files].sort()])
  );
}

/**
 * Every key duplicated across files, and where. Grouped by why the duplication
 * exists; adding a row is a decision to accept one more hand-synced literal.
 */
const REGISTRY: Record<string, string[]> = {
  // The blocking pre-paint script in layout.tsx cannot import — it is a string
  // in the HTML head, which is exactly why CLAUDE.md flags this one.
  "bd:appearance:v1": ["src/app/layout.tsx", "src/lib/appearanceSettings.tsx"],

  // A one-shot intent handed between two shared components.
  "bd:intent:add-bookmark": [
    "src/components/CommandPalette.tsx",
    "src/components/HomePageClient.tsx",
  ],

  // Core bookmarks cache. The widest one, at four files — and CLAUDE.md names
  // only filing's copy, so the other two reads were undocumented.
  "bookmarkdeck:v2": [
    "src/components/CommandPalette.tsx",
    "src/features/filing/lib/bookmarks.ts",
    "src/features/inventory/hooks/useBookmarkLibrary.ts",
    "src/hooks/useBookmarks.ts",
  ],

  // Reminder-count hooks read their own feature's cache directly rather than
  // mounting the hook that owns it — the documented constraint is that the
  // shared shell must not pull Firebase into its bundle.
  "bookmarkdeck:filing:documents:v1": [
    "src/features/filing/hooks/useFilingDocuments.ts",
    "src/features/filing/hooks/useFilingReminderCount.ts",
  ],
  "bookmarkdeck:filing:folders:v1": [
    "src/features/filing/hooks/useFilingFolders.ts",
    "src/features/filing/hooks/useFilingReminderCount.ts",
  ],
  "bookmarkdeck:filing:settings:v1": [
    "src/features/filing/hooks/useFilingReminderCount.ts",
    "src/features/filing/hooks/useFilingSettings.ts",
  ],
  "bookmarkdeck:inventory:items:v1": [
    "src/features/inventory/hooks/useInventory.ts",
    "src/features/inventory/hooks/useInventoryReminderCount.ts",
  ],

  // Read-only inbound reads of another pillar's cache — no code import and no
  // writes, which is why featureBoundaries.test.ts does not see them. They are
  // real coupling all the same, just spelled as a string instead of an import.
  "bookmarkdeck:focus:hydration:v1": [
    "src/features/focus/hooks/useHydration.ts",
    "src/features/habits/lib/water.ts",
  ],
  "bookmarkdeck:focus:notes:v1": [
    "src/features/focus/hooks/useFocusJournal.ts",
    "src/features/habits/lib/journal.ts",
  ],
  "bookmarkdeck:focus:settings:v1": [
    "src/features/focus/hooks/useFocusSettings.ts",
    "src/features/habits/lib/water.ts",
  ],
  "bookmarkdeck:focus:todos:v1": [
    "src/features/focus/hooks/useTodos.ts",
    "src/features/inventory/hooks/useFocusProjects.ts",
  ],
};

describe("storage keys duplicated across files stay in agreement", () => {
  const found = sharedKeys();

  it("finds keys at all (guards against the scan matching nothing)", () => {
    // An empty result would make the equality below pass only if REGISTRY were
    // also empty — but it would silently stop guarding anything if a future
    // edit narrowed the regex.
    expect(Object.keys(found).length).toBeGreaterThan(5);
  });

  it("matches the registry exactly", () => {
    // Shrink a key's file set (bump one copy) and it fails here naming the key.
    // Add a new duplicated key and it fails as an undeclared row.
    expect(found).toEqual(REGISTRY);
  });
});
