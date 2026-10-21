import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { computeWeeklyRecap, formatMinutes, recapWeeks, type RecapSources } from "./weeklyRecap";

// Day logic pins a zone (CLAUDE.md → Day keys are LOCAL): CI runs in UTC, where
// a late-evening instant west of UTC is already "tomorrow".
const savedTz = process.env.TZ;
beforeEach(() => {
  process.env.TZ = "America/Los_Angeles";
});
afterEach(() => {
  process.env.TZ = savedTz;
});

// Wednesday 21 Oct 2026, 21:30 local — 04:30 Thursday in UTC.
const NOW = () => new Date(2026, 9, 21, 21, 30);
const empty: RecapSources = { focusSessions: null, habitEntries: [], bookmarks: [], notes: [], items: [] };

describe("recapWeeks", () => {
  it("runs Monday to today, against the whole week before", () => {
    expect(recapWeeks(NOW())).toEqual({
      thisWeek: { start: "2026-10-19", end: "2026-10-21" },
      lastWeek: { start: "2026-10-12", end: "2026-10-18" },
    });
  });

  it("treats Sunday as the end of its week, not the start of the next", () => {
    expect(recapWeeks(new Date(2026, 9, 25, 12)).thisWeek).toEqual({ start: "2026-10-19", end: "2026-10-25" });
  });

  it("starts a fresh week on Monday", () => {
    expect(recapWeeks(new Date(2026, 9, 26, 8)).thisWeek).toEqual({ start: "2026-10-26", end: "2026-10-26" });
  });
});

describe("computeWeeklyRecap", () => {
  it("is empty when nothing happened in either week", () => {
    expect(computeWeeklyRecap(empty, NOW())).toEqual([]);
  });

  it("counts each pillar into its week", () => {
    const rows = computeWeeklyRecap(
      {
        focusSessions: [
          { day: "2026-10-19", focusMin: 25 },
          { day: "2026-10-21", focusMin: 50 },
          { day: "2026-10-14", focusMin: 30 },
          { day: "2026-10-05", focusMin: 99 }, // two weeks ago
        ],
        habitEntries: [
          { day: "2026-10-20", status: "done" },
          { day: "2026-10-20", status: "skipped" }, // a skip isn't a check-in
          { day: "2026-10-13", status: "done" },
        ],
        bookmarks: [{ createdAt: "2026-10-20T10:00:00.000Z" }, { createdAt: null }],
        notes: [
          { createdAt: "2026-10-19T17:00:00.000Z", updatedAt: "2026-10-21T17:00:00.000Z" },
          { createdAt: "2026-09-01T17:00:00.000Z", updatedAt: "2026-10-20T17:00:00.000Z" },
        ],
        items: [{ createdAt: "2026-10-15T17:00:00.000Z" }],
      },
      NOW()
    );
    const by = Object.fromEntries(rows.map((r) => [r.key, [r.thisWeek, r.lastWeek]]));
    expect(by).toEqual({
      focus: [75, 30],
      habits: [1, 1],
      bookmarks: [1, 0],
      "notes-written": [1, 0],
      "notes-edited": [1, 0],
      items: [0, 1],
    });
    expect(rows.find((r) => r.key === "focus")?.detail).toBe("2 sessions this week");
  });

  // 2026-10-22T04:30Z is Wednesday evening in Los Angeles, so it belongs to
  // today — slicing the ISO string would have filed it under Thursday, outside
  // the week, and dropped it.
  it("files an instant under its local day", () => {
    const rows = computeWeeklyRecap({ ...empty, bookmarks: [{ createdAt: "2026-10-22T04:30:00.000Z" }] }, NOW());
    expect(rows).toEqual([expect.objectContaining({ key: "bookmarks", thisWeek: 1 })]);
  });

  it("leaves focus out until the cloud's sessions are available", () => {
    const rows = computeWeeklyRecap({ ...empty, habitEntries: [{ day: "2026-10-21", status: "done" }] }, NOW());
    expect(rows.map((r) => r.key)).toEqual(["habits"]);
  });

  it("does not count a note written this week as an older note edited", () => {
    const rows = computeWeeklyRecap(
      { ...empty, notes: [{ createdAt: "2026-10-19T17:00:00.000Z", updatedAt: "2026-10-21T17:00:00.000Z" }] },
      NOW()
    );
    expect(rows.map((r) => r.key)).toEqual(["notes-written"]);
  });
});

describe("formatMinutes", () => {
  it("reads as hours and minutes", () => {
    expect(formatMinutes(0)).toBe("0m");
    expect(formatMinutes(45)).toBe("45m");
    expect(formatMinutes(185)).toBe("3h 05m");
  });
});
