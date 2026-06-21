import { describe, expect, it } from "vitest";

import { isMoodKey, MOODS } from "@/features/focus/lib/mood";

describe("isMoodKey", () => {
  it("accepts every defined mood key", () => {
    for (const mood of MOODS) {
      expect(isMoodKey(mood.key)).toBe(true);
    }
  });

  it("rejects unknown / non-string values", () => {
    expect(isMoodKey("ecstatic")).toBe(false);
    expect(isMoodKey("")).toBe(false);
    expect(isMoodKey(null)).toBe(false);
    expect(isMoodKey(42)).toBe(false);
    expect(isMoodKey(undefined)).toBe(false);
  });
});
