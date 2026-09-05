import { describe, expect, it } from "vitest";

import {
  alphabetSplit,
  folderLetter,
  folderYear,
  matchesRule,
  misfiledFolders,
  parseRule,
  suggestPlaces,
  type DrawerRule,
} from "@/features/filing/lib/drawers";
import type { FilingFolder, FilingPlace } from "@/features/filing/lib/types";

const place = (
  id: string,
  name: string,
  parentId: string | null = null,
  contents?: string
): FilingPlace => ({ id, name, parentId, contents, createdAt: null, updatedAt: null });

const folder = (over: Partial<FilingFolder> = {}): FilingFolder => ({
  id: "f",
  name: "Vehicles",
  homePlaceId: null,
  currentPlaceId: null,
  parentId: null,
  aliases: [],
  tags: [],
  createdAt: null,
  updatedAt: null,
  ...over,
});

describe("parseRule", () => {
  it("reads a letter range", () => {
    expect(parseRule("A-J")).toEqual({ kind: "letters", from: "A", to: "J" });
  });

  it("treats dashes, spacing, case and the word 'to' as one rule", () => {
    const expected: DrawerRule = { kind: "letters", from: "A", to: "J" };
    for (const raw of ["A-J", "a – j", "A — J", "A to J", "  a-J  ", "A−J"]) {
      expect(parseRule(raw)).toEqual(expected);
    }
  });

  it("puts a reversed range back the right way round", () => {
    expect(parseRule("J-A")).toEqual({ kind: "letters", from: "A", to: "J" });
  });

  it("reads a bare letter as a one-letter drawer", () => {
    expect(parseRule("S")).toEqual({ kind: "letters", from: "S", to: "S" });
  });

  it("reads a single year and a span of years", () => {
    expect(parseRule("2019")).toEqual({ kind: "years", from: 2019, to: 2019 });
    expect(parseRule("2019–2021")).toEqual({ kind: "years", from: 2019, to: 2021 });
  });

  it("reads the catch-all drawer by any of its usual names", () => {
    for (const raw of ["Misc.", "misc", "Other", "General", "Miscellaneous"]) {
      expect(parseRule(raw)).toEqual({ kind: "overflow" });
    }
  });

  it("falls back to a category label", () => {
    expect(parseRule("Taxes")).toEqual({ kind: "label", value: "taxes" });
  });

  it("keeps the inner spacing of a multi-word label", () => {
    expect(parseRule("Health - Dental")).toEqual({
      kind: "label",
      value: "health - dental",
    });
  });

  it("is null for blank or missing text", () => {
    expect(parseRule(undefined)).toBeNull();
    expect(parseRule("   ")).toBeNull();
  });
});

describe("folderLetter", () => {
  it("folds an accent onto its plain letter", () => {
    expect(folderLetter("Ángel")).toBe("A");
  });

  it("has no letter for a name starting with a digit", () => {
    expect(folderLetter("2024 Taxes")).toBeNull();
  });
});

describe("folderYear", () => {
  it("prefers coversThrough, which is what the retention clock runs off", () => {
    expect(
      folderYear({ name: "2019 Taxes", coversFrom: "2020-01-01", coversThrough: "2021-12-31" })
    ).toBe(2021);
  });

  it("falls back to coversFrom, then to a year in the name", () => {
    expect(folderYear({ name: "Taxes", coversFrom: "2020-01-01" })).toBe(2020);
    expect(folderYear({ name: "2024 Taxes" })).toBe(2024);
    expect(folderYear({ name: "Vehicles" })).toBeNull();
  });
});

describe("matchesRule", () => {
  const letters: DrawerRule = { kind: "letters", from: "K", to: "P" };

  it("claims a name inside the range and declines one outside", () => {
    expect(matchesRule(letters, { name: "Novak, Ellen" })).toBe(true);
    expect(matchesRule(letters, { name: "Anderson" })).toBe(false);
  });

  it("declines a digit-leading name for any letter range", () => {
    expect(matchesRule(letters, { name: "2024 Taxes" })).toBe(false);
  });

  it("matches a label against the category, then the tags", () => {
    const rule: DrawerRule = { kind: "label", value: "taxes" };
    expect(matchesRule(rule, { name: "x", category: " Taxes " })).toBe(true);
    expect(matchesRule(rule, { name: "x", tags: ["TAXES"] })).toBe(true);
    expect(matchesRule(rule, { name: "x", category: "Property" })).toBe(false);
  });

  it("never claims anything for an overflow drawer", () => {
    expect(matchesRule({ kind: "overflow" }, { name: "Anything" })).toBe(false);
  });
});

