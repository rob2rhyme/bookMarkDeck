import { describe, expect, it } from "vitest";

import { appendBullet, hasBullets, toNoteBlocks } from "@/utils/noteFormat";

describe("hasBullets", () => {
  it("detects -, *, • bullet lines", () => {
    expect(hasBullets("- a")).toBe(true);
    expect(hasBullets("* a")).toBe(true);
    expect(hasBullets("• a")).toBe(true);
    expect(hasBullets("  - indented")).toBe(true);
  });
  it("ignores non-bullets and dashes without a space", () => {
    expect(hasBullets("plain")).toBe(false);
    expect(hasBullets("-nospace")).toBe(false);
    expect(hasBullets("a - b")).toBe(false); // dash mid-line
  });
});

describe("toNoteBlocks", () => {
  it("returns a single text block when there are no bullets", () => {
    expect(toNoteBlocks("hello\nworld")).toEqual([
      { type: "text", text: "hello\nworld" },
    ]);
  });

  it("groups consecutive bullet lines into one list", () => {
    expect(toNoteBlocks("- a\n- b\n* c")).toEqual([
      { type: "list", items: ["a", "b", "c"] },
    ]);
  });

  it("interleaves text and lists in order", () => {
    expect(toNoteBlocks("Intro\n- one\n- two\nOutro")).toEqual([
      { type: "text", text: "Intro" },
      { type: "list", items: ["one", "two"] },
      { type: "text", text: "Outro" },
    ]);
  });
});

describe("appendBullet", () => {
  it("seeds the first bullet on empty text", () => {
    expect(appendBullet("")).toBe("- ");
  });
  it("starts a new bullet line after content", () => {
    expect(appendBullet("hi")).toBe("hi\n- ");
  });
  it("does not add a blank line when text already ends in newline", () => {
    expect(appendBullet("hi\n")).toBe("hi\n- ");
  });
});
