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
  hydrationTransport: { send: async () => {}, recover: async () => {} },
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
  const base = { policy: "raiseOnly" as const, target: 1 };

  it("marks a binary habit done when the signal is present", () => {
    const r = mergeStep({ ...base, habitType: "binary", curCount: 0, remote: 1 });
    expect(r).toEqual({ set: 1, remove: false });
  });

  it("never un-marks when the signal drops to 0", () => {
    const r = mergeStep({ ...base, habitType: "binary", curCount: 1, remote: 0 });
    expect(r).toEqual({ set: null, remove: false });
  });

  it("raises a measurable count but never lowers it", () => {
    expect(
      mergeStep({ ...base, habitType: "measurable", target: 10, curCount: 3, remote: 7 })
    ).toEqual({ set: 7, remove: false });
    expect(
      mergeStep({ ...base, habitType: "measurable", target: 10, curCount: 8, remote: 5 })
    ).toEqual({ set: null, remove: false });
  });

  it("treats a null remote as no progress", () => {
    const r = mergeStep({ ...base, habitType: "binary", curCount: 0, remote: null });
    expect(r.set).toBeNull();
  });
});

// Hydration's count travels as increments, so the habit adopts it and never
// pushes its own back: a count pushed back is added a second time to cups still
// on their way. The first snapshot used to max-merge and push the higher value.
describe("mergeStep — bidirectional", () => {
  const base = { policy: "bidirectional" as const, habitType: "measurable" as const, target: 8 };

  it("adopts a lower remote, even on the first snapshot", () => {
    expect(mergeStep({ ...base, curCount: 5, remote: 3 })).toEqual({ set: 3, remove: false });
  });

  it("adopts a higher remote", () => {
    expect(mergeStep({ ...base, curCount: 2, remote: 5 })).toEqual({ set: 5, remove: false });
  });

  it("removes the entry when the remote falls to 0", () => {
    expect(mergeStep({ ...base, curCount: 4, remote: 0 })).toEqual({ set: null, remove: true });
  });

  it("changes nothing when the remote matches", () => {
    expect(mergeStep({ ...base, curCount: 4, remote: 4 })).toEqual({ set: null, remove: false });
  });

  // The habit's own taps are already on their way as increments.
  it("changes nothing, and seeds nothing, when no record exists yet", () => {
    expect(mergeStep({ ...base, curCount: 6, remote: null })).toEqual({ set: null, remove: false });
  });
});
