import { describe, expect, it } from "vitest";

import {
  declutterItems,
  declutterSummary,
  releasedOn,
} from "@/lib/declutter";
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

describe("declutterItems", () => {
  it("keeps only active, tagged items, ordered sell→donate→giveaway→toss", () => {
    const items = [
      item({ name: "Couch", disposition: "donate" }),
      item({ name: "Camera", disposition: "sell" }),
      item({ name: "Charger", disposition: "giveaway" }),
      item({ name: "Broken lamp", disposition: "trash" }),
      item({ name: "Keeper" }), // untagged
      item({ name: "Gone", disposition: "sell", archived: true }), // released
    ];
    expect(declutterItems(items).map((i) => i.name)).toEqual([
      "Camera",
      "Couch",
      "Charger",
      "Broken lamp",
    ]);
  });
});

describe("declutterSummary", () => {
  it("counts by disposition and totals the sell recoup", () => {
    const s = declutterSummary([
      item({ disposition: "sell", value: 200, quantity: 2 }), // 400
      item({ disposition: "sell", price: 50 }), // 50
      item({ disposition: "donate" }),
      item({ disposition: "sell", archived: true, value: 999 }), // released → excluded
    ]);
    expect(s.count).toBe(3);
    expect(s.byDisposition.sell).toBe(2);
    expect(s.byDisposition.donate).toBe(1);
    expect(s.sellValue).toBe(450);
  });
});

describe("releasedOn", () => {
  it("counts items let go on the given day", () => {
    const items = [
      item({ releasedDate: "2026-07-14" }),
      item({ releasedDate: "2026-07-14" }),
      item({ releasedDate: "2026-07-13" }),
      item({ releasedDate: null }),
      item({}),
    ];
    expect(releasedOn(items, "2026-07-14")).toBe(2);
    expect(releasedOn(items, "2026-07-13")).toBe(1);
    expect(releasedOn(items, "")).toBe(0);
  });
});
