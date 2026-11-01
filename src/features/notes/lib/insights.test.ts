import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { computeInsights, historyOf, weekStart, WEEKS } from "./insights";
import type { Note } from "./notes";

// Week buckets are LOCAL weeks: pin a zone far from UTC so a UTC-based slip shows.
const savedTZ = process.env.TZ;
beforeAll(() => {
  process.env.TZ = "Pacific/Kiritimati"; // UTC+14
});
afterAll(() => {
  if (savedTZ === undefined) delete process.env.TZ;
  else process.env.TZ = savedTZ;
});

const note = (id: string, over: Partial<Note> = {}): Note => ({
  id,
  title: id,
  body: "",
  pinned: false,
  tags: [],
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
  ...over,
});

// Wednesday 21 Oct 2026, mid-morning in Kiritimati.
const NOW = new Date("2026-10-20T20:00:00.000Z");

describe("computeInsights", () => {
  it("counts totals, and words only in notes it can read", () => {
    const s = computeInsights(
      [
        note("a", { body: "**one** two three", pinned: true, tags: ["work"] }),
        note("b", { body: "", lock: { kid: "v", iv: "i", ct: "c" }, tags: ["work", "home"] }),
        note("c", { body: "- four" }),
      ],
      [],
      NOW
    );
    expect(s).toMatchObject({ total: 3, pinned: 1, locked: 1, untagged: 1, words: 4, averageWords: 2 });
    expect(s.tags).toEqual([
      { tag: "work", count: 2 },
      { tag: "home", count: 1 },
    ]);
  });

  it("buckets by LOCAL week, Monday first, ending with this week", () => {
    expect(weekStart(NOW).getDay()).toBe(1);
    const s = computeInsights(
      [
        // 01:00 local on Monday 19 Oct is still Sunday the 18th in UTC.
        note("a", { createdAt: "2026-10-18T11:00:00.000Z", activity: [{ at: "2026-10-18T11:00:00.000Z", kind: "edited", n: 4 }] }),
      ],
      [],
      NOW
    );
    expect(s.weeks).toHaveLength(WEEKS);
    expect(s.weeks.at(-1)).toEqual({ start: "2026-10-19", created: 1, edits: 4 });
    expect(s.weeks.at(-2)).toMatchObject({ created: 0, edits: 0 });
  });

  it("ranks the most-edited and the untouched", () => {
    const s = computeInsights(
      [
        note("busy", { updatedAt: "2026-10-19T00:00:00.000Z", activity: [{ at: "2026-10-19T00:00:00.000Z", kind: "edited", n: 9 }] }),
        note("old", { updatedAt: "2025-01-01T00:00:00.000Z" }),
      ],
      [],
      NOW
    );
    expect(s.mostEdited).toEqual([{ id: "busy", title: "busy", value: 9 }]);
    expect(s.stale.map((r) => r.id)).toEqual(["old"]);
  });

  it("puts deletions in the activity feed, marking one that was undone", () => {
    const s = computeInsights(
      [note("back", { activity: [{ at: "2026-10-20T10:00:00.000Z", kind: "restored" }] })],
      [
        { id: "back", title: "back", at: "2026-10-20T09:00:00.000Z" },
        { id: "gone", title: "Old plan", at: "2026-10-20T08:00:00.000Z" },
      ],
      NOW
    );
    expect(s.deletedLast30).toBe(2);
    const deleted = s.feed.filter((f) => f.event.kind === "deleted");
    expect(deleted.map((f) => [f.title, f.restored])).toEqual([
      ["back", true],
      ["Old plan", false],
    ]);
    expect(s.feed[0].event.kind).toBe("restored");
  });

  it("gives a note from before history-keeping its creation, and nothing else", () => {
    expect(historyOf(note("legacy"))).toEqual([{ at: "2026-10-01T00:00:00.000Z", kind: "created" }]);
  });
});

describe("wordCount", () => {
  it("counts words, not list bullets, checkboxes or markdown syntax", async () => {
    const { wordCount } = await import("./insights");
    expect(wordCount("- one\n[ ] two three\n# Four\n---\n`code`")).toBe(5);
  });
});
