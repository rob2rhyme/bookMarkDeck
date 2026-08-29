import { describe, expect, it } from "vitest";

import {
  activityByMonth,
  allActivity,
  monthLabel,
  monthsEnding,
  papersByFolder,
  summarize,
  totalsByType,
} from "@/features/filing/lib/stats";
import type {
  FilingActivity,
  FilingActivityType,
  FilingDocument,
  FilingFolder,
} from "@/features/filing/lib/types";

const act = (type: FilingActivityType, at: string): FilingActivity => ({ id: `${type}-${at}`, type, at });

const doc = (over: Partial<FilingDocument> = {}): FilingDocument => ({
  id: "d1",
  title: "Paper",
  folderId: "f1",
  aliases: [],
  tags: [],
  obligations: [],
  createdAt: null,
  updatedAt: null,
  ...over,
});

const folder = (over: Partial<FilingFolder> = {}): FilingFolder => ({
  id: "f1",
  name: "Insurance",
  homePlaceId: null,
  currentPlaceId: null,
  parentId: null,
  aliases: [],
  tags: [],
  createdAt: null,
  updatedAt: null,
  ...over,
});

const TODAY = "2026-08-29";

describe("allActivity", () => {
  it("flattens document and folder timelines together", () => {
    const out = allActivity(
      [doc({ activity: [act("filed", "2026-08-01T10:00:00.000Z")] })],
      [folder({ activity: [act("taken", "2026-08-02T10:00:00.000Z")] })]
    );
    expect(out).toEqual([
      { type: "filed", day: "2026-08-01" },
      { type: "taken", day: "2026-08-02" },
    ]);
  });

  it("survives missing, short and malformed timestamps rather than throwing", () => {
    const out = allActivity(
      [
        doc({ activity: undefined }),
        doc({ activity: [{ id: "x", type: "filed", at: "" } as FilingActivity] }),
        doc({ activity: [{ id: "y", type: "filed", at: "not-a-date" } as FilingActivity] }),
        doc({ activity: [{ id: "z", type: "filed" } as unknown as FilingActivity] }),
      ],
      []
    );
    expect(out).toEqual([]);
  });

  it("includes archived records — history is history", () => {
    const out = allActivity([doc({ archived: true, activity: [act("shredded", "2026-08-01T00:00:00Z")] })], []);
    expect(out).toHaveLength(1);
  });
});

describe("monthsEnding", () => {
  it("returns N months ending with today's, oldest first", () => {
    expect(monthsEnding("2026-08-29", 3)).toEqual(["2026-06", "2026-07", "2026-08"]);
  });

  it("crosses a year boundary", () => {
    expect(monthsEnding("2026-02-15", 4)).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });

  it("handles a single month", () => {
    expect(monthsEnding("2026-08-29", 1)).toEqual(["2026-08"]);
  });
});

describe("monthLabel", () => {
  it("names the month", () => {
    expect(monthLabel("2026-01")).toBe("Jan");
    expect(monthLabel("2026-12")).toBe("Dec");
  });
});

describe("activityByMonth", () => {
  const activity = [
    { type: "filed" as const, day: "2026-08-01" },
    { type: "filed" as const, day: "2026-08-15" },
    { type: "paid" as const, day: "2026-08-20" },
    { type: "filed" as const, day: "2026-06-05" },
  ];

  it("keeps EMPTY months rather than dropping them", () => {
    // A chart that omits quiet months rescales its own axis and makes a quiet
    // month look like no month at all.
    const buckets = activityByMonth(activity, TODAY, 3);
    expect(buckets.map((b) => b.month)).toEqual(["2026-06", "2026-07", "2026-08"]);
    expect(buckets[1].total).toBe(0);
    expect(buckets[1].byType).toEqual({});
  });

  it("counts totals and per-type within a month", () => {
    const [, , aug] = activityByMonth(activity, TODAY, 3);
    expect(aug.total).toBe(3);
    expect(aug.byType).toEqual({ filed: 2, paid: 1 });
  });

  it("ignores activity outside the window", () => {
    const buckets = activityByMonth([{ type: "filed", day: "2020-01-01" }], TODAY, 3);
    expect(buckets.reduce((n, b) => n + b.total, 0)).toBe(0);
  });

  it("labels each bucket", () => {
    expect(activityByMonth([], TODAY, 2).map((b) => b.label)).toEqual(["Jul", "Aug"]);
  });
});

