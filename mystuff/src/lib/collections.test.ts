import { describe, expect, it } from "vitest";

import {
  collectionGroups,
  collectionNames,
} from "@/lib/collections";
import type { InventoryItem } from "@/lib/types";

function item(partial: Partial<InventoryItem>): InventoryItem {
  return {
    id: partial.id ?? crypto.randomUUID(),
    name: partial.name ?? "Thing",
    locationId: null,
    tags: [],
    quantity: 1,
    links: [],
    photos: [],
    createdAt: null,
    updatedAt: null,
    ...partial,
  };
}

describe("collectionNames", () => {
  it("returns sorted, case-insensitively de-duped names from active items", () => {
    const items = [
      item({ collection: "Camera bag" }),
      item({ collection: "camera bag" }), // dupe (case)
      item({ collection: "Board games" }),
      item({ collection: "  " }), // blank
      item({ collection: "Gone", archived: true }), // archived
      item({}), // none
    ];
    expect(collectionNames(items)).toEqual(["Board games", "Camera bag"]);
  });
});

describe("collectionGroups", () => {
  const items = [
    item({ name: "Body", collection: "Camera bag", value: 1500 }),
    item({ name: "Lens", collection: "Camera bag", value: 800 }),
    item({ name: "SD card", collection: "camera bag", value: 30 }), // same kit, diff case
    item({ name: "Catan", collection: "Board games", value: 40 }),
    item({ name: "Loose", value: 100 }), // no collection
    item({ name: "Old body", collection: "Camera bag", value: 999, archived: true }),
  ];

  it("groups active items by collection, biggest total first", () => {
    const groups = collectionGroups(items);
    expect(groups.map((g) => g.name)).toEqual(["Camera bag", "Board games"]);
    expect(groups[0]).toMatchObject({ count: 3, totalValue: 2330 });
    expect(groups[1]).toMatchObject({ count: 1, totalValue: 40 });
  });

  it("orders members by value, marquee piece first, and excludes archived", () => {
    const camera = collectionGroups(items)[0];
    expect(camera.items.map((i) => i.name)).toEqual(["Body", "Lens", "SD card"]);
  });
});
