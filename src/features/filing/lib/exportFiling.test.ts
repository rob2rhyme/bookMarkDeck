import { describe, expect, it } from "vitest";

import {
  BACKUP_VERSION,
  CSV_COLUMNS,
  buildBackup,
  csvCell,
  documentsToCsv,
  mergeById,
  parseBackup,
} from "@/features/filing/lib/exportFiling";
import type {
  FilingDocument,
  FilingFolder,
  FilingParty,
} from "@/features/filing/lib/types";

const doc = (over: Partial<FilingDocument> = {}): FilingDocument => ({
  id: "d1",
  title: "Auto policy",
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

const party = (over: Partial<FilingParty> = {}): FilingParty => ({
  id: "pa1",
  name: "Mom",
  kind: "family",
  createdAt: null,
  updatedAt: null,
  ...over,
});

const trail = () => ["Garage", "Cabinet", "Insurance"];

describe("csvCell", () => {
  it("leaves a plain value alone", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell(7)).toBe("7");
  });

  it("quotes commas, quotes and newlines", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("one\ntwo")).toBe('"one\ntwo"');
  });

  it("renders null and undefined as empty", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });
});

describe("documentsToCsv", () => {
  it("writes a header and one row per paper", () => {
    const csv = documentsToCsv([doc()], [folder()], [], trail);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe(CSV_COLUMNS.join(","));
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("Auto policy");
  });

  it("leaves a confidential (locked) paper out of the spreadsheet entirely — see confidential.test.ts", () => {
    const locked = doc({ lock: { kid: "v", iv: "i", ct: "c" }, confidential: true });
    const csv = documentsToCsv([locked, doc({ id: "d2", title: "Plain paper" })], [folder()], [], trail);
    const lines = csv.split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("Plain paper");
    expect(csv).not.toContain("Auto policy");
  });

  it("resolves the location to a breadcrumb, not ids", () => {
    const csv = documentsToCsv([doc()], [folder()], [], trail);
    expect(csv).toContain("Garage › Cabinet");
    expect(csv).not.toContain("f1");
  });

  it("says Unfiled for a paper with no folder", () => {
    expect(documentsToCsv([doc({ folderId: null })], [], [], () => [])).toContain("Unfiled");
  });

  it("inherits the folder's party when the paper has none", () => {
    const csv = documentsToCsv([doc()], [folder({ partyId: "pa1" })], [party()], trail);
    expect(csv).toContain("Mom");
  });

  it("resolves the retention rule and its computed date", () => {
    const f = folder({ retentionRuleId: "tax-3", coversThrough: "2018-12-31" });
    const csv = documentsToCsv([doc()], [f], [], trail);
    expect(csv).toContain("Tax records — 3 years");
    expect(csv).toContain("2021-12-31");
  });

  it("includes the linked account url", () => {
    const csv = documentsToCsv(
      [doc({ bookmarkLink: { id: "b1", title: "GEICO", url: "https://geico.com" } })],
      [folder()],
      [],
      trail
    );
    expect(csv).toContain("https://geico.com");
  });

  it("skips archived papers", () => {
    expect(documentsToCsv([doc({ archived: true })], [folder()], [], trail).split("\r\n")).toHaveLength(1);
  });

  it("quotes a title containing a comma rather than breaking the row", () => {
    const csv = documentsToCsv([doc({ title: "Policy, 2026" })], [folder()], [], trail);
    expect(csv).toContain('"Policy, 2026"');
    expect(csv.split("\r\n")).toHaveLength(2);
  });
});

describe("buildBackup", () => {
  it("stamps a version and a time", () => {
    const b = buildBackup(
      { places: [], parties: [], folders: [], documents: [], settings: {} as never },
      "2026-08-28T00:00:00.000Z"
    );
    expect(b.version).toBe(BACKUP_VERSION);
    expect(b.exportedAt).toBe("2026-08-28T00:00:00.000Z");
  });
});

describe("parseBackup", () => {
  const good = JSON.stringify({
    version: 1,
    places: [{ id: "p1", name: "Garage" }],
    parties: [{ id: "pa1", name: "Mom" }],
    folders: [{ id: "f1", name: "Insurance" }],
    documents: [{ id: "d1", title: "Auto policy" }],
    settings: { leadDays: 45 },
  });

  it("round-trips a well-formed backup", () => {
    const r = parseBackup(good);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.summary).toMatchObject({ places: 1, parties: 1, folders: 1, documents: 1, settings: true, skipped: 0 });
    expect(r.data.settings.leadDays).toBe(45);
  });

  it("rejects non-JSON with a readable message", () => {
    const r = parseBackup("not json {");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/valid JSON/);
  });

  it("rejects a JSON file that isn't a filing backup", () => {
    for (const raw of ['{"foo":1}', "[]", "null", '"a string"']) {
      const r = parseBackup(raw);
      expect(r.ok).toBe(false);
    }
  });

  it("accepts a partial backup with only some collections", () => {
    const r = parseBackup(JSON.stringify({ documents: [{ id: "d1", title: "X" }] }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.summary.documents).toBe(1);
    expect(r.summary.places).toBe(0);
  });

  it("drops malformed records and counts them, rather than failing the file", () => {
    // One bad row must not cost you the other four hundred.
    const r = parseBackup(
      JSON.stringify({
        documents: [
          { id: "d1", title: "Good" },
          { id: "d2" }, // no title
          { title: "no id" },
          null,
        ],
      })
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.summary.documents).toBe(1);
    expect(r.summary.skipped).toBe(3);
  });

  it("falls back to default settings when the file has none", () => {
    const r = parseBackup(JSON.stringify({ documents: [] }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.summary.settings).toBe(false);
    expect(r.data.settings.leadDays).toBe(30);
  });
});

describe("mergeById", () => {
  it("adds new records", () => {
    expect(mergeById([{ id: "a" }], [{ id: "b" }]).map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("updates an existing record in place, without reshuffling", () => {
    const out = mergeById(
      [{ id: "a", name: "old" }, { id: "b", name: "keep" }],
      [{ id: "a", name: "new" }]
    );
    expect(out.map((x) => x.id)).toEqual(["a", "b"]);
    expect(out[0].name).toBe("new");
  });

  it("KEEPS records the import doesn't mention", () => {
    // Importing a six-month-old backup must not wipe six months of filing.
    const out = mergeById([{ id: "a" }, { id: "b" }], [{ id: "a" }]);
    expect(out.map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("merges fields rather than replacing the record wholesale", () => {
    const out = mergeById(
      [{ id: "a", note: "kept", name: "old" }],
      [{ id: "a", name: "new" }]
    );
    expect(out[0]).toEqual({ id: "a", note: "kept", name: "new" });
  });

  it("is idempotent", () => {
    const once = mergeById([{ id: "a" }], [{ id: "b" }]);
    expect(mergeById(once, [{ id: "b" }])).toEqual(once);
  });

  it("handles empty sides", () => {
    expect(mergeById([], [{ id: "a" }]).map((x) => x.id)).toEqual(["a"]);
    expect(mergeById([{ id: "a" }], []).map((x) => x.id)).toEqual(["a"]);
  });
});
