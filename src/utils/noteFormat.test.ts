import { describe, expect, it } from "vitest";

import {
  appendBullet,
  appendNumber,
  hasBullets,
  hasNumberedList,
  toNoteBlocks,
} from "@/utils/noteFormat";

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

describe("hasNumberedList", () => {
  it("detects 1. and 2) numbered lines", () => {
    expect(hasNumberedList("1. a")).toBe(true);
    expect(hasNumberedList("2) b")).toBe(true);
    expect(hasNumberedList("  3. indented")).toBe(true);
  });
  it("ignores plain text and numbers without a separator+space", () => {
    expect(hasNumberedList("plain")).toBe(false);
    expect(hasNumberedList("1.nospace")).toBe(false);
    expect(hasNumberedList("step 1. do it")).toBe(false);
  });
});

describe("toNoteBlocks (numbered)", () => {
  it("groups consecutive numbered lines into one ordered list", () => {
    expect(toNoteBlocks("1. a\n2. b\n3) c")).toEqual([
      { type: "ordered", items: ["a", "b", "c"] },
    ]);
  });
  it("keeps bullet and numbered lists as separate blocks", () => {
    expect(toNoteBlocks("- a\n1. b")).toEqual([
      { type: "list", items: ["a"] },
      { type: "ordered", items: ["b"] },
    ]);
  });
});

describe("appendNumber", () => {
  it("seeds the first item on empty text", () => {
    expect(appendNumber("")).toBe("1. ");
  });
  it("starts a numbered line after plain content", () => {
    expect(appendNumber("hi")).toBe("hi\n1. ");
  });
  it("continues the trailing numbered run", () => {
    expect(appendNumber("1. a")).toBe("1. a\n2. ");
    expect(appendNumber("1. a\n2. b")).toBe("1. a\n2. b\n3. ");
  });
  it("does not add a blank line when text already ends in newline", () => {
    expect(appendNumber("1. a\n")).toBe("1. a\n2. ");
  });
});
