import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Every day key in the app is a LOCAL `YYYY-MM-DD`, and `src/lib/dayKey.ts` is
 * the one place that formats one. There used to be seventeen hand-rolled copies.
 * They were all correct, which is the trap: a copy is right until somebody
 * edits it, and the copies that had drifted to UTC are how a habit's first
 * evening went missing and a US check-out read "out -1 days". CI runs in UTC,
 * where a UTC date IS the local date, so no ordinary test sees that drift.
 *
 * This scans the source for the shapes a day key is hand-built from:
 *   - getter-format: `getMonth() + 1)` — every hand-rolled `MM` adds 1 and
 *     wraps it, whatever pads it after. `Date.UTC(y, m + 1, 0)` (the last-day
 *     idiom) is followed by a comma, so it is not matched.
 *   - utc-slice: an instant cut to its UTC day (`.slice(0, 10)`, `.split("T")[0]`)
 *     or a toISOString cut to its UTC month.
 *   - other-format: a day in another spelling (`toDateString`, an `en-CA` or
 *     `sv-SE` date string).
 *
 * The whole file is matched, not lines: an expression split over lines is the
 * same expression. What the scan cannot see: a formatter written without `+ 1`
 * (hand padding, `formatToParts`). `new Date(y, d.getMonth() + 1)` with no day
 * argument reads as a formatter; write the day out.
 */

const SRC = join(process.cwd(), "src");
const CANONICAL = "src/lib/dayKey.ts";

