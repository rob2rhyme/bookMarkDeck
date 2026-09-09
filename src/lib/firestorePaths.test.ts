import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Every Firestore path in this app must start `users/{uid}` — the rule
 * `CLAUDE.md` states ("Any new collection must stay under `users/{uid}`") and
 * that `firestore.rules` relies on: a single recursive
 * `match /users/{uid}/{document=**}` covers any collection beneath a user and
 * denies everything else by default.
 *
 * It was documented in two places and checked by nothing. A stray
 * `collection(db, "leaked")` passes lint, typecheck and build; it fails only at
 * runtime, when the deny-by-default rule rejects the write — and the tempting
 * "fix" for that is a top-level allow in `firestore.rules`, which is exactly the
 * drift those docs warn about. So the invariant is asserted here instead.
 *
 * Source-scanning is deliberate: this is a property of how the code is written,
 * not of what any one function returns, so no runtime test could see it.
 */

const SRC = join(process.cwd(), "src");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(p);
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : [];
  });
}

/** Every `doc(db, …)` / `collection(db, …)` call, with where it was found. */
function firestoreCalls(): { file: string; line: number; args: string }[] {
  const out: { file: string; line: number; args: string }[] = [];
  for (const file of sourceFiles(SRC)) {
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((text, i) => {
        // `db` is the single Firestore handle (src/lib/firebase.ts). Calls that
        // pass a ref instead — doc(someCollectionRef, id) — are relative to an
        // already-checked path, so they are not the concern here.
        for (const m of text.matchAll(/\b(?:doc|collection)\(db,([^)]*)/g)) {
          out.push({
            file: file.replace(process.cwd() + "/", ""),
            line: i + 1,
            args: m[1].trim(),
          });
        }
      });
  }
  return out;
}

describe("Firestore paths stay under users/{uid}", () => {
  const calls = firestoreCalls();

  it("finds the call sites at all (guards against the scan silently matching nothing)", () => {
    expect(calls.length).toBeGreaterThan(20);
  });

  it("roots every path at the users collection", () => {
    const stray = calls
      .filter((c) => !/^"users"\s*,/.test(c.args))
      .map((c) => `${c.file}:${c.line} — doc/collection(db, ${c.args})`);
    expect(stray).toEqual([]);
  });

  it("scopes every path to a uid variable, never a hardcoded id", () => {
    // `doc(db, "users", "alice")` would read another account's data and slip
    // past the rule above, so the second segment must not be a string literal.
    const hardcoded = calls
      .filter((c) => /^"users"\s*,\s*"/.test(c.args))
      .map((c) => `${c.file}:${c.line} — doc/collection(db, ${c.args})`);
    expect(hardcoded).toEqual([]);
  });
});
