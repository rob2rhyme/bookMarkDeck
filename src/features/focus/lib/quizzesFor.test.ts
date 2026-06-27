import { describe, expect, it } from "vitest";

import { quizzesFor } from "@/features/focus/lib/topics";

describe("quizzesFor difficulty floor", () => {
  it("returns every level by default", () => {
    const levels = new Set(quizzesFor(undefined).map((q) => q.level));
    expect(levels.has("Easy")).toBe(true);
    expect(levels.has("Medium")).toBe(true);
    expect(levels.has("Hard")).toBe(true);
  });

  it("drops Easy questions at the 'medium' floor", () => {
    const pool = quizzesFor(undefined, "medium");
    expect(pool.length).toBeGreaterThan(0);
    expect(pool.every((q) => q.level === "Medium" || q.level === "Hard")).toBe(true);
  });

  it("keeps only Hard questions at the 'hard' floor", () => {
    const pool = quizzesFor(undefined, "hard");
    expect(pool.length).toBeGreaterThan(0);
    expect(pool.every((q) => q.level === "Hard")).toBe(true);
  });

  it("a harder floor yields a smaller-or-equal pool", () => {
    const all = quizzesFor(undefined, "all").length;
    const medium = quizzesFor(undefined, "medium").length;
    const hard = quizzesFor(undefined, "hard").length;
    expect(medium).toBeLessThanOrEqual(all);
    expect(hard).toBeLessThanOrEqual(medium);
  });

  it("respects the active topic while filtering by level", () => {
    const pool = quizzesFor(["coding"], "hard");
    expect(pool.length).toBeGreaterThan(0);
    expect(pool.every((q) => q.level === "Hard")).toBe(true);
  });
});
