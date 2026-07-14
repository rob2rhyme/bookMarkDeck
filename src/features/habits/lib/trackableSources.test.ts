import { describe, expect, it, vi } from "vitest";

// The registry wires to focusData (which imports the Firebase client, not
// import-safe in the node test env). Stub it — these tests exercise only the
// pure resolveSource/mergeStep logic, never a live subscription.
vi.mock("@/features/focus/data/focusData", () => ({
  subscribeHydration: () => () => {},
  subscribeNotes: () => () => {},
  subscribeMeditationSessions: () => () => {},
  subscribeSessions: () => () => {},
  subscribeResets: () => () => {},
  saveHydration: async () => {},
}));
// inventoryData also imports the Firebase client — stub it (the declutter source
// wires to it), so importing the registry stays node-safe.
vi.mock("@/features/inventory/data/inventoryData", () => ({
  subscribeItems: () => () => {},
}));

import {
  LINK_OPT_OUT,
  mergeStep,
  resolveSource,
  sourceById,
  suggestSource,
} from "@/features/habits/lib/trackableSources";
import type { Habit } from "@/features/habits/lib/types";

const habit = (over: Partial<Habit>): Habit => ({
  id: "h",
  name: "x",
  emoji: "✅",
  hue: 200,
  type: "binary",
  schedule: { type: "daily" },
  archived: false,
  sortOrder: 0,
  createdAt: null,
  ...over,
});

describe("resolveSource", () => {
  it("uses an explicit, type-compatible linkedSourceId", () => {
    const h = habit({ type: "binary", linkedSourceId: "journal", name: "zzz" });
    expect(resolveSource(h)?.id).toBe("journal");
  });

  it("ignores a linkedSourceId whose type doesn't fit the habit", () => {
    // hydration is measurable-only; a binary habit can't bind it
    const h = habit({ type: "binary", linkedSourceId: "hydration", name: "zzz" });
    expect(resolveSource(h)?.id).not.toBe("hydration");
  });

  it("falls back to a heuristic match for custom-named habits", () => {
    const water = habit({
      type: "measurable",
      unit: "cups",
      name: "Hydrate",
      identity: "drink more water",
    });
    expect(resolveSource(water)?.id).toBe("hydration");
  });

  it("does not hijack an unrelated habit", () => {
    const h = habit({ type: "binary", name: "Walk the dog" });
    expect(resolveSource(h)).toBeNull();
  });

  it("links a minutes-based meditation habit", () => {
    const m = habit({
      type: "measurable",
      unit: "min",
      name: "Meditate",
      identity: "be calm",
    });
    expect(resolveSource(m)?.id).toBe("meditation");
  });

  it("links a binary deep-work habit to the focus source (any-type)", () => {
    const d = habit({ type: "binary", name: "Deep work block" });
    expect(resolveSource(d)?.id).toBe("focus");
    expect(sourceById("focus")?.habitType).toBe("any");
  });

  it("links a declutter habit to the inventory source", () => {
    const d = habit({ type: "binary", name: "Declutter one thing" });
    expect(resolveSource(d)?.id).toBe("declutter");
    const donate = habit({ type: "binary", name: "Donate something" });
    expect(resolveSource(donate)?.id).toBe("declutter");
  });

  it("honors an explicit opt-out, but still surfaces the candidate to re-link", () => {
    const j = habit({
      type: "binary",
      name: "Journal",
      identity: "reflect daily",
      linkedSourceId: LINK_OPT_OUT,
    });
    expect(resolveSource(j)).toBeNull(); // opted out → not synced
    expect(suggestSource(j)?.id).toBe("journal"); // …but re-linkable
  });
});

describe("mergeStep — raiseOnly", () => {
  const base = { policy: "raiseOnly" as const, target: 1, isFirst: true };

  it("marks a binary habit done when the signal is present", () => {
    const r = mergeStep({ ...base, habitType: "binary", curCount: 0, remote: 1 });
    expect(r).toEqual({ set: 1, remove: false, mirror: null });
  });

  it("never un-marks when the signal drops to 0", () => {
    const r = mergeStep({ ...base, habitType: "binary", curCount: 1, remote: 0 });
    expect(r).toEqual({ set: null, remove: false, mirror: null });
  });

  it("raises a measurable count but never lowers it", () => {
    expect(
      mergeStep({ ...base, habitType: "measurable", target: 10, curCount: 3, remote: 7 })
    ).toEqual({ set: 7, remove: false, mirror: null });
    expect(
      mergeStep({ ...base, habitType: "measurable", target: 10, curCount: 8, remote: 5 })
    ).toEqual({ set: null, remove: false, mirror: null });
  });

  it("treats a null remote as no progress", () => {
    const r = mergeStep({ ...base, habitType: "binary", curCount: 0, remote: null });
    expect(r.set).toBeNull();
  });
});

describe("mergeStep — bidirectional", () => {
  const base = { policy: "bidirectional" as const, habitType: "measurable" as const, target: 8 };

  it("max-merges on the first snapshot and pushes the higher value back", () => {
    const r = mergeStep({ ...base, curCount: 5, remote: 2, isFirst: true });
    expect(r.set).toBeNull(); // entry already 5 → no rewrite needed
    expect(r.remove).toBe(false);
    expect(r.mirror).toBe(5); // …but Focus gets bumped up to 5
  });

  it("writes the entry up when the remote is higher on first snapshot", () => {
    const r = mergeStep({ ...base, curCount: 2, remote: 5, isFirst: true });
    expect(r.set).toBe(5); // remote higher → entry rises to 5
    expect(r.mirror).toBeNull(); // Focus already at 5, nothing to push
  });

  it("adopts the remote on later snapshots", () => {
    const r = mergeStep({ ...base, curCount: 5, remote: 3, isFirst: false });
    expect(r.set).toBe(3);
    expect(r.mirror).toBeNull();
  });

  it("removes the entry when the remote falls to 0", () => {
    const r = mergeStep({ ...base, curCount: 4, remote: 0, isFirst: false });
    expect(r).toEqual({ set: null, remove: true, mirror: null });
  });

  it("seeds Focus from the habit when no remote doc exists yet", () => {
    const r = mergeStep({ ...base, curCount: 6, remote: null, isFirst: true });
    expect(r.mirror).toBe(6);
    expect(r.set).toBeNull();
  });

  it("does not seed on a later null snapshot", () => {
    const r = mergeStep({ ...base, curCount: 6, remote: null, isFirst: false });
    expect(r.mirror).toBeNull();
  });
});
