import { describe, expect, it } from "vitest";

import { STARTER_GROUPS, planStarterLinks } from "@/utils/starterLinks";
import { isUnsafeUrl, normalizeUrl } from "@/utils/normalizeUrl";

const link = (title: string) =>
  STARTER_GROUPS.flatMap((g) => g.links).find((l) => l.title === title)!;

describe("STARTER_GROUPS", () => {
  it("holds only safe https links, each once", () => {
    const all = STARTER_GROUPS.flatMap((g) => g.links);
    for (const l of all) {
      expect(l.url.startsWith("https://"), l.title).toBe(true);
      expect(isUnsafeUrl(l.url), l.title).toBe(false);
      expect(normalizeUrl(l.url), l.title).toBeTruthy();
    }
    expect(new Set(all.map((l) => l.url)).size).toBe(all.length);
  });
});

describe("planStarterLinks", () => {
  it("files picked links under their group's folder, in group order", () => {
    const plan = planStarterLinks([link("GitHub"), link("Gmail"), link("MDN Web Docs")], []);
    expect(plan).toEqual([
      { folder: "Mail & calendar", links: [link("Gmail")] },
      { folder: "Dev", links: [link("GitHub"), link("MDN Web Docs")] },
    ]);
  });

  it("skips links the library already has, and groups left empty", () => {
    const plan = planStarterLinks([link("GitHub"), link("Gmail")], ["HTTPS://GITHUB.COM"]);
    expect(plan).toEqual([{ folder: "Mail & calendar", links: [link("Gmail")] }]);
  });

  it("is empty when nothing is picked", () => {
    expect(planStarterLinks([], [])).toEqual([]);
  });
});
