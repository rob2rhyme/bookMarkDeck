import { describe, expect, it } from "vitest";

import { STARTER_TASK_GROUPS, planStarterTasks } from "@/features/focus/lib/starterTasks";

describe("planStarterTasks", () => {
  it("keeps the groups' order, not the order picked", () => {
    expect(planStarterTasks(["Reading", "Writing", "Calls"], [])).toEqual(["Writing", "Calls", "Reading"]);
  });

  it("skips tasks already on the list, ignoring case", () => {
    expect(planStarterTasks(["Writing", "Reading"], ["  writing "])).toEqual(["Reading"]);
  });

  it("ignores anything that isn't a starter", () => {
    expect(planStarterTasks(["Something else"], [])).toEqual([]);
  });

  it("has no duplicate task across groups", () => {
    const all = STARTER_TASK_GROUPS.flatMap((g) => g.tasks);
    expect(new Set(all).size).toBe(all.length);
  });
});
