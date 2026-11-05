import { describe, expect, it } from "vitest";

import { CONFIDENTIAL_NAME, countConfidential, isConfidential, shownDocuments } from "@/features/filing/lib/confidential";
import { buildDigest } from "@/features/filing/lib/digest";
import { documentsToCsv } from "@/features/filing/lib/exportFiling";
import { buildIcs, filingEvents } from "@/features/filing/lib/ics";
import type { DueItem } from "@/features/filing/lib/obligations";
import type { FilingDocument, FilingFolder } from "@/features/filing/lib/types";

const LOCK = { kid: "v", iv: "i", ct: "c" };
const doc = (over: Partial<FilingDocument> = {}): FilingDocument => ({
  id: "d1",
  title: "Passport",
  folderId: "f1",
  aliases: [],
  tags: [],
  obligations: [],
  createdAt: null,
  updatedAt: null,
  ...over,
});
const secret = (over: Partial<FilingDocument> = {}) => doc({ id: "s1", title: "Divorce decree", lock: LOCK, confidential: true, ...over });
const folder: FilingFolder = {
  id: "f1",
  name: "Legal",
  homePlaceId: null,
  currentPlaceId: null,
  parentId: null,
  aliases: [],
  tags: [],
  createdAt: null,
  updatedAt: null,
};

describe("isConfidential / shownDocuments", () => {
  it("a paper is confidential while it is locked — by the flag (a slim record) or by the lock itself", () => {
    expect(isConfidential(doc())).toBe(false);
    expect(isConfidential(doc({ confidential: true }))).toBe(true);
    expect(isConfidential(doc({ lock: LOCK }))).toBe(true);
    expect(isConfidential(doc({ confidential: false }))).toBe(false);
  });

  it("holds confidential papers back only while the PIN lock is on", () => {
    const all = [doc(), secret()];
    expect(shownDocuments(all, true).map((d) => d.id)).toEqual(["d1"]);
    expect(shownDocuments(all, false)).toBe(all);
  });

  it("counts them", () => {
    expect(countConfidential([doc(), secret(), secret({ id: "s2" })])).toBe(2);
  });
});

const due = (document: FilingDocument, over: Partial<DueItem> = {}): DueItem => ({
  document,
  obligation: { id: "o1", kind: "renew", dueOn: "2026-11-01" },
  bucket: "overdue",
  daysAway: -3,
  ...over,
});

describe("a notification never names a confidential paper", () => {
  it("names the ordinary one, counts the confidential one", () => {
    const d = buildDigest([due(doc()), due(secret())], [], []);
    expect(d.body).toContain("Passport");
    expect(d.body).not.toContain("Divorce");
    expect(d.body).toContain("1 more");
    expect(d.title).toBe("2 papers overdue");
    expect(d.count).toBe(2);
  });

  it("with only confidential papers due, says how many reminders and nothing else", () => {
    const d = buildDigest([due(secret()), due(secret({ id: "s2", title: "Medical file" }))], [], []);
    expect(JSON.stringify(d)).not.toMatch(/Divorce|Medical/);
    expect(d.title).toBe("2 papers overdue");
    expect(d.body).toBe("2 reminders coming up");
    expect(d.count).toBe(2);
  });

  it("does not name one through the obligation's own label either", () => {
    const item = due(secret(), { obligation: { id: "o1", kind: "renew", dueOn: "2026-11-01", label: "Decree appeal deadline" } });
    expect(JSON.stringify(buildDigest([item], [], []))).not.toContain("appeal");
  });

  it("an ordinary digest reads exactly as before", () => {
    expect(buildDigest([due(doc())], [], []).body).toBe("Passport");
  });
});

describe("a spreadsheet leaves out confidential papers entirely", () => {
  it("has no row — no name, folder or date — for one", () => {
    const csv = documentsToCsv([doc(), secret({ docDate: "2020-02-02", reference: undefined })], [folder], [], () => ["Legal"]);
    expect(csv.split("\r\n")).toHaveLength(2);
    expect(csv).toContain("Passport");
    expect(csv).not.toContain("Divorce");
    expect(csv).not.toContain("2020-02-02");
  });
});

describe("a calendar file keeps a confidential paper's date and drops its name", () => {
  const withDue = (d: FilingDocument) => ({
    ...d,
    obligations: [{ id: "o1", kind: "renew" as const, dueOn: "2027-03-01", label: "Decree appeal" }],
  });

  it("titles it generically, by kind, and says nothing of where it is kept", () => {
    const events = filingEvents([withDue(secret())], [folder], { trailFor: () => ["Legal", "Drawer 2"] });
    expect(events).toHaveLength(1);
    expect(events[0].date).toBe("2027-03-01");
    expect(events[0].summary).toBe(`${CONFIDENTIAL_NAME} — Renew`);
    const text = buildIcs(events);
    expect(text).not.toMatch(/Divorce|appeal|Legal|Drawer/);
  });

  it("an ordinary paper is titled as before", () => {
    const events = filingEvents([withDue(doc())], [folder], { trailFor: () => ["Legal"] });
    expect(events[0].summary).toBe("Decree appeal");
    expect(events[0].description).toBe("Passport — Legal");
  });

  it("a retention date for one is generic too", () => {
    const events = filingEvents([secret({ retentionRuleId: "tax-3", docDate: "2018-06-01" })], [{ ...folder, coversThrough: "2018-12-31" }], {
      includeRetention: true,
    });
    for (const e of events) expect(JSON.stringify(e)).not.toContain("Divorce");
  });
});
