import { describe, expect, it } from "vitest";

import {
  RETENTION_RULES,
  addYears,
  destroyOnFor,
  folderDestroyOn,
  groupShredByBucket,
  resolveRule,
  ruleById,
  shredItems,
  yearEnd,
} from "@/features/filing/lib/retention";
import type { FilingDocument, FilingFolder } from "@/features/filing/lib/types";

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
  name: "Folder",
  homePlaceId: null,
  currentPlaceId: null,
  parentId: null,
  aliases: [],
  tags: [],
  createdAt: null,
  updatedAt: null,
  ...over,
});

describe("date helpers", () => {
  it("adds years", () => {
    expect(addYears("2024-03-09", 7)).toBe("2031-03-09");
  });

  it("clamps a leap day rather than skidding into March", () => {
    expect(addYears("2024-02-29", 1)).toBe("2025-02-28");
  });

  it("takes the calendar year end", () => {
    expect(yearEnd("2024-03-09")).toBe("2024-12-31");
    expect(yearEnd("2024-12-31")).toBe("2024-12-31");
  });
});

describe("presets", () => {
  it("have unique ids", () => {
    const ids = RETENTION_RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("give every non-permanent rule a keep period", () => {
    for (const r of RETENTION_RULES) {
      if (r.action === "permanent") expect(r.keepYears).toBeUndefined();
      else expect(typeof r.keepYears).toBe("number");
    }
  });

  it("give every event-triggered rule a described event", () => {
    for (const r of RETENTION_RULES) {
      if (r.trigger === "event") expect(r.triggerEvent).toBeTruthy();
    }
  });

  it("looks a rule up, and tolerates a missing one", () => {
    expect(ruleById("tax-7")?.keepYears).toBe(7);
    expect(ruleById("nope")).toBeNull();
    expect(ruleById(null)).toBeNull();
  });
});

describe("destroyOnFor", () => {
  // The headline case from the design doc: 2024 invoices filed in March 2025
  // become shreddable at the end of 2031, not in March 2032.
  it("runs from the calendar-year-end cutoff, not the filing date", () => {
    const f = folder({ retentionRuleId: "tax-7", coversThrough: "2024-12-31" });
    const d = doc({ filedAt: "2025-03-14" });
    expect(destroyOnFor(d, f)).toBe("2031-12-31");
  });

  it("beats the naive created + N years by most of a year", () => {
    const f = folder({ retentionRuleId: "tax-7", coversThrough: "2024-12-31" });
    const naive = addYears("2025-03-14", 7); // what most apps compute
    expect(destroyOnFor(doc({ filedAt: "2025-03-14" }), f)).not.toBe(naive);
    expect(destroyOnFor(doc({ filedAt: "2025-03-14" }), f)! < naive).toBe(true);
  });

  it("falls back to the paper's own date when the folder has no range", () => {
    const f = folder({ retentionRuleId: "tax-3" });
    expect(destroyOnFor(doc({ docDate: "2022-06-01" }), f)).toBe("2025-12-31");
  });

  it("prefers docDate over filedAt", () => {
    const f = folder({ retentionRuleId: "tax-3" });
    const d = doc({ docDate: "2020-01-02", filedAt: "2023-09-09" });
    expect(destroyOnFor(d, f)).toBe("2023-12-31");
  });

  it("returns null for a permanent rule", () => {
    const f = folder({ retentionRuleId: "deed-permanent", coversThrough: "2001-01-01" });
    expect(destroyOnFor(doc(), f)).toBeNull();
  });

  it("returns null while an event rule is still waiting for its event", () => {
    const f = folder({ retentionRuleId: "property-sold-3", coversThrough: "2010-12-31" });
    expect(destroyOnFor(doc(), f)).toBeNull();
  });

  it("computes from the event date once it is posted", () => {
    const f = folder({ retentionRuleId: "property-sold-3", eventDate: "2026-04-01" });
    expect(destroyOnFor(doc(), f)).toBe("2029-04-01");
  });

  it("lets the document's own rule override the folder's", () => {
    const f = folder({ retentionRuleId: "tax-3", coversThrough: "2020-12-31" });
    const d = doc({ retentionRuleId: "tax-7" });
    expect(resolveRule(d, f)?.id).toBe("tax-7");
    expect(destroyOnFor(d, f)).toBe("2027-12-31");
  });

  it("lets a manual override beat everything, permanence included", () => {
    const f = folder({ retentionRuleId: "deed-permanent" });
    expect(destroyOnFor(doc({ overrideDestroyOn: "2030-01-01" }), f)).toBe("2030-01-01");
  });

  it("returns null when there is no rule at all", () => {
    expect(destroyOnFor(doc({ docDate: "2020-01-01" }), folder())).toBeNull();
  });

  it("returns null when a fixed rule has no date to run from", () => {
    expect(destroyOnFor(doc(), folder({ retentionRuleId: "tax-3" }))).toBeNull();
  });
});

describe("folderDestroyOn", () => {
  const f = folder({ retentionRuleId: "tax-3", coversThrough: "2020-12-31" });

  it("takes the longest of its contents, not the shortest", () => {
    const docs = [
      doc({ id: "a", retentionRuleId: "tax-3" }),
      doc({ id: "b", retentionRuleId: "tax-7" }),
    ];
    expect(folderDestroyOn(f, docs)).toBe("2027-12-31");
  });

  it("is permanent if any single paper in it is", () => {
    const docs = [
      doc({ id: "a", retentionRuleId: "tax-3" }),
      doc({ id: "b", retentionRuleId: "deed-permanent" }),
    ];
    expect(folderDestroyOn(f, docs)).toBeNull();
  });

  it("ignores archived papers and papers filed elsewhere", () => {
    const docs = [
      doc({ id: "a", retentionRuleId: "tax-3" }),
      doc({ id: "b", retentionRuleId: "deed-permanent", archived: true }),
      doc({ id: "c", folderId: "other", retentionRuleId: "deed-permanent" }),
    ];
    expect(folderDestroyOn(f, docs)).toBe("2023-12-31");
  });

  it("is null for an empty folder", () => {
    expect(folderDestroyOn(f, [])).toBeNull();
  });
});

describe("shredItems", () => {
  const f = folder({ retentionRuleId: "tax-3", coversThrough: "2018-12-31" });
  // 2018 + 3 → 2021-12-31, long past.
  const expired = doc({ id: "old", title: "2018 return" });

  it("surfaces a paper whose retention has run out", () => {
    const items = shredItems([expired], [f], "2026-08-27", 30);
    expect(items).toHaveLength(1);
    expect(items[0].destroyOn).toBe("2021-12-31");
    expect(items[0].bucket).toBe("overdue");
    expect(items[0].daysAway).toBeLessThan(0);
    expect(items[0].rule.id).toBe("tax-3");
  });

  it("does not surface one that is still years away", () => {
    const future = folder({ retentionRuleId: "tax-7", coversThrough: "2025-12-31" });
    expect(shredItems([doc()], [future], "2026-08-27", 30)).toHaveLength(0);
  });

  it("surfaces one inside the lead window", () => {
    const soon = folder({ id: "f1", retentionRuleId: "tax-3", coversThrough: "2023-09-01" });
    // 2023-12-31 + 3 → 2026-12-31; 20 days before that is 2026-12-11.
    expect(shredItems([doc()], [soon], "2026-12-11", 30)).toHaveLength(1);
    expect(shredItems([doc()], [soon], "2026-11-01", 30)).toHaveLength(0);
  });

  it("mutes a folder on hold without touching the clock", () => {
    const held = folder({
      retentionRuleId: "tax-3",
      coversThrough: "2018-12-31",
      keepReason: "Audit open",
    });
    expect(shredItems([expired], [held], "2026-08-27", 30)).toHaveLength(0);
    // Lifting the hold puts it straight back — the date never moved.
    expect(destroyOnFor(expired, held)).toBe("2021-12-31");
  });

  it("skips archived papers, permanent rules and papers with no rule", () => {
    const permanent = folder({ id: "f2", retentionRuleId: "deed-permanent" });
    const none = folder({ id: "f3" });
    const docs = [
      doc({ id: "a", archived: true }),
      doc({ id: "b", folderId: "f2" }),
      doc({ id: "c", folderId: "f3", docDate: "2001-01-01" }),
    ];
    expect(shredItems(docs, [f, permanent, none], "2026-08-27", 30)).toHaveLength(0);
  });

  it("handles an unfiled paper with its own rule and no folder", () => {
    const loose = doc({ id: "u", folderId: null, retentionRuleId: "tax-3", docDate: "2019-05-05" });
    const items = shredItems([loose], [], "2026-08-27", 30);
    expect(items).toHaveLength(1);
    expect(items[0].folder).toBeNull();
    expect(items[0].destroyOn).toBe("2022-12-31");
  });

  it("sorts soonest first and groups without empty buckets", () => {
    const a = folder({ id: "fa", retentionRuleId: "tax-3", coversThrough: "2018-12-31" });
    const b = folder({ id: "fb", retentionRuleId: "tax-3", coversThrough: "2020-12-31" });
    const items = shredItems(
      [doc({ id: "2", folderId: "fb", title: "newer" }), doc({ id: "1", folderId: "fa", title: "older" })],
      [a, b],
      "2026-08-27",
      30
    );
    expect(items.map((i) => i.document.title)).toEqual(["older", "newer"]);
    const groups = groupShredByBucket(items);
    expect(groups).toHaveLength(1);
    expect(groups[0][0]).toBe("overdue");
    expect(groups[0][1]).toHaveLength(2);
  });
});
