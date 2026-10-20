import { beforeEach, describe, expect, it } from "vitest";

import { consumeNewNoteIntent, notesCacheKey, plainLine, readNoteSummaries, setNewNoteIntent } from "./notesIndex";

const ME = "me@example.com";
const note = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  title: id,
  body: "",
  pinned: false,
  tags: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

beforeEach(() => localStorage.clear());

describe("readNoteSummaries", () => {
  it("reads only the signed-in account's notes — never another account's on the same device", () => {
    localStorage.setItem(notesCacheKey(ME), JSON.stringify([note("mine")]));
    localStorage.setItem(notesCacheKey("other@example.com"), JSON.stringify([note("theirs")]));
    expect(readNoteSummaries(ME).map((n) => n.id)).toEqual(["mine"]);
    expect(readNoteSummaries(null)).toEqual([]);
  });

  it("orders pinned first, then most recent, and makes markdown readable", () => {
    localStorage.setItem(
      notesCacheKey(ME),
      JSON.stringify([
        note("old", { updatedAt: "2026-01-01T00:00:00.000Z" }),
        note("new", { title: "", body: "## **Trip** plan\n- [ ] book [hotel](https://x.dev)", updatedAt: "2026-02-01T00:00:00.000Z" }),
        note("pin", { pinned: true, tags: ["work"] }),
      ])
    );
    const s = readNoteSummaries(ME);
    expect(s.map((n) => n.id)).toEqual(["pin", "new", "old"]);
    expect(s[1]).toMatchObject({ title: "Trip plan", preview: "☐ book hotel" });
    expect(s[0].keywords).toContain("#work");
  });

  it("gives a locked note's title only — no body, so the palette can't search it", () => {
    localStorage.setItem(
      notesCacheKey(ME),
      JSON.stringify([note("l", { title: "Bank", body: "should never be here", lock: { kid: "v", iv: "i", ct: "c" } })])
    );
    const [s] = readNoteSummaries(ME);
    expect(s).toMatchObject({ title: "Bank", preview: "", locked: true });
    expect(s.keywords).not.toContain("never");
  });

  it("survives a malformed cache", () => {
    localStorage.setItem(notesCacheKey(ME), "{nope");
    expect(readNoteSummaries(ME)).toEqual([]);
  });
});

describe("plainLine", () => {
  it.each([
    ["# Heading", "Heading"],
    ["> quoted **bold**", "quoted bold"],
    ["1. [x] done `code`", "☑ done code"],
    ["[ ] bare task", "☐ bare task"],
    ["see [docs](https://x.dev) ~~old~~", "see docs old"],
  ])("%s → %s", (line, out) => {
    expect(plainLine(line)).toBe(out);
  });
});

describe("new-note intent", () => {
  it("is consumed exactly once", () => {
    expect(consumeNewNoteIntent()).toBe(false);
    setNewNoteIntent();
    expect(consumeNewNoteIntent()).toBe(true);
    expect(consumeNewNoteIntent()).toBe(false);
  });
});