describe("totalsByType", () => {
  it("counts and sorts biggest first", () => {
    const out = totalsByType([
      { type: "filed", day: "2026-08-01" },
      { type: "filed", day: "2026-08-02" },
      { type: "paid", day: "2026-08-03" },
    ]);
    expect(out).toEqual([
      { type: "filed", count: 2 },
      { type: "paid", count: 1 },
    ]);
  });

  it("is empty for no activity", () => {
    expect(totalsByType([])).toEqual([]);
  });
});

describe("summarize", () => {
  it("counts the pillar's headline figures", () => {
    const docs = [
      doc({
        id: "a",
        activity: [act("filed", "2026-08-02T00:00:00Z"), act("paid", "2026-05-01T00:00:00Z")],
        obligations: [{ id: "o", kind: "pay", dueOn: "2026-12-01" }],
        bookmarkLink: { id: "b", title: "GEICO", url: "https://geico.com" },
      }),
      doc({ id: "b", activity: [act("filed", "2026-01-02T00:00:00Z")] }),
      doc({ id: "c", archived: true, activity: [act("shredded", "2026-07-01T00:00:00Z")] }),
    ];
    const s = summarize(docs, [folder()], 4, TODAY);
    expect(s.papers).toBe(2); // archived excluded
    expect(s.folders).toBe(1);
    expect(s.places).toBe(4);
    expect(s.filedThisMonth).toBe(1);
    expect(s.handledThisYear).toBe(1);
    expect(s.cleared).toBe(1);
    expect(s.withReminders).toBe(1);
    expect(s.linked).toBe(1);
  });

  it("counts papers whose retention date has arrived", () => {
    const f = folder({ retentionRuleId: "tax-3", coversThrough: "2018-12-31" });
    expect(summarize([doc()], [f], 0, TODAY).readyToClear).toBe(1);
  });

  it("excludes a folder on hold from readyToClear", () => {
    const held = folder({ retentionRuleId: "tax-3", coversThrough: "2018-12-31", keepReason: "Audit" });
    expect(summarize([doc()], [held], 0, TODAY).readyToClear).toBe(0);
  });

  it("ignores an archived obligation when counting reminders", () => {
    const d = doc({ obligations: [{ id: "o", kind: "pay", dueOn: "2026-12-01", archived: true }] });
    expect(summarize([d], [folder()], 0, TODAY).withReminders).toBe(0);
  });

  it("returns zeros for an empty log rather than NaN", () => {
    const s = summarize([], [], 0, TODAY);
    expect(Object.values(s).every((v) => v === 0)).toBe(true);
  });
});

describe("papersByFolder", () => {
  const folders = [
    folder({ id: "f1", name: "Insurance" }),
    folder({ id: "f2", name: "Taxes" }),
  ];

  it("counts per folder, biggest first", () => {
    const docs = [
      doc({ id: "1", folderId: "f2" }),
      doc({ id: "2", folderId: "f2" }),
      doc({ id: "3", folderId: "f1" }),
    ];
    expect(papersByFolder(docs, folders)).toEqual([
      { key: "f2", label: "Taxes", count: 2 },
      { key: "f1", label: "Insurance", count: 1 },
    ]);
  });

  it("gives unfiled papers their own bucket", () => {
    const out = papersByFolder([doc({ id: "1", folderId: null })], folders);
    expect(out[0].label).toBe("Unfiled");
  });

  it("names a folder that no longer exists rather than showing a raw id", () => {
    const out = papersByFolder([doc({ id: "1", folderId: "gone" })], folders);
    expect(out[0].label).toBe("Deleted folder");
  });

  it("skips archived papers", () => {
    expect(papersByFolder([doc({ archived: true })], folders)).toEqual([]);
  });

  it("rolls the tail into one bucket past the limit", () => {
    const many = Array.from({ length: 9 }, (_, i) =>
      folder({ id: `x${i}`, name: `F${i}` })
    );
    const docs = many.map((f, i) => doc({ id: `d${i}`, folderId: f.id }));
    const out = papersByFolder(docs, many, 6);
    expect(out).toHaveLength(7);
    expect(out[6].label).toBe("3 more");
    expect(out[6].count).toBe(3);
  });

  it("does not add an 'other' bucket when everything fits", () => {
    const out = papersByFolder([doc({ id: "1" })], folders, 6);
    expect(out.some((s) => s.key === "__other__")).toBe(false);
  });
});
