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

import { planCelebration, reachedMilestoneIds } from "@/lib/milestones";

describe("reachedMilestoneIds", () => {
  it("lists every rung reached, not only the highest", () => {
    expect(reachedMilestoneIds({ "focus-streak": 8 })).toEqual(["focus-streak-3", "focus-streak-7"]);
  });

  it("skips missing, zero and sub-threshold metrics", () => {
    expect(reachedMilestoneIds({ "focus-streak": 2, bookmarks: 0, notes: undefined })).toEqual([]);
  });
});

describe("planCelebration", () => {
  it("celebrates nothing on the first look, and records everything already earned", () => {
    const plan = planCelebration({ "focus-streak": 30, bookmarks: 120 }, null);
    expect(plan.fresh).toEqual([]);
    expect(plan.seen).toEqual(
      expect.arrayContaining(["focus-streak-3", "focus-streak-7", "focus-streak-30", "bookmarks-25", "bookmarks-100"])
    );
  });

  it("celebrates a rung crossed since, once", () => {
    const first = planCelebration({ "focus-streak": 6 }, null);
    const next = planCelebration({ "focus-streak": 7 }, first.seen);
    expect(next.fresh.map((m) => m.id)).toEqual(["focus-streak-7"]);
    expect(planCelebration({ "focus-streak": 7 }, next.seen).fresh).toEqual([]);
  });

  it("does not celebrate a lower rung again after a streak broke and climbed back", () => {
    const seen = planCelebration({ "focus-streak": 8 }, null).seen;
    expect(planCelebration({ "focus-streak": 3 }, seen).fresh).toEqual([]);
  });

  it("names only the highest rung when several are crossed at once", () => {
    const seen = planCelebration({ "focus-sessions": 5 }, null).seen;
    const plan = planCelebration({ "focus-sessions": 60 }, seen);
    expect(plan.fresh.map((m) => m.id)).toEqual(["focus-sessions-50"]);
    // ...and the rungs it skipped over are not left to celebrate later.
    expect(planCelebration({ "focus-sessions": 60 }, plan.seen).fresh).toEqual([]);
    expect(plan.seen).toEqual(expect.arrayContaining(["focus-sessions-10", "focus-sessions-25"]));
  });
});
