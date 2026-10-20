import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Note } from "./notes";
import {
  BackupFormatError,
  backupFilename,
  buildBackup,
  parseBackup,
  planImport,
  toMarkdownExport,
  vaultsToAdd,
} from "./notesBackup";
import type { VaultRecord } from "./vault";

const note = (id: string, over: Partial<Note> = {}): Note => ({
  id,
  title: id,
  body: `body of ${id}`,
  pinned: false,
  tags: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...over,
});
const LOCK = { kid: "v1", iv: "aXY=", ct: "Y2lwaGVydGV4dA==" };
const vault = (id: string): VaultRecord => ({
  id,
  v: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  pass: { salt: "s", iv: "i", ct: "c", iterations: 600000 },
  recovery: { salt: "s", iv: "i", ct: "c", iterations: 600000 },
});

describe("backup round trip", () => {
  it("restores what it saved — locked notes still encrypted, with their vaults", () => {
    const notes = [note("a", { tags: ["x"], pinned: true }), note("b", { body: "", lock: LOCK })];
    const text = JSON.stringify(buildBackup(notes, [vault("v1")]));
    expect(text).not.toContain("body of b");
    expect(parseBackup(text)).toEqual({ notes, vaults: [vault("v1")] });
  });

  it("rejects files that aren't a Notes backup, or are from a newer version", () => {
    expect(() => parseBackup("not json")).toThrow(BackupFormatError);
    expect(() => parseBackup(JSON.stringify({ bookmarks: [] }))).toThrow(/isn't a Notes backup/);
    expect(() => parseBackup(JSON.stringify({ app: "bookmarkdeck-notes", version: 99, notes: [] }))).toThrow(/newer version/);
  });

  it("drops malformed records instead of failing the whole restore", () => {
    const text = JSON.stringify({ app: "bookmarkdeck-notes", version: 1, notes: [note("ok"), { title: "no id" }], vaults: [{}] });
    expect(parseBackup(text)).toEqual({ notes: [note("ok")], vaults: [] });
  });
});

describe("planImport — merges by id, never deletes, newer wins", () => {
  it("adds new notes, updates only where the backup is newer, keeps the rest", () => {
    const here = [note("same"), note("newerHere", { updatedAt: "2026-03-01T00:00:00.000Z" }), note("onlyHere")];
    const backup = [
      note("same"),
      note("newerHere", { body: "stale", updatedAt: "2026-02-01T00:00:00.000Z" }),
      note("newerInBackup", { updatedAt: "2026-01-01T00:00:00.000Z" }),
      note("onlyHere", { body: "fresher", updatedAt: "2026-04-01T00:00:00.000Z" }),
      note("onlyHere"),
    ];
    const plan = planImport(here, backup);
    expect(plan.write.map((n) => n.id)).toEqual(["newerInBackup", "onlyHere"]);
    expect(plan).toMatchObject({ added: 1, updated: 1, kept: 2 });
  });

  it("only adds vaults this account lacks — an existing one is never replaced", () => {
    expect(vaultsToAdd([vault("v1")], [vault("v1"), vault("v2"), vault("v2")]).map((v) => v.id)).toEqual(["v2"]);
  });
});

describe("Markdown export", () => {
  it("is readable, in list order, and never includes a locked note's ciphertext", () => {
    const md = toMarkdownExport([
      note("plain", { title: "Groceries", body: "- milk", tags: ["home"] }),
      note("pinned", { title: "Top", pinned: true }),
      note("locked", { title: "Bank", body: "", lock: LOCK }),
    ]);
    expect(md.indexOf("## Top")).toBeLessThan(md.indexOf("## Groceries"));
    expect(md).toContain("#home");
    expect(md).toContain("- milk");
    expect(md).toContain("## Bank");
    expect(md).toContain("Locked note");
    expect(md).not.toContain(LOCK.ct);
  });

  it("titles an untitled note by its first readable line", () => {
    expect(toMarkdownExport([note("u", { title: "", body: "**Pasted** text\nmore" })])).toContain("## Pasted text");
  });
});

describe("filenames use the LOCAL day", () => {
  const tz = process.env.TZ;
  beforeEach(() => {
    process.env.TZ = "Pacific/Kiritimati"; // UTC+14: the UTC date is a day behind
  });
  afterEach(() => {
    process.env.TZ = tz;
  });
  it("names the file after the day it is where you are", () => {
    // 2026-10-20 20:00 UTC is already 2026-10-21 in Kiritimati.
    expect(backupFilename(new Date("2026-10-20T20:00:00.000Z"))).toBe("bookmarkdeck-notes-2026-10-21.json");
  });
});
