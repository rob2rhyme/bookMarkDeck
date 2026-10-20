import { describe, expect, it } from "vitest";

import {
  appendEvent,
  describeEvent,
  EDIT_SESSION_MS,
  MAX_NOTE_EVENTS,
  normalizeActivity,
  tagDiff,
  type NoteEvent,
} from "./activity";

const t = (min: number) => new Date(Date.UTC(2026, 9, 20, 9, 0) + min * 60_000).toISOString();

describe("appendEvent", () => {
  it("folds saves less than 30 minutes apart into one edit, keeping when the run began", () => {
    let h: NoteEvent[] = [{ at: t(0), kind: "created" }];
    h = appendEvent(h, { at: t(1), kind: "edited" });
    h = appendEvent(h, { at: t(20), kind: "edited" });
    h = appendEvent(h, { at: t(45), kind: "edited" }); // 25 min after the last save
    expect(h).toEqual([
      { at: t(0), kind: "created" },
      { at: t(45), kind: "edited", n: 3, from: t(1) },
    ]);
  });

  it("starts a new entry after a pause, or after any other event", () => {
    let h: NoteEvent[] = [];
    h = appendEvent(h, { at: t(0), kind: "edited" });
    h = appendEvent(h, { at: t(EDIT_SESSION_MS / 60_000 + 1), kind: "edited" });
    h = appendEvent(h, { at: t(40), kind: "pinned" });
    h = appendEvent(h, { at: t(41), kind: "edited" });
    expect(h.map((e) => e.kind)).toEqual(["edited", "edited", "pinned", "edited"]);
  });

  it("keeps only the newest events", () => {
    let h: NoteEvent[] = [];
    for (let i = 0; i < MAX_NOTE_EVENTS + 10; i++) h = appendEvent(h, { at: t(i), kind: i % 2 ? "pinned" : "unpinned" });
    expect(h).toHaveLength(MAX_NOTE_EVENTS);
    expect(h[h.length - 1].at).toBe(t(MAX_NOTE_EVENTS + 9));
  });
});

describe("normalizeActivity", () => {
  it("drops unknown kinds, bad instants and stray fields, and sorts oldest first", () => {
    const h = normalizeActivity([
      { at: t(5), kind: "edited", n: 4, from: t(1), body: "secret" },
      { at: "nope", kind: "created" },
      { at: t(0), kind: "created" },
      { at: t(6), kind: "exfiltrated" },
      { at: t(7), kind: "tagged", added: ["a", 3], removed: [] },
      "junk",
    ]);
    expect(h).toEqual([
      { at: t(0), kind: "created" },
      { at: t(5), kind: "edited", n: 4, from: t(1) },
      { at: t(7), kind: "tagged", added: ["a"] },
    ]);
  });
});

describe("describing", () => {
  it("reads naturally", () => {
    expect(describeEvent({ at: t(0), kind: "edited", n: 3 })).toBe("Edited (3 saves)");
    expect(describeEvent({ at: t(0), kind: "tagged", ...tagDiff(["a", "b"], ["b", "c"]) })).toBe(
      "Tags added #c, removed #a"
    );
    expect(describeEvent({ at: t(0), kind: "imported" })).toBe("Restored from a backup");
  });
});