const KINDS = {
  "getter-format": /\.get(?:UTC)?Month\(\)\s*\+\s*1\s*\)/g,
  "utc-slice":
    /\.(?:slice|substring|substr)\(\s*0\s*,\s*10\s*\)|\.split\(\s*["'`]T["'`]\s*\)\s*\[\s*0\s*\]|\.to(?:ISOString|JSON)\(\)\s*\.(?:slice|substring|substr)\(\s*0\s*,\s*7\s*\)/g,
  "other-format":
    /\.toDateString\(\)|\b(?:toLocaleDateString|DateTimeFormat)\(\s*["'`](?:en-CA|sv(?:-SE)?|fr-CA|lt(?:-LT)?)["'`]/g,
} as const;
type Kind = keyof typeof KINDS;

/**
 * The matches that are allowed outside the canonical file, each with its
 * reason. Exact counts: a second match in a listed file fails, and so does a
 * row whose match has gone.
 */
const ALLOWED: Record<string, { count: number; why: string }> = {
  // UTC on purpose, and not a day key.
  "src/lib/entitlement.ts [getter-format]": {
    count: 1,
    why: "server-side monthly quota bucket — the server has no user zone, so UTC is the stable month",
  },

  // UTC arithmetic on a bare `YYYY-MM-DD` label: parsed as UTC midnight, shifted
  // in UTC, formatted back with toISOString. Self-consistent because no instant
  // and no local Date ever enters; local getters here would land a day early
  // west of UTC.
  "src/features/filing/lib/obligations.ts [utc-slice]": {
    count: 1,
    why: "fromUtc — the label round trip behind addDays/addMonths/addYears",
  },
  "src/features/filing/lib/ics.ts [utc-slice]": {
    count: 1,
    why: "nextDay — exclusive DTEND of an all-day event",
  },
  "src/features/filing/lib/expiry.ts [utc-slice]": {
    count: 1,
    why: "travelCutoffFor — six months before a regex-checked dueOn",
  },
  "src/features/filing/lib/stats.ts [utc-slice]": {
    count: 1,
    why: "monthsEnding — Y and M split from the local today key, Date.UTC, month taken",
  },
  "src/features/inventory/lib/value.ts [utc-slice]": {
    count: 1,
    why: "shiftYears — regex-gated bare labels only",
  },

  // The focus hydration cache stamps its day as toDateString (local, just
  // spelled differently), and habits reads that cache by hand. Both sides have
  // to move together, with a read of the old format, or today's cups reset.
  "src/features/focus/hooks/useHydration.ts [other-format]": {
    count: 1,
    why: "hydration cache day — migrates together with habits/lib/water.ts",
  },
  "src/features/habits/lib/water.ts [other-format]": {
    count: 2,
    why: "reads and writes the focus hydration cache in its format",
  },
};

type Match = { file: string; kind: Kind; line: number; snippet: string };

function matchesIn(text: string): { kind: Kind; index: number; snippet: string }[] {
  return (Object.keys(KINDS) as Kind[]).flatMap((kind) =>
    [...text.matchAll(KINDS[kind])].map((m) => ({
      kind,
      index: m.index ?? 0,
      snippet: m[0].replace(/\s+/g, " "),
    }))
  );
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(p);
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : [];
  });
}

function scan(): Match[] {
  return sourceFiles(SRC).flatMap((path) => {
    const file = path.replace(process.cwd() + "/", "");
    const text = readFileSync(path, "utf8");
    return matchesIn(text).map(({ kind, index, snippet }) => ({
      file,
      kind,
      line: text.slice(0, index).split("\n").length,
      snippet,
    }));
  });
}

describe("one local day-key formatter", () => {
  const found = scan();
  const outside = found.filter((m) => m.file !== CANONICAL);

  it("still recognises the canonical formatter (guards against a scan that matches nothing)", () => {
    expect(found.filter((m) => m.file === CANONICAL).map((m) => m.kind)).toEqual([
      "getter-format",
    ]);
  });

  it("keeps @/lib/dayKey dependency-free — the shared shell imports it", () => {
    const src = readFileSync(join(process.cwd(), CANONICAL), "utf8");
    expect(src).not.toMatch(/^\s*import\b|\bfrom\s+["']|\brequire\(/m);
  });

  it("has no day-key formatter outside @/lib/dayKey and the allowlist", () => {
    const unexpected = outside
      .filter((m) => !(`${m.file} [${m.kind}]` in ALLOWED))
      .map((m) => `${m.file}:${m.line} [${m.kind}] ${m.snippet}`);
    // Use dayKeyFor / todayKey / dayKeyOf from @/lib/dayKey. If this really is
    // not a day key, add an ALLOWED row that says why.
    expect(unexpected).toEqual([]);
  });

  it("matches the allowlist's counts exactly (no second match, no stale row)", () => {
    const counts: Record<string, number> = {};
    for (const m of outside) {
      const key = `${m.file} [${m.kind}]`;
      if (key in ALLOWED) counts[key] = (counts[key] ?? 0) + 1;
    }
    const expected = Object.fromEntries(
      Object.entries(ALLOWED).map(([k, v]) => [k, v.count])
    );
    expect(counts).toEqual(expected);
  });

  // The patterns are the whole guard, so pin what they do and don't catch.
  const kindsOf = (snippet: string) => matchesIn(snippet).map((m) => m.kind);

  it.each([
    ["(d.getMonth() + 1).toString().padStart(2, \"0\")", "getter-format"],
    ["String(d.getMonth() + 1).padStart(2, \"0\")", "getter-format"],
    ["pad(d.getMonth() + 1)", "getter-format"],
    ["String(\n    now.getUTCMonth() + 1\n  ).padStart(2, \"0\")", "getter-format"],
    ["new Date().toISOString().slice(0, 10)", "utc-slice"],
    ["l.lentAt.slice(0, 10)", "utc-slice"],
    ["iso.substring(0,10)", "utc-slice"],
    ["d.toISOString().split(\"T\")[0]", "utc-slice"],
    ["d.toISOString().slice(0, 7)", "utc-slice"],
    ["d.toJSON().slice(0, 10)", "utc-slice"],
    ["new Date().toDateString()", "other-format"],
    ["d.toLocaleDateString(\"en-CA\")", "other-format"],
    ["new Intl.DateTimeFormat(\"sv-SE\")", "other-format"],
  ])("catches %s", (snippet, kind) => {
    expect(kindsOf(snippet)).toEqual([kind]);
  });

  it.each([
    "Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)",
    "d.setUTCMonth(d.getUTCMonth() + months, 1)",
    "today.slice(0, 7)",
    "amzDate.slice(0, 8)",
    "new Date().toISOString()",
    "new Date().toISOString().replace(/[-:]/g, \"\")",
    "dayKeyFor(new Date(iso))",
    "dayKeyOf(a.addedAt)",
    "d.toLocaleDateString(undefined, { month: \"short\" })",
  ])("leaves %s alone", (snippet) => {
    expect(kindsOf(snippet)).toEqual([]);
  });
});
