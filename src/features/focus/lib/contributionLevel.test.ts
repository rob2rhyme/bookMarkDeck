import { describe, expect, it } from "vitest";

import { levelFor } from "@/features/focus/components/ContributionsCalendar";

describe("levelFor (contribution heatmap intensity)", () => {
  it("maps day counts to the five intensity buckets", () => {
    expect(levelFor(0)).toBe(0);
    expect(levelFor(-3)).toBe(0);
    expect(levelFor(1)).toBe(1);
    expect(levelFor(2)).toBe(1);
    expect(levelFor(3)).toBe(2);
    expect(levelFor(4)).toBe(2);
    expect(levelFor(7)).toBe(3);
    expect(levelFor(8)).toBe(4);
    expect(levelFor(99)).toBe(4);
  });

  it("is monotonic — more activity never means a lower level", () => {
    let prev = 0;
    for (let n = 0; n <= 30; n++) {
      const level = levelFor(n);
      expect(level).toBeGreaterThanOrEqual(prev);
      prev = level;
    }
  });
});
