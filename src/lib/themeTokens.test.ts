import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * The light/dark theme has exactly one maintenance rule, and `CLAUDE.md` states
 * both halves of it:
 *
 *   "The map covers exactly the family/step pairs the codebase uses. A new one
 *    needs three lines (`@theme inline`, `:root`, `.light`) or it SILENTLY keeps
 *    its dark value."
 *
 * "Silently" is why this file exists. A missed step passes lint, typecheck, tests
 * and build; it surfaces only as a colour that does not theme, and only to someone
 * looking at the app in light mode. Nothing in the suite could see it, because it
 * is a property of which declarations exist rather than of what any code returns.
 *
 * It caught one on the way in: `teal-700` was used by LetThemCard and declared
 * nowhere. That one happened to be harmless — a saturated ground under white text
 * is meant to stay put, which is what an undeclared step does anyway — but it was
 * right by accident rather than by declaration, and the next omission could as
 * easily be a foreground colour, where staying dark is exactly wrong.
 */

const SRC = join(process.cwd(), "src");
const CSS = readFileSync(join(SRC, "app", "globals.css"), "utf8");

/** The `family-step` pairs named in one CSS block. */
function tokensIn(block: RegExp, prefix: "color" | "bd"): Set<string> {
  const body = CSS.match(block)?.[0] ?? "";
  const re = new RegExp(`--${prefix}-([a-z]+-\\d+)`, "g");
  return new Set([...body.matchAll(re)].map((m) => m[1]));
}

const inline = tokensIn(/@theme inline\s*\{[\s\S]*?\n\}/, "color");
const root = tokensIn(/(^|\n):root\s*\{[\s\S]*?\n\}/, "bd");
const light = tokensIn(/(^|\n)\.light\s*\{[\s\S]*?\n\}/, "bd");

/**
 * Tailwind palette utilities in the app's own source. Deliberately NOT a general
 * class parser: it looks for a known utility prefix followed by a known colour
 * family and a numeric step, which is the exact shape the token map has to cover.
 */
const UTILITY =
  /\b(?:bg|text|border|ring|from|to|via|decoration|outline|shadow|fill|stroke|divide|accent|caret|placeholder)-((?:slate|blue|red|green|amber|emerald|yellow|orange|purple|pink|indigo|cyan|teal|violet|rose|sky|lime|fuchsia|gray|zinc|neutral|stone)-\d+)/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(p);
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : [];
  });
}

const used = new Set(
  sourceFiles(SRC).flatMap((f) =>
    [...readFileSync(f, "utf8").matchAll(UTILITY)].map((m) => m[1])
  )
);

const sorted = (s: Set<string>) => [...s].sort();

describe("the theme token map covers the palette the code uses", () => {
  it("finds palette utilities at all (guards against the scan matching nothing)", () => {
    // A regex that matched nothing would make every assertion below vacuous —
    // an empty "used" set is a subset of anything.
    expect(used.size).toBeGreaterThan(50);
    expect(inline.size).toBeGreaterThan(50);
  });

  it("declares every family/step the source actually uses", () => {
    // Undeclared means the utility keeps its dark value in light mode.
    expect(sorted(used).filter((t) => !inline.has(t))).toEqual([]);
  });

  it("gives every mapped token BOTH a :root and a .light value", () => {
    // The "three lines" rule. A token mapped in @theme inline but missing from
    // one of the palettes resolves to nothing in that mode.
    expect(sorted(inline).filter((t) => !root.has(t))).toEqual([]);
    expect(sorted(inline).filter((t) => !light.has(t))).toEqual([]);
  });

  it("has no palette value that nothing maps", () => {
    // A --bd-* with no --color-* pointing at it is a typo or a leftover; both
    // are worth surfacing rather than leaving to accumulate.
    expect(sorted(root).filter((t) => !inline.has(t))).toEqual([]);
    expect(sorted(light).filter((t) => !inline.has(t))).toEqual([]);
  });
});
