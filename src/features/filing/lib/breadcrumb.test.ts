import { describe, expect, it } from "vitest";

import {
  folderTrail,
  formatPath,
  isCheckedOut,
  placePathsById,
} from "@/features/filing/lib/breadcrumb";
import type { FilingFolder, FilingPlace } from "@/features/filing/lib/types";

const place = (id: string, name: string, parentId: string | null = null): FilingPlace => ({
  id, name, parentId, createdAt: null, updatedAt: null,
});

const PLACES = [
  place("garage", "Garage"),
  place("cab", "Grey cabinet", "garage"),
  place("d2", "Drawer 2", "cab"),
  place("office", "Office"),
];

const folder = (over: Partial<FilingFolder> = {}): FilingFolder => ({
  id: "f", name: "Vehicles", homePlaceId: "d2", currentPlaceId: null,
  parentId: null, aliases: [], tags: [], createdAt: null, updatedAt: null, ...over,
});

describe("placePathsById", () => {
  it("walks root to leaf", () => {
    expect(placePathsById(PLACES)["d2"]).toEqual(["Garage", "Grey cabinet", "Drawer 2"]);
  });

  it("stops at a missing parent instead of throwing", () => {
    expect(placePathsById([place("x", "Orphan", "gone")])["x"]).toEqual(["Orphan"]);
  });

  it("breaks a cycle rather than looping forever", () => {
    const cyclic = [place("a", "A", "b"), place("b", "B", "a")];
    expect(placePathsById(cyclic)["a"].length).toBeGreaterThan(0);
  });
});

describe("formatPath", () => {
  it("joins with the crumb separator", () => {
    expect(formatPath(["Garage", "Drawer 2"])).toBe("Garage › Drawer 2");
  });

  it("falls back when there is no place", () => {
    expect(formatPath([], "Unfiled")).toBe("Unfiled");
  });
});

describe("folderTrail", () => {
  const paths = placePathsById(PLACES);

  it("appends the folder so the last hop is what you pull", () => {
    expect(folderTrail(folder(), paths)).toEqual([
      "Garage", "Grey cabinet", "Drawer 2", "Vehicles",
    ]);
  });

  it("answers with where it IS, not where it belongs", () => {
    const out = folderTrail(folder({ currentPlaceId: "office" }), paths);
    expect(out).toEqual(["Office", "Vehicles"]);
  });

  it("still names the folder when it has no place at all", () => {
    expect(folderTrail(folder({ homePlaceId: null }), paths)).toEqual(["Vehicles"]);
  });
});

describe("isCheckedOut", () => {
  it("is false when current is unset — that just means it is at home", () => {
    expect(isCheckedOut(folder())).toBe(false);
  });

  it("is false when current equals home", () => {
    expect(isCheckedOut(folder({ currentPlaceId: "d2" }))).toBe(false);
  });

  it("is true when current differs from home", () => {
    expect(isCheckedOut(folder({ currentPlaceId: "office" }))).toBe(true);
  });

  it("is true for a homeless folder that is somewhere specific", () => {
    expect(isCheckedOut(folder({ homePlaceId: null, currentPlaceId: "office" }))).toBe(true);
  });
});
