import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Every dialog in the app goes through the shared Modal (components/Modal.tsx):
// Escape, a focus trap, focus restored to what opened it, page scroll locked behind
// it, a backdrop that closes only on a press (not a text selection that ends there),
// and — with one dialog opened from another — Escape closing only the top one. About
// twenty-five dialogs were hand-built before, and every one lacked some of that; two
// had no dialog role at all, so neither screen readers nor the "don't open on top of
// another dialog" check could see them.
//
// This fails when a new hand-built dialog or full-screen overlay appears. Use Modal;
// or, if it truly can't be one, add a row below saying why.

const SRC = join(__dirname, "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx$/.test(name) && !/\.(dom\.)?test\.tsx$/.test(name)) out.push(p);
  }
  return out;
}

const files = walk(SRC).map((p) => ({ rel: relative(SRC, p).split("\\").join("/"), text: readFileSync(p, "utf8") }));
const MODAL = "components/Modal.tsx";
const count = (text: string, re: RegExp) => (text.match(re) ?? []).length;

// file → how many `role="dialog" | "alertdialog"` / `aria-modal` attributes it may carry.
const DIALOG_ROLES: Record<string, { n: number; why: string }> = {
  "features/focus/components/TimeUpModal.tsx": {
    n: 2,
    why: "An alertdialog for 'timer finished': it chimes on a repeat and handles its own Escape, and Modal is always role=dialog.",
  },
  "features/habits/components/RowMenu.tsx": {
    n: 2,
    why: "The mobile action sheet shares state with the desktop dropdown; a Modal would lock scroll and trap focus invisibly on desktop.",
  },
  "app/(app)/folders/manage/page.tsx": {
    n: 2,
    why: "The mobile folder action sheet — same reason as RowMenu's.",
  },
  "features/notes/components/NoteEditor.tsx": {
    n: 2,
    why: "Two inline confirm bars inside the editor (alertdialog, not overlays).",
  },
};

// file → how many full-screen `fixed inset-0 z-…` overlays it may build by hand.
const OVERLAYS: Record<string, { n: number; why: string }> = {
  "features/focus/components/TimeUpModal.tsx": { n: 1, why: "See above." },
};

describe("dialogs", () => {
  it("none is hand-built: dialog roles appear only where listed", () => {
    const found: Record<string, number> = {};
    for (const f of files) {
      if (f.rel === MODAL) continue;
      // JSX attributes only (preceded by whitespace) — not a CSS selector string
      // like closest('[role="dialog"]').
      const n = count(f.text, /\s(?:aria-modal=|role="(?:alert)?dialog")/g);
      if (n) found[f.rel] = n;
    }
    const expected = Object.fromEntries(Object.entries(DIALOG_ROLES).map(([k, v]) => [k, v.n]));
    expect(found, "A dialog was hand-built (or an allowlisted one changed). Use components/Modal.tsx, or update DIALOG_ROLES with the reason.").toEqual(expected);
  });

  it("no full-screen overlay is hand-built either", () => {
    const found: Record<string, number> = {};
    for (const f of files) {
      if (f.rel === MODAL) continue;
      // `-z-10 pointer-events-none` decorations (the cursors) are not overlays that take clicks.
      const lines = f.text.split("\n").filter((l) => /fixed inset-0 z-/.test(l) && !/pointer-events-none/.test(l));
      if (lines.length) found[f.rel] = lines.length;
    }
    const expected = Object.fromEntries(Object.entries(OVERLAYS).map(([k, v]) => [k, v.n]));
    expect(found, "A full-screen overlay was hand-built. Use components/Modal.tsx, or update OVERLAYS with the reason.").toEqual(expected);
  });

  it("every dialog file that does use Modal imports the shared one", () => {
    for (const f of files) {
      if (f.rel === MODAL) continue;
      if (/<Modal\b/.test(f.text)) {
        expect(f.text, f.rel).toMatch(
          /import (?:Modal|\{ Modal(?: as \w+)? \}) from "@\/components\/Modal"|function Modal\(/
        );
      }
    }
  });

  it("each allowlist row is still true (no stale reasons)", () => {
    for (const rel of [...Object.keys(DIALOG_ROLES), ...Object.keys(OVERLAYS)]) {
      expect(files.some((f) => f.rel === rel), `${rel} no longer exists`).toBe(true);
    }
  });
});
