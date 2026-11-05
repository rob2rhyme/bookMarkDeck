import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Route handlers see request bodies: Filing references, notes, photos, tokens. The
// host keeps whatever a handler prints, so a stray `console.log(body)` is a copy of
// user data in a place the Terms and the privacy page never mention. None logs
// today; this keeps it so. A route that needs to report a failure returns a status
// code the client can act on — it does not print the request.
//
// A real need for a log line goes in ALLOWED with the reason, as the other
// source-scanning tests do.

const API_DIR = path.join(process.cwd(), "src", "app", "api");

/** `file (relative to src/app/api)` → why a console call there is fine. */
const ALLOWED: Record<string, string> = {};

function routeFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return routeFiles(p);
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : [];
  });
}

describe("API routes do not log", () => {
  const files = routeFiles(API_DIR);

  it("finds the routes it is meant to scan", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("calls no console method", () => {
    const offenders = files
      .map((f) => path.relative(API_DIR, f).split(path.sep).join("/"))
      .filter((rel) => !(rel in ALLOWED))
      .filter((rel) => /\bconsole\s*\.\s*\w+/.test(fs.readFileSync(path.join(API_DIR, rel), "utf8")))
      .sort();
    expect(offenders, `console.* in an API route: ${offenders.join(", ")}`).toEqual([]);
  });

  it("keeps ALLOWED honest: every row still names a file that logs", () => {
    for (const rel of Object.keys(ALLOWED)) {
      const full = path.join(API_DIR, rel);
      expect(fs.existsSync(full), `${rel} no longer exists`).toBe(true);
      expect(/\bconsole\s*\.\s*\w+/.test(fs.readFileSync(full, "utf8")), `${rel} no longer logs`).toBe(true);
    }
  });
});
