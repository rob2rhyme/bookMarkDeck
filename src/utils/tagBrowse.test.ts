import { describe, expect, it } from "vitest";

import { countTags, hasTag, tagKey } from "@/utils/tagBrowse";

const b = (...tags: string[]) => ({ tags });

describe("countTags", () => {
  it("counts bookmarks per tag, most used first, ties alphabetical", () => {
    const out = countTags([b("dev", "news"), b("dev"), b("banking"), b("news")]);
    expect(out.map((t) => [t.label, t.count])).toEqual([
      ["dev", 2],
      ["news", 2],
      ["banking", 1],
    ]);
  });

  it("treats case and padding as one tag, shown as first written", () => {
    const out = countTags([b("Work"), b(" work "), b("WORK")]);
    expect(out).toEqual([{ key: "work", label: "Work", count: 3 }]);
  });

  it("counts a bookmark once per tag even if it repeats the tag", () => {
    expect(countTags([b("a", "A", "a")])).toEqual([{ key: "a", label: "a", count: 1 }]);
  });

  it("ignores blank tags and bookmarks with none", () => {
    expect(countTags([b("", "  "), { tags: undefined }, {}])).toEqual([]);
  });
});

describe("hasTag", () => {
  it("matches case-insensitively and an empty filter matches all", () => {
    expect(hasTag(b("Dev"), tagKey("dev"))).toBe(true);
    expect(hasTag(b("Dev"), tagKey("news"))).toBe(false);
    expect(hasTag(b(), "")).toBe(true);
    expect(hasTag({}, "dev")).toBe(false);
  });
});
