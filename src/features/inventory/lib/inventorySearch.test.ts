import { describe, expect, it } from "vitest";

import {
  filterBookmarks,
  similarItems,
} from "@/features/inventory/lib/inventorySearch";
import type { InventoryItem, ItemLink } from "@/features/inventory/lib/types";

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
