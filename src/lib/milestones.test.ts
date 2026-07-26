import { describe, it, expect } from "vitest";
import { earnedMilestones } from "./milestones";

describe("earnedMilestones", () => {
  it("returns [] when no metric clears its first threshold", () => {
    expect(earnedMilestones({})).toEqual([]);
    expect(earnedMilestones({ "focus-streak": 2, "focus-sessions": 9 })).toEqual([]);
    expect(earnedMilestones({ "focus-minutes": 0 })).toEqual([]);
  });

  it("returns the highest threshold crossed per metric", () => {
    const out = earnedMilestones({ "focus-streak": 20 });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: "focus-streak-14", value: 14, icon: "🔥" });
    expect(out[0].label).toBe("14-day focus streak");
  });

  it("caps at the top threshold when the value exceeds it", () => {
    const out = earnedMilestones({ "focus-sessions": 9999 });
    expect(out[0]).toMatchObject({ id: "focus-sessions-500", value: 500 });
  });

  it("reports multiple metrics independently", () => {
    const out = earnedMilestones({
      "focus-streak": 7,
      items: 50,
      bookmarks: 30,
    });
    const byMetric = Object.fromEntries(out.map((m) => [m.metric, m.value]));
    expect(byMetric).toEqual({
      "focus-streak": 7,
      items: 50,
      bookmarks: 25,
    });
  });

  it("ignores undefined / negative metrics", () => {
    const out = earnedMilestones({ "habit-streak": undefined, items: -5, bookmarks: 100 });
    expect(out).toHaveLength(1);
    expect(out[0].metric).toBe("bookmarks");
  });
});
