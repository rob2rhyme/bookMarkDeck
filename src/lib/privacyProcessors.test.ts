import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// The privacy page lists every outside service that receives data, and what each
// gets. A list like that goes stale the day someone adds a provider: the code calls
// it and the page never says so. This fails when the source uses a service the page
// doesn't name — and when a row's service is no longer in the source, so a removed
// provider leaves the page too.
//
// A detector looks for what using the service leaves in the code: an SDK import, an
// API host. A service with no such trace (Vercel, the browsers' push services) is
// named on the page without a row here.

const ROOT = process.cwd();
const PAGE = path.join(ROOT, "src", "app", "(app)", "privacy", "page.tsx");

/** Name as the page writes it → what in the source shows the service is used. */
const SERVICES: Array<{ name: string; used: RegExp }> = [
  { name: "Google", used: /firebase\/firestore/ },
  { name: "Cloudflare", used: /r2\.cloudflarestorage\.com/ },
  { name: "Upstash", used: /@upstash\/redis/ },
  { name: "QStash", used: /@upstash\/qstash/ },
  { name: "Anthropic", used: /@anthropic-ai\/sdk/ },
  { name: "OpenAI", used: /api\.openai\.com/ },
  { name: "UPCitemdb", used: /upcitemdb\.com/ },
  { name: "Open Food Facts", used: /openfoodfacts\.org/ },
  { name: "Open Beauty Facts", used: /openbeautyfacts\.org/ },
  { name: "Open Products Facts", used: /openproductsfacts\.org/ },
  { name: "Open Library", used: /openlibrary\.org/ },
  { name: "jsDelivr", used: /cdn\.jsdelivr\.net/ },
  { name: "Lemon Squeezy", used: /api\.lemonsqueezy\.com|lemonsqueezy/i },
];

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "test" ? [] : sourceFiles(p);
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : [];
  });
}

describe("the privacy page names every outside service the code uses", () => {
  const source = [...sourceFiles(path.join(ROOT, "src")), path.join(ROOT, "next.config.ts")]
    .filter((f) => f !== PAGE)
    .map((f) => fs.readFileSync(f, "utf8"))
    .join("\n");
  // Collapsed, as JSX renders it: a name may wrap across lines in the source.
  const page = fs.readFileSync(PAGE, "utf8").replace(/\s+/g, " ");

  it.each(SERVICES)("$name: used in the source and named on the page", ({ name, used }) => {
    expect(used.test(source), `${name} no longer appears in the source — take it off the page and this list`).toBe(true);
    expect(page, `the source uses ${name}, but the privacy page doesn't name it`).toContain(name);
  });
});
