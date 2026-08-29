import { describe, expect, it } from "vitest";

import {
  CRITICAL_DAYS,
  SOON_DAYS,
  bucketForExpiry,
  expiringCount,
  expiryItems,
  groupByStatus,
  statusFor,
  travelCutoffFor,
} from "@/features/filing/lib/expiry";
import { OBLIGATION_PRESETS } from "@/features/filing/lib/obligations";
import type { FilingDocument, FilingFolder, Obligation } from "@/features/filing/lib/types";

const ob = (over: Partial<Obligation> = {}): Obligation => ({
  id: "o1",
  kind: "expires",
  dueOn: "2027-01-01",
  ...over,
});

const doc = (over: Partial<FilingDocument> = {}): FilingDocument => ({
  id: "d1",
  title: "Passport",
  folderId: "f1",
  docType: "id",
  aliases: [],
  tags: [],
  obligations: [],
  createdAt: null,
  updatedAt: null,
  ...over,
});

const folder = (over: Partial<FilingFolder> = {}): FilingFolder => ({
  id: "f1",
  name: "IDs",
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

describe("statusFor", () => {
  it("bands by days left", () => {
    expect(statusFor(-1)).toBe("expired");
    expect(statusFor(0)).toBe("critical");
    expect(statusFor(CRITICAL_DAYS)).toBe("critical");
    expect(statusFor(CRITICAL_DAYS + 1)).toBe("soon");
    expect(statusFor(SOON_DAYS)).toBe("soon");
    expect(statusFor(SOON_DAYS + 1)).toBe("ok");
  });

  it("treats the expiry day itself as critical, not expired", () => {
    // A passport is valid THROUGH its expiry date.
    expect(statusFor(0)).toBe("critical");
  });
});

describe("travelCutoffFor", () => {
  it("is six months before the printed date", () => {
    expect(travelCutoffFor("2027-01-01")).toBe("2026-07-01");
    expect(travelCutoffFor("2026-12-15")).toBe("2026-06-15");
  });

  it("crosses a year boundary correctly", () => {
    expect(travelCutoffFor("2027-03-10")).toBe("2026-09-10");
  });

  it("clamps to the shorter month rather than skidding forward", () => {
    // 31 Aug minus 6 months is 28/29 Feb, not 2/3 March.
    expect(travelCutoffFor("2027-08-31")).toBe("2027-02-28");
    expect(travelCutoffFor("2028-08-31")).toBe("2028-02-29");
  });
});

describe("expiryItems", () => {
  it("picks up expires and renew, and ignores pay and file", () => {
    const d = doc({
      obligations: [
        ob({ id: "a", kind: "expires" }),
        ob({ id: "b", kind: "renew" }),
        ob({ id: "c", kind: "pay" }),
        ob({ id: "d", kind: "file" }),
        ob({ id: "e", kind: "inspect" }),
      ],
    });
    expect(expiryItems([d], [folder()], TODAY).map((i) => i.obligation.id)).toEqual(["a", "b"]);
  });

  it("does NOT filter by lead time — a passport good for years still shows", () => {
    // This is the difference from the reminders panel: you want the whole list.
    const items = expiryItems([doc({ obligations: [ob({ dueOn: "2031-01-01" })] })], [folder()], TODAY);
    expect(items).toHaveLength(1);
    expect(items[0].status).toBe("ok");
  });

  it("attaches the folder it lives in", () => {
    const items = expiryItems([doc({ obligations: [ob()] })], [folder()], TODAY);
    expect(items[0].folder?.name).toBe("IDs");
  });

  it("copes with an unfiled document", () => {
    const items = expiryItems([doc({ folderId: null, obligations: [ob()] })], [], TODAY);
    expect(items[0].folder).toBeNull();
  });

  it("skips archived documents and archived obligations", () => {
    expect(expiryItems([doc({ archived: true, obligations: [ob()] })], [folder()], TODAY)).toHaveLength(0);
    expect(expiryItems([doc({ obligations: [ob({ archived: true })] })], [folder()], TODAY)).toHaveLength(0);
  });

  it("skips an obligation with no usable date", () => {
    expect(expiryItems([doc({ obligations: [ob({ dueOn: "" })] })], [folder()], TODAY)).toHaveLength(0);
  });

  it("reports negative days once lapsed", () => {
    const items = expiryItems([doc({ obligations: [ob({ dueOn: "2026-01-01" })] })], [folder()], TODAY);
    expect(items[0].daysLeft).toBeLessThan(0);
    expect(items[0].status).toBe("expired");
  });

  it("sorts soonest first", () => {
    const docs = [
      doc({ id: "b", title: "Later", obligations: [ob({ id: "o2", dueOn: "2028-01-01" })] }),
      doc({ id: "a", title: "Sooner", obligations: [ob({ id: "o1", dueOn: "2026-10-01" })] }),
    ];
    expect(expiryItems(docs, [folder()], TODAY).map((i) => i.document.title)).toEqual([
      "Sooner",
      "Later",
    ]);
  });
});

describe("the passport travel-validity rule", () => {
  const passport = (dueOn: string) =>
    doc({ obligations: [ob({ kind: "renew", dueOn, presetId: "passport" })] });

  it("computes a cutoff only for a passport", () => {
    expect(expiryItems([passport("2027-01-01")], [folder()], TODAY)[0].travelCutoff).toBe("2026-07-01");
    // A driving licence expires, but no six-month rule applies to it.
    const licence = doc({ obligations: [ob({ kind: "renew", presetId: "licence" })] });
    expect(expiryItems([licence], [folder()], TODAY)[0].travelCutoff).toBeNull();
    expect(expiryItems([licence], [folder()], TODAY)[0].travelValid).toBeNull();
  });

  it("flags a passport that is still valid but no longer good for travel", () => {
    // Expires 2026-12-01, so the six-month window closed on 2026-06-01 — the
    // passport is "valid" for three more months and would still be refused.
    const [item] = expiryItems([passport("2026-12-01")], [folder()], TODAY);
    expect(item.status).not.toBe("expired");
    expect(item.daysLeft).toBeGreaterThan(0);
    expect(item.travelValid).toBe(false);
  });

  it("passes a passport with more than six months left", () => {
    const [item] = expiryItems([passport("2027-06-01")], [folder()], TODAY);
    expect(item.travelValid).toBe(true);
  });

  it("treats the cutoff day itself as still valid", () => {
    const [item] = expiryItems([passport("2027-02-28")], [folder()], "2026-08-28");
    expect(item.travelCutoff).toBe("2026-08-28");
    expect(item.travelValid).toBe(true);
  });

  it("has no cutoff when no preset was recorded", () => {
    const legacy = doc({ obligations: [ob({ kind: "renew", label: "Passport" })] });
    expect(expiryItems([legacy], [folder()], TODAY)[0].travelCutoff).toBeNull();
  });
});

describe("grouping and counting", () => {
  const docs = [
    doc({ id: "1", obligations: [ob({ id: "a", dueOn: "2020-01-01" })] }), // expired
    doc({ id: "2", obligations: [ob({ id: "b", dueOn: "2026-09-05" })] }), // critical
    doc({ id: "3", obligations: [ob({ id: "c", dueOn: "2026-12-01" })] }), // soon
    doc({ id: "4", obligations: [ob({ id: "d", dueOn: "2030-01-01" })] }), // ok
  ];
  const items = expiryItems(docs, [folder()], TODAY);

  it("groups in severity order with no empty bands", () => {
    expect(groupByStatus(items).map(([s]) => s)).toEqual(["expired", "critical", "soon", "ok"]);
    expect(groupByStatus([])).toEqual([]);
  });

  it("counts only what needs acting on", () => {
    expect(expiringCount(items)).toBe(2);
  });
});

describe("bucketForExpiry", () => {
  it("maps into the reminders panel's vocabulary", () => {
    expect(bucketForExpiry(-1)).toBe("overdue");
    expect(bucketForExpiry(0)).toBe("week");
    expect(bucketForExpiry(7)).toBe("week");
    expect(bucketForExpiry(8)).toBe("month");
    expect(bucketForExpiry(31)).toBe("month");
    expect(bucketForExpiry(32)).toBe("later");
  });
});

describe("the shipped presets", () => {
  it("gives every identity document a validity kind, not a payment kind", () => {
    const idPresets = ["passport", "licence", "national-id", "residence-permit",
                       "green-card", "visa", "work-permit", "trusted-traveller", "membership"];
    for (const id of idPresets) {
      const p = OBLIGATION_PRESETS.find((x) => x.id === id);
      expect(p, `preset ${id} missing`).toBeDefined();
      expect(["expires", "renew"]).toContain(p!.kind);
    }
  });

  it("gives identity documents a lead time measured in months", () => {
    // Renewing a passport is not a same-week job.
    for (const id of ["passport", "green-card"]) {
      expect(OBLIGATION_PRESETS.find((x) => x.id === id)!.leadDays).toBeGreaterThanOrEqual(180);
    }
  });

  it("keeps preset ids unique", () => {
    const ids = OBLIGATION_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
