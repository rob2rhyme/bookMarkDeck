import { describe, expect, it } from "vitest";

import { blockIndexFor, segmentBlock } from "@/lib/highlightSegments";

const h = (id: string, text: string) => ({ id, text, createdAt: "2026-01-01T00:00:00Z" });

describe("segmentBlock", () => {
  it("returns the whole text when nothing is highlighted", () => {
    expect(segmentBlock("Plain words.", [])).toEqual([{ text: "Plain words." }]);
  });

  it("splits around a highlight, keeping every character", () => {
    const segs = segmentBlock("Say the quiet part out loud.", [h("a", "quiet part")]);
    expect(segs).toEqual([{ text: "Say the " }, { text: "quiet part", highlightId: "a" }, { text: " out loud." }]);
    expect(segs.map((s) => s.text).join("")).toBe("Say the quiet part out loud.");
  });

  it("marks several, in text order, whatever order they were added", () => {
    const segs = segmentBlock("one two three", [h("b", "three"), h("a", "one")]);
    expect(segs.filter((s) => s.highlightId).map((s) => s.highlightId)).toEqual(["a", "b"]);
  });

  it("lets the earlier of two overlapping highlights win", () => {
    const segs = segmentBlock("abcdefgh", [h("x", "cdef"), h("y", "efgh")]);
    expect(segs.filter((s) => s.highlightId).map((s) => s.highlightId)).toEqual(["x"]);
    expect(segs.map((s) => s.text).join("")).toBe("abcdefgh");
  });

  it("ignores a highlight whose text isn't in this block", () => {
    expect(segmentBlock("Other text.", [h("a", "missing")])).toEqual([{ text: "Other text." }]);
  });
});

describe("blockIndexFor", () => {
  const blocks = [{ text: "First paragraph." }, { text: "Second one here." }];
  it("finds the block holding the selection", () => {
    expect(blockIndexFor(blocks, "one here")).toBe(1);
  });
  it("is -1 for a selection spanning blocks, or empty", () => {
    expect(blockIndexFor(blocks, "paragraph. Second")).toBe(-1);
    expect(blockIndexFor(blocks, "")).toBe(-1);
  });
});
