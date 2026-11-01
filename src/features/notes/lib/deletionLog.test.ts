import { describe, expect, it } from "vitest";

import { hasEntriesMissingFrom, MAX_DELETIONS, mergeDeletions, normalizeDeletions } from "./deletionLog";

const e = (id: string, day: number) => ({ id, title: id, at: new Date(Date.UTC(2026, 0, day)).toISOString() });

describe("deletion log", () => {
  it("merges two devices' copies as a union, newest first", () => {
    const merged = mergeDeletions([e("a", 1), e("b", 3)], [e("b", 3), e("c", 2)]);
    expect(merged.map((x) => x.id)).toEqual(["b", "c", "a"]);
  });

  it("keeps a note deleted twice as two entries", () => {
    expect(mergeDeletions([e("a", 1)], [e("a", 5)])).toHaveLength(2);
  });

  it("caps at the newest entries", () => {
    const many = Array.from({ length: MAX_DELETIONS + 5 }, (_, i) => e(`n${i}`, i + 1));
    const merged = mergeDeletions(many);
    expect(merged).toHaveLength(MAX_DELETIONS);
    expect(merged.at(-1)?.id).toBe("n5");
  });

  it("knows when this device holds entries the cloud lacks", () => {
    expect(hasEntriesMissingFrom([e("a", 1), e("b", 2)], [e("a", 1)])).toBe(true);
    expect(hasEntriesMissingFrom([e("a", 1)], [e("a", 1), e("b", 2)])).toBe(false);
  });

  it("drops malformed entries and never keeps more than a title", () => {
    expect(normalizeDeletions([{ id: "x", at: "bad" }, { id: "y", at: e("y", 1).at, title: 5, body: "s" }, null])).toEqual([
      { id: "y", title: "", at: e("y", 1).at },
    ]);
  });
});