describe("suggestPlaces", () => {
  const PLACES = [
    place("cab", "Grey cabinet", null, "Papers"),
    place("d1", "Drawer 1", "cab", "A-J"),
    place("d2", "Drawer 2", "cab", "K-P"),
    place("d4", "Drawer 4", "cab", "Misc."),
    place("plain", "Shelf", null),
  ];

  it("suggests the drawer whose range claims the folder", () => {
    expect(suggestPlaces(PLACES, { name: "Novak, Ellen" })).toEqual(["d2"]);
  });

  it("prefers a drawer over the cabinet around it", () => {
    const hits = suggestPlaces(PLACES, { name: "Anderson", category: "Papers" });
    expect(hits[0]).toBe("d1");
    expect(hits).toContain("cab");
  });

  it("falls back to the catch-all drawer when no rule claims it", () => {
    expect(suggestPlaces(PLACES, { name: "2024 Taxes" })).toEqual(["d4"]);
  });

  it("suggests nothing rather than guessing when there is no catch-all", () => {
    const noOverflow = PLACES.filter((p) => p.id !== "d4" && p.id !== "cab");
    expect(suggestPlaces(noOverflow, { name: "2024 Taxes" })).toEqual([]);
  });
});

describe("misfiledFolders", () => {
  const PLACES = [
    place("cab", "Grey cabinet"),
    place("d1", "Drawer 1", "cab", "A-J"),
    place("d2", "Drawer 2", "cab", "K-P"),
    place("d3", "Drawer 3", "cab", "Q-Z"),
    place("d4", "Drawer 4", "cab", "Misc."),
  ];

  it("flags a folder whose neighbour claims it", () => {
    const f = folder({ name: "Anderson", homePlaceId: "d3" });
    expect(misfiledFolders(PLACES, [f])).toEqual([
      { folder: f, placeId: "d3", suggestedPlaceId: "d1" },
    ]);
  });

  it("stays silent when no sibling has a better claim", () => {
    // No letter drawer claims a digit-leading name, so there is nowhere to send it.
    const f = folder({ name: "2024 Taxes", homePlaceId: "d3" });
    expect(misfiledFolders(PLACES, [f])).toEqual([]);
  });

  it("stays silent for a folder in the catch-all drawer", () => {
    const f = folder({ name: "Anderson", homePlaceId: "d4" });
    expect(misfiledFolders(PLACES, [f])).toEqual([]);
  });

  it("stays silent when the drawer carries no rule", () => {
    const noRule = [place("cab", "Grey cabinet"), place("d1", "Drawer 1", "cab")];
    const f = folder({ name: "Anderson", homePlaceId: "d1" });
    expect(misfiledFolders(noRule, [f])).toEqual([]);
  });

  it("judges a checked-out folder by its home, not by where it sits", () => {
    const f = folder({ name: "Anderson", homePlaceId: "d1", currentPlaceId: "desk" });
    expect(misfiledFolders(PLACES, [f])).toEqual([]);
  });

  it("never looks outside the cabinet the folder is in", () => {
    const other = [...PLACES, place("cab2", "Black cabinet"), place("x", "Drawer A", "cab2", "A-J")];
    const f = folder({ name: "Anderson", homePlaceId: "d3" });
    // d1 is the sibling that claims it; the other cabinet's A-J is never offered.
    expect(misfiledFolders(other, [f]).map((m) => m.suggestedPlaceId)).toEqual(["d1"]);
  });

  it("ignores archived folders", () => {
    const f = folder({ name: "Anderson", homePlaceId: "d3", archived: true });
    expect(misfiledFolders(PLACES, [f])).toEqual([]);
  });
});

describe("alphabetSplit", () => {
  it("covers A-Z exactly once, in order", () => {
    for (const n of [1, 2, 3, 4, 5, 8, 26]) {
      const spans = alphabetSplit(n);
      expect(spans).toHaveLength(n);
      const letters = spans.flatMap((s) => {
        const [a, b] = s.length === 1 ? [s, s] : s.split("-");
        return Array.from(
          { length: b.charCodeAt(0) - a.charCodeAt(0) + 1 },
          (_, i) => String.fromCharCode(a.charCodeAt(0) + i)
        );
      });
      expect(letters.join("")).toBe("ABCDEFGHIJKLMNOPQRSTUVWXYZ");
    }
  });

  it("splits by how much paper each letter carries, not by letter count", () => {
    // An even split of 26 into 4 would be A-F/G-M/N-S/T-Z; the busy middle
    // letters push the boundaries out instead.
    expect(alphabetSplit(4)).toEqual(["A-D", "E-K", "L-Q", "R-Z"]);
  });

  it("gives one drawer the whole alphabet", () => {
    expect(alphabetSplit(1)).toEqual(["A-Z"]);
  });

  it("clamps a nonsense count into range", () => {
    expect(alphabetSplit(0)).toEqual(["A-Z"]);
    expect(alphabetSplit(99)).toHaveLength(26);
  });

  it("produces spans the parser reads back as letter rules", () => {
    for (const span of alphabetSplit(4)) {
      expect(parseRule(span)?.kind).toBe("letters");
    }
  });
});
