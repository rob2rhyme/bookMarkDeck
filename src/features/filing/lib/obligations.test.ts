import { describe, expect, it } from "vitest";

import {
  addDays,
  addMonths,
  bucketOf,
  complete,
  daysBetween,
  dueItems,
  groupByBucket,
  isDue,
  isOpen,
  nextDueOn,
  periodMonths,
  relativeDue,
} from "@/features/filing/lib/obligations";
import type { FilingDocument, Obligation } from "@/features/filing/lib/types";

const ob = (over: Partial<Obligation> = {}): Obligation => ({
  id: "o1", kind: "pay", dueOn: "2026-06-15", ...over,
});

const doc = (over: Partial<FilingDocument> & { id: string; title: string }): FilingDocument => ({
  folderId: null, obligations: [], aliases: [], tags: [],
  createdAt: null, updatedAt: null, ...over,
});

describe("date math", () => {
  it("counts whole days, signed", () => {
    expect(daysBetween("2026-06-15", "2026-06-18")).toBe(3);
    expect(daysBetween("2026-06-15", "2026-06-12")).toBe(-3);
    expect(daysBetween("2026-06-15", "2026-06-15")).toBe(0);
  });

  it("crosses a month and a year boundary", () => {
    expect(daysBetween("2026-01-30", "2026-02-02")).toBe(3);
    expect(daysBetween("2026-12-30", "2027-01-02")).toBe(3);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("handles a leap day", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(daysBetween("2028-02-28", "2028-03-01")).toBe(2);
  });

  // A renewal due on the 31st must not skid into the following month.
  it("clamps addMonths to the target month's length", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29"); // leap year
    expect(addMonths("2026-03-31", 1)).toBe("2026-04-30");
  });

  it("adds months across a year boundary", () => {
    expect(addMonths("2026-11-15", 3)).toBe("2027-02-15");
    expect(addMonths("2026-06-15", 120)).toBe("2036-06-15"); // a passport
  });
});

describe("periodMonths", () => {
  it("maps the named recurrences", () => {
    expect(periodMonths({ repeat: "monthly" })).toBe(1);
    expect(periodMonths({ repeat: "quarterly" })).toBe(3);
    expect(periodMonths({ repeat: "yearly" })).toBe(12);
  });

  it("is null for a one-off", () => {
    expect(periodMonths({ repeat: "none" })).toBeNull();
    expect(periodMonths({})).toBeNull();
  });

  it("uses repeatMonths for custom, rejecting nonsense", () => {
    expect(periodMonths({ repeat: "custom", repeatMonths: 24 })).toBe(24);
    expect(periodMonths({ repeat: "custom" })).toBeNull();
    expect(periodMonths({ repeat: "custom", repeatMonths: 0 })).toBeNull();
    expect(periodMonths({ repeat: "custom", repeatMonths: -3 })).toBeNull();
  });
});

describe("complete", () => {
  // The case the whole design hinges on.
  it("rolls a repeat forward exactly ONE period, not to the next future date", () => {
    const monthly = ob({ dueOn: "2026-03-01", repeat: "monthly" });
    const done = complete(monthly, "2026-06-10"); // three months late
    expect(done.dueOn).toBe("2026-04-01");
    expect(done.completedOn).toBe("2026-06-10");
    // Still overdue against the day it was marked — the two missed months are
    // not silently forgiven.
    expect(bucketOf(done.dueOn, "2026-06-10")).toBe("overdue");
  });

  it("advances from the due date, not from the completion date", () => {
    const yearly = ob({ dueOn: "2026-01-15", repeat: "yearly" });
    expect(complete(yearly, "2026-03-02").dueOn).toBe("2027-01-15");
  });

  it("clamps an end-of-month repeat", () => {
    expect(complete(ob({ dueOn: "2026-01-31", repeat: "monthly" }), "2026-01-31").dueOn)
      .toBe("2026-02-28");
  });

  it("closes a one-off instead of rescheduling it", () => {
    const once = complete(ob({ repeat: "none" }), "2026-06-16");
    expect(once.dueOn).toBe("2026-06-15");
    expect(isOpen(once)).toBe(false);
  });

  it("keeps a completed repeat open — the next occurrence is still coming", () => {
    expect(isOpen(complete(ob({ repeat: "monthly" }), "2026-06-15"))).toBe(true);
  });
});

describe("isOpen", () => {
  it("is false once archived", () => {
    expect(isOpen(ob({ archived: true }))).toBe(false);
  });

  it("is true for an untouched obligation", () => {
    expect(isOpen(ob())).toBe(true);
  });
});

