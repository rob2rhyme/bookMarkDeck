import { describe, expect, it } from "vitest";

import {
  DEFAULT_NAME,
  MAX_NAME_CHARS,
  STAGES,
  cleanName,
  companionState,
  daysBetween,
  moodFor,
  readPrefs,
  stageFor,
  type CompanionInput,
} from "@/features/habits/lib/companion";

const base: CompanionInput = { checkins: 0, dueToday: 3, doneToday: 0, lastDoneDay: null, today: "2026-11-03", name: "Fern" };

describe("stageFor", () => {
  it("steps at the thresholds and never goes past the last", () => {
    expect(stageFor(0)).toBe(0);
    expect(stageFor(1)).toBe(1);
    expect(stageFor(6)).toBe(1);
    expect(stageFor(7)).toBe(2);
    expect(stageFor(499)).toBe(5);
    expect(stageFor(500)).toBe(STAGES.length - 1);
    expect(stageFor(100000)).toBe(STAGES.length - 1);
  });

  it("never gives a lower stage for more check-ins", () => {
    let prev = 0;
    for (let n = 0; n < 700; n++) {
      const s = stageFor(n);
      expect(s).toBeGreaterThanOrEqual(prev);
      prev = s;
    }
  });
});

describe("moodFor", () => {
  const m = (over: Partial<CompanionInput>) => moodFor({ ...base, ...over });
  it("is radiant once everything due is done, glad when some is", () => {
    expect(m({ doneToday: 3 })).toBe("radiant");
    expect(m({ doneToday: 5 })).toBe("radiant"); // extra check-ins beyond what was due
    expect(m({ doneToday: 1 })).toBe("glad");
  });
  it("rests on a day with nothing scheduled, even after a long gap", () => {
    expect(m({ dueToday: 0, lastDoneDay: "2026-10-01" })).toBe("resting");
  });
  it("says welcome back after a gap of three days or more, only while nothing is done", () => {
    expect(m({ lastDoneDay: "2026-10-31" })).toBe("welcome"); // 3 days
    expect(m({ lastDoneDay: "2026-11-01" })).toBe("waiting"); // 2 days
    expect(m({ lastDoneDay: "2026-10-01", doneToday: 1 })).toBe("glad");
  });
  it("waits, without scolding, on a fresh account", () => {
    expect(m({ lastDoneDay: null })).toBe("waiting");
  });
});

describe("companionState", () => {
  it("reports growth within the stage and what's left to the next", () => {
    const s = companionState({ ...base, checkins: 4 }); // Sprout (1) → Seedling (7)
    expect(s.stageName).toBe("Sprout");
    expect(s.toNext).toBe(3);
    expect(s.growth).toBeCloseTo(0.5);
  });

  it("is full-grown at the last stage with nothing further to reach", () => {
    const s = companionState({ ...base, checkins: 900 });
    expect(s.stageName).toBe("Old tree");
    expect(s.toNext).toBeNull();
    expect(s.growth).toBe(1);
  });

  it("uses the companion's name, and picks the same line all day", () => {
    const a = companionState({ ...base, doneToday: 3, checkins: 10 });
    const b = companionState({ ...base, doneToday: 3, checkins: 11 });
    expect(a.line).toContain("Fern");
    expect(a.line).not.toContain("{name}");
    expect(a.line).toBe(b.line);
  });

  it("rotates its lines across days", () => {
    const lines = new Set(
      Array.from({ length: 30 }, (_, i) => companionState({ ...base, today: `2026-11-${String(i + 1).padStart(2, "0")}` }).line)
    );
    expect(lines.size).toBeGreaterThan(1);
  });

  it("never mentions guilt: no streak loss, no missed days", () => {
    const welcome = companionState({ ...base, lastDoneDay: "2026-09-01" });
    expect(welcome.mood).toBe("welcome");
    expect(welcome.line).not.toMatch(/miss|lost|wilt|died|streak|late|behind/i);
  });
});

describe("daysBetween", () => {
  it("counts whole calendar days, across a month and a leap day", () => {
    expect(daysBetween("2026-10-31", "2026-11-03")).toBe(3);
    expect(daysBetween("2028-02-28", "2028-03-01")).toBe(2);
    expect(daysBetween("2026-11-03", "2026-11-03")).toBe(0);
  });
});

describe("cleanName", () => {
  it("collapses, trims, caps, and falls back to the default", () => {
    expect(cleanName("  Fern   the  Great ")).toBe("Fern the Great");
    expect(cleanName("x".repeat(60))).toHaveLength(MAX_NAME_CHARS);
    expect(cleanName("   ")).toBe(DEFAULT_NAME);
  });
});

describe("readPrefs", () => {
  it("reads a stored name and hidden flag, defensively", () => {
    expect(readPrefs(JSON.stringify({ name: "Moss", hidden: true }))).toEqual({ name: "Moss", hidden: true });
    expect(readPrefs(null)).toEqual({ name: DEFAULT_NAME, hidden: false });
    expect(readPrefs("{not json")).toEqual({ name: DEFAULT_NAME, hidden: false });
    expect(readPrefs(JSON.stringify({ name: 7, hidden: "yes" }))).toEqual({ name: DEFAULT_NAME, hidden: false });
  });
});
