import { describe, expect, it } from "vitest";

import {
  cleanWhereQuery,
  filterBookmarks,
  locationPathsById,
  similarItems,
  whereIs,
} from "@/features/inventory/lib/inventorySearch";
import type {
  InventoryItem,
  InventoryLocation,
  ItemLink,
} from "@/features/inventory/lib/types";

function item(name: string, extra: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: crypto.randomUUID(),
    name,
    locationId: null,
    tags: [],
    quantity: 1,
    links: [],
    photos: [],
    createdAt: null,
    updatedAt: null,
    ...extra,
  };
}

function loc(
  id: string,
  name: string,
  parentId: string | null = null
): InventoryLocation {
  return { id, name, parentId, createdAt: null, updatedAt: null };
}

describe("similarItems", () => {
  const owned = [
    item("Bosch cordless drill"),
    item("HDMI cable 2m"),
    item("Sony A7 IV camera"),
  ];

  it("matches by substring either way", () => {
    expect(similarItems(owned, "drill").map((i) => i.name)).toEqual([
      "Bosch cordless drill",
    ]);
    expect(
      similarItems(owned, "Sony A7 IV camera with strap").map((i) => i.name)
    ).toEqual(["Sony A7 IV camera"]);
  });

  it("matches on a shared word of 3+ letters", () => {
    expect(similarItems(owned, "usb cable").map((i) => i.name)).toEqual([
      "HDMI cable 2m",
    ]);
  });

  it("ignores short queries and respects the cap", () => {
    expect(similarItems(owned, "dr")).toEqual([]);
    const many = [item("box a"), item("box b"), item("box c"), item("box d")];
    expect(similarItems(many, "box", 3)).toHaveLength(3);
  });

  it("still surfaces archived items — you own them either way", () => {
    const items = [item("Ladder", { archived: true })];
    expect(similarItems(items, "ladder")).toHaveLength(1);
  });
});

describe("filterBookmarks", () => {
  const marks: ItemLink[] = [
    { id: "1", title: "Bosch drill manual", url: "https://bosch.com/manual" },
    { id: "2", title: "Warranty portal", url: "https://support.sony.com" },
  ];

  it("matches title or url, case-insensitively", () => {
    expect(filterBookmarks(marks, "BOSCH")).toHaveLength(1);
    expect(filterBookmarks(marks, "sony")).toHaveLength(1);
  });

  it("returns nothing for an empty query and respects the cap", () => {
    expect(filterBookmarks(marks, "  ")).toEqual([]);
    expect(filterBookmarks(marks, "o", 1)).toHaveLength(1);
  });
});

describe("locationPathsById", () => {
  it("builds a root→leaf breadcrumb for nested locations", () => {
    const locs = [
      loc("a", "Bedroom"),
      loc("b", "Closet", "a"),
      loc("c", "Top shelf", "b"),
      loc("d", "Garage"),
    ];
    const paths = locationPathsById(locs);
    expect(paths.c).toEqual(["Bedroom", "Closet", "Top shelf"]);
    expect(paths.a).toEqual(["Bedroom"]);
    expect(paths.d).toEqual(["Garage"]);
  });

  it("stops at a missing parent and survives a cycle", () => {
    const orphan = locationPathsById([loc("x", "Drawer", "ghost")]);
    expect(orphan.x).toEqual(["Drawer"]);
    // a→b→a should not loop forever
    const cyclic = locationPathsById([loc("a", "A", "b"), loc("b", "B", "a")]);
    expect(cyclic.a.at(-1)).toBe("A");
    expect(cyclic.b.at(-1)).toBe("B");
  });
});

describe("cleanWhereQuery", () => {
  it("strips the natural-language wrapper", () => {
    expect(cleanWhereQuery("Where's my passport?")).toBe("passport");
    expect(cleanWhereQuery("where is the drill")).toBe("drill");
    expect(cleanWhereQuery("find my keys")).toBe("keys");
    expect(cleanWhereQuery("  Camera ")).toBe("camera");
  });
});

describe("whereIs", () => {
  const locs = [
    loc("bed", "Bedroom"),
    loc("desk", "Desk drawer", "bed"),
    loc("garage", "Garage"),
  ];
  const items = [
    item("Passport", { locationId: "desk" }),
    item("Cordless drill", { locationId: "garage", manufacturer: "Bosch" }),
    item("Sony A7 IV camera", { locationId: null }),
    item("Old ladder", { locationId: "garage", archived: true }),
  ];

  it("returns the item with its full location breadcrumb", () => {
    const [top] = whereIs(items, locs, "passport");
    expect(top.item.name).toBe("Passport");
    expect(top.path).toEqual(["Bedroom", "Desk drawer"]);
  });

  it("understands a natural-language question", () => {
    expect(whereIs(items, locs, "where's my drill")[0].item.name).toBe(
      "Cordless drill"
    );
  });

  it("is forgiving of typos (fuzzy subsequence)", () => {
    expect(whereIs(items, locs, "camra")[0].item.name).toBe("Sony A7 IV camera");
  });

  it("matches a secondary field but ranks name matches first", () => {
    // "bosch" only appears in manufacturer
    expect(whereIs(items, locs, "bosch")[0].item.name).toBe("Cordless drill");
  });

  it("skips archived items and short queries, and caps results", () => {
    expect(whereIs(items, locs, "ladder")).toEqual([]);
    expect(whereIs(items, locs, "a")).toEqual([]);
    expect(whereIs(items, locs, "camera", 0)).toHaveLength(0);
  });

  it("reports an empty path for an unassigned item", () => {
    expect(whereIs(items, locs, "camera")[0].path).toEqual([]);
  });
});