describe("bucketOf", () => {
  const today = "2026-06-15";
  it("sorts into overdue / week / month / later", () => {
    expect(bucketOf("2026-06-14", today)).toBe("overdue");
    expect(bucketOf("2026-06-15", today)).toBe("week"); // due today is not overdue
    expect(bucketOf("2026-06-22", today)).toBe("week"); // exactly 7 days
    expect(bucketOf("2026-06-23", today)).toBe("month");
    expect(bucketOf("2026-07-16", today)).toBe("month"); // exactly 31 days
    expect(bucketOf("2026-07-17", today)).toBe("later");
  });
});

describe("isDue", () => {
  const today = "2026-06-15";

  it("respects the account default lead", () => {
    expect(isDue(ob({ dueOn: "2026-07-14" }), today, 30)).toBe(true); // 29 days
    expect(isDue(ob({ dueOn: "2026-07-16" }), today, 30)).toBe(false); // 31 days
  });

  it("lands exactly on the lead boundary", () => {
    expect(isDue(ob({ dueOn: "2026-07-15" }), today, 30)).toBe(true); // 30 days
  });

  it("lets the obligation override the default", () => {
    const passport = ob({ dueOn: "2026-11-01", leadDays: 180 });
    expect(isDue(passport, today, 30)).toBe(true);
  });

  it("honours a zero lead — due today only", () => {
    expect(isDue(ob({ dueOn: "2026-06-15", leadDays: 0 }), today, 30)).toBe(true);
    expect(isDue(ob({ dueOn: "2026-06-16", leadDays: 0 }), today, 30)).toBe(false);
  });

  it("always surfaces something overdue, however long the lead", () => {
    expect(isDue(ob({ dueOn: "2020-01-01", leadDays: 0 }), today, 0)).toBe(true);
  });

  it("ignores archived and malformed dates", () => {
    expect(isDue(ob({ archived: true }), today, 30)).toBe(false);
    expect(isDue(ob({ dueOn: "soon" }), today, 30)).toBe(false);
  });
});

describe("nextDueOn", () => {
  it("picks the earliest open date", () => {
    expect(nextDueOn([ob({ id: "a", dueOn: "2026-09-01" }), ob({ id: "b", dueOn: "2026-07-01" })]))
      .toBe("2026-07-01");
  });

  it("skips closed and archived ones", () => {
    expect(
      nextDueOn([
        ob({ id: "a", dueOn: "2026-07-01", repeat: "none", completedOn: "2026-06-01" }),
        ob({ id: "b", dueOn: "2026-09-01" }),
      ])
    ).toBe("2026-09-01");
  });

  it("is null with nothing open", () => {
    expect(nextDueOn([])).toBeNull();
    expect(nextDueOn(undefined)).toBeNull();
    expect(nextDueOn([ob({ archived: true })])).toBeNull();
  });
});

describe("dueItems", () => {
  const today = "2026-06-15";
  const documents = [
    doc({ id: "d1", title: "Registration", obligations: [ob({ id: "o1", dueOn: "2026-06-10" })] }),
    doc({ id: "d2", title: "Passport", obligations: [ob({ id: "o2", dueOn: "2026-06-20" })] }),
    doc({ id: "d3", title: "Far off", obligations: [ob({ id: "o3", dueOn: "2027-01-01" })] }),
    doc({ id: "d4", title: "Archived doc", archived: true,
          obligations: [ob({ id: "o4", dueOn: "2026-06-11" })] }),
  ];

  it("returns what's due, soonest first", () => {
    expect(dueItems(documents, today, 30).map((i) => i.document.title))
      .toEqual(["Registration", "Passport"]);
  });

  it("skips obligations on an archived document", () => {
    expect(dueItems(documents, today, 30).some((i) => i.document.id === "d4")).toBe(false);
  });

  it("reports how far away each is", () => {
    const [first] = dueItems(documents, today, 30);
    expect(first.daysAway).toBe(-5);
    expect(first.bucket).toBe("overdue");
  });

  it("widens with the lead", () => {
    expect(dueItems(documents, today, 400).map((i) => i.document.title))
      .toEqual(["Registration", "Passport", "Far off"]);
  });
});

describe("groupByBucket", () => {
  it("orders buckets and drops the empty ones", () => {
    const items = dueItems(
      [
        doc({ id: "a", title: "Late", obligations: [ob({ id: "1", dueOn: "2026-06-01" })] }),
        doc({ id: "b", title: "Soon", obligations: [ob({ id: "2", dueOn: "2026-06-18" })] }),
      ],
      "2026-06-15",
      30
    );
    expect(groupByBucket(items).map(([b]) => b)).toEqual(["overdue", "week"]);
  });
});

describe("relativeDue", () => {
  it("reads like a person wrote it", () => {
    expect(relativeDue(0)).toBe("today");
    expect(relativeDue(1)).toBe("tomorrow");
    expect(relativeDue(-1)).toBe("yesterday");
    expect(relativeDue(5)).toBe("in 5 days");
    expect(relativeDue(-5)).toBe("5 days ago");
  });
});
