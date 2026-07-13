import { describe, expect, it } from "vitest";

import { hasHighlight, highlightSegments } from "@/lib/highlight";

describe("highlightSegments", () => {
  it("returns a single non-matching segment for an empty/whitespace query", () => {
    expect(highlightSegments("Buy milk", "")).toEqual([{ text: "Buy milk", match: false }]);
    expect(highlightSegments("Buy milk", "   ")).toEqual([{ text: "Buy milk", match: false }]);
  });

  it("returns an empty array for empty text", () => {
    expect(highlightSegments("", "milk")).toEqual([]);
  });

  it("splits around a single case-insensitive match", () => {
    expect(highlightSegments("Buy Milk", "milk")).toEqual([
      { text: "Buy ", match: false },
      { text: "Milk", match: true },
    ]);
  });

  it("preserves the original casing of the matched slice", () => {
    const segs = highlightSegments("GitHub", "hub");
    expect(segs).toEqual([
      { text: "Git", match: false },
      { text: "Hub", match: true },
    ]);
  });

  it("marks every occurrence of the query", () => {
    expect(highlightSegments("aXaXa", "a")).toEqual([
      { text: "a", match: true },
      { text: "X", match: false },
      { text: "a", match: true },
      { text: "X", match: false },
      { text: "a", match: true },
    ]);
  });

  it("handles a match at the very start and end", () => {
    expect(highlightSegments("abcab", "ab")).toEqual([
      { text: "ab", match: true },
      { text: "c", match: false },
      { text: "ab", match: true },
    ]);
  });

  it("treats regex metacharacters in the query as literals", () => {
    expect(highlightSegments("value a.b end", "a.b")).toEqual([
      { text: "value ", match: false },
      { text: "a.b", match: true },
      { text: " end", match: false },
    ]);
    // A literal dot should NOT match an arbitrary character.
    expect(highlightSegments("axb", "a.b")).toEqual([{ text: "axb", match: false }]);
  });

  it("matches queries containing +, (), and [] literally", () => {
    expect(highlightSegments("c++ rocks", "c++")).toEqual([
      { text: "c++", match: true },
      { text: " rocks", match: false },
    ]);
  });

  it("returns the whole string as one non-match when nothing matches", () => {
    expect(highlightSegments("hello", "zzz")).toEqual([{ text: "hello", match: false }]);
  });

  it("ignores surrounding whitespace in the query", () => {
    expect(highlightSegments("Water plants", "  plants  ")).toEqual([
      { text: "Water ", match: false },
      { text: "plants", match: true },
    ]);
  });
});

describe("hasHighlight", () => {
  it("is false for empty text or query", () => {
    expect(hasHighlight("", "a")).toBe(false);
    expect(hasHighlight("abc", "")).toBe(false);
    expect(hasHighlight("abc", "   ")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(hasHighlight("GitHub", "hub")).toBe(true);
    expect(hasHighlight("GitHub", "xyz")).toBe(false);
  });
});
