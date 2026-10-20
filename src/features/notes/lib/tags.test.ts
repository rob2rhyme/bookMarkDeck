import { describe, expect, it } from "vitest";

import { MAX_TAGS_PER_NOTE, normalizeTag, normalizeTags, renameIn, suggestTags, tagCounts } from "./tags";

describe("normalizeTag", () => {
  it.each([
    ["Work", "work"],
    ["#Work", "work"],
    ["  ##work  ", "work"],
    ["To Do", "to-do"],
    ["to   do", "to-do"],
    ["work/Clients", "work/clients"],
    ["café", "café"],
    ["日本", "日本"],
    ["a!b?c", "abc"],
    ["--x--", "x"],
    ["/x/", "x"],
    ["a--b", "a-b"],
  ])("%s → %s", (raw, tag) => {
    expect(normalizeTag(raw)).toBe(tag);
  });

  it.each(["", "   ", "#", "!!!", "---"])("rejects %j", (raw) => {
    expect(normalizeTag(raw)).toBeNull();
  });

  it("caps the length without leaving a trailing dash", () => {
    const t = normalizeTag("a".repeat(31) + " bcd")!;
    expect(t.length).toBeLessThanOrEqual(32);
    expect(t.endsWith("-")).toBe(false);
  });
});

describe("normalizeTags", () => {
  it("canonicalises, drops junk and de-duplicates", () => {
    expect(normalizeTags(["Work", "#work", 3, "", "Home", null])).toEqual(["work", "home"]);
    expect(normalizeTags("work")).toEqual([]);
  });

  it("caps the count", () => {
    expect(normalizeTags(Array.from({ length: 30 }, (_, i) => `t${i}`))).toHaveLength(MAX_TAGS_PER_NOTE);
  });
});

describe("tagCounts / suggestTags", () => {
  const counts = tagCounts([
    { tags: ["work", "ideas"] },
    { tags: ["work"] },
    { tags: ["home", "homework"] },
  ]);

  it("orders by use, then name", () => {
    expect(counts).toEqual([
      { tag: "work", count: 2 },
      { tag: "home", count: 1 },
      { tag: "homework", count: 1 },
      { tag: "ideas", count: 1 },
    ]);
  });

  it("suggests prefix matches before substring matches, excluding tags already on the note", () => {
    expect(suggestTags(counts, "wo", [])).toEqual(["work", "homework"]);
    expect(suggestTags(counts, "#Ho", ["home"])).toEqual(["homework"]);
  });

  it("offers the most-used tags for an empty prefix", () => {
    expect(suggestTags(counts, "", ["work"], 2)).toEqual(["home", "homework"]);
  });
});

describe("renameIn", () => {
  it("renames, merging into an existing tag", () => {
    expect(renameIn(["a", "b"], "a", "c")).toEqual(["c", "b"]);
    expect(renameIn(["a", "b"], "a", "b")).toEqual(["b"]);
  });

  it("returns the same array when the tag is absent", () => {
    const tags = ["a"];
    expect(renameIn(tags, "z", "y")).toBe(tags);
  });
});
