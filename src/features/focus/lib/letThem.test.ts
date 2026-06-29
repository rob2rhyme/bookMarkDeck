import { describe, expect, it } from "vitest";

import { countOnDay, getReframe, resetStreak } from "@/features/focus/lib/letThem";

describe("getReframe", () => {
  it("matches a known trigger by label (case-insensitive)", () => {
    expect(getReframe("Criticism")).toContain("opinion");
    expect(getReframe("criticism")).toContain("opinion");
  });
  it("matches by id", () => {
    expect(getReframe("fomo")).toContain("everywhere");
  });
  it("falls back to a generic reframe for unknown/empty triggers", () => {
    const generic = getReframe("");
    expect(getReframe("something random")).toBe(generic);
    expect(generic.toLowerCase()).toContain("let them");
  });
});

describe("countOnDay", () => {
  it("counts resets on a given day", () => {
    const resets = [{ day: "2026-06-29" }, { day: "2026-06-29" }, { day: "2026-06-28" }];
    expect(countOnDay(resets, "2026-06-29")).toBe(2);
    expect(countOnDay(resets, "2026-06-28")).toBe(1);
    expect(countOnDay(resets, "2026-06-27")).toBe(0);
  });
});

describe("resetStreak", () => {
  it("is 0 with no resets", () => {
    expect(resetStreak([], "2026-06-29")).toBe(0);
  });
  it("counts consecutive days ending today", () => {
    const resets = [{ day: "2026-06-29" }, { day: "2026-06-28" }, { day: "2026-06-27" }];
    expect(resetStreak(resets, "2026-06-29")).toBe(3);
  });
  it("keeps a live streak when today has none yet (counts through yesterday)", () => {
    const resets = [{ day: "2026-06-28" }, { day: "2026-06-27" }];
    expect(resetStreak(resets, "2026-06-29")).toBe(2);
  });
  it("breaks on a gap", () => {
    const resets = [{ day: "2026-06-29" }, { day: "2026-06-27" }];
    expect(resetStreak(resets, "2026-06-29")).toBe(1);
  });
  it("dedupes multiple resets on the same day", () => {
    const resets = [{ day: "2026-06-29" }, { day: "2026-06-29" }];
    expect(resetStreak(resets, "2026-06-29")).toBe(1);
  });
});
