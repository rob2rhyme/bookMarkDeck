import { describe, expect, it } from "vitest";

import {
  attention,
  daysUntil,
  formatMoney,
  itemValue,
  totalValue,
  valueByCategory,
  valueByLocation,
  warrantyState,
} from "@/features/inventory/lib/value";
import type { InventoryItem, InventoryLocation } from "@/features/inventory/lib/types";

function item(partial: Partial<InventoryItem>): InventoryItem {
  return {
    id: partial.id ?? crypto.randomUUID(),
    name: partial.name ?? "Thing",
    locationId: partial.locationId ?? null,
    tags: partial.tags ?? [],
    quantity: partial.quantity ?? 1,
    links: partial.links ?? [],
    photos: partial.photos ?? [],
    createdAt: null,
    updatedAt: null,
    ...partial,
  };
}

describe("daysUntil", () => {
  it("counts whole days forward and backward", () => {
    expect(daysUntil("2026-07-20", "2026-07-13")).toBe(7);
    expect(daysUntil("2026-07-10", "2026-07-13")).toBe(-3);
    expect(daysUntil("2026-07-13", "2026-07-13")).toBe(0);
  });
  it("returns null for malformed dates", () => {
    expect(daysUntil("nope", "2026-07-13")).toBeNull();
  });
});

describe("itemValue / totalValue", () => {
  it("prefers manual value, falls back to price, multiplies by quantity", () => {
    expect(itemValue(item({ value: 100, price: 40, quantity: 2 }))).toBe(200);
    expect(itemValue(item({ price: 40, quantity: 3 }))).toBe(120);
    expect(itemValue(item({ quantity: 5 }))).toBe(0);
  });
  it("treats a zero/blank quantity as one", () => {
    expect(itemValue(item({ value: 50, quantity: 0 }))).toBe(50);
  });
  it("excludes archived items from the total", () => {
    const items = [
      item({ value: 100 }),
      item({ value: 999, archived: true }),
    ];
    expect(totalValue(items)).toBe(100);
  });
});

describe("valueByCategory / valueByLocation", () => {
  it("groups by category, biggest first, folding uncategorized", () => {
    const rows = valueByCategory([
      item({ category: "Electronics", value: 500 }),
      item({ category: "Electronics", value: 300 }),
      item({ value: 50 }),
    ]);
    expect(rows[0]).toMatchObject({ label: "Electronics", total: 800, count: 2 });
    expect(rows[1]).toMatchObject({ label: "Uncategorized", total: 50, count: 1 });
  });
  it("labels missing locations Unassigned", () => {
    const locations: InventoryLocation[] = [
      { id: "loc1", name: "Office", parentId: null, createdAt: null, updatedAt: null },
    ];
    const rows = valueByLocation(
      [item({ locationId: "loc1", value: 200 }), item({ value: 20 })],
      locations
    );
    expect(rows[0]).toMatchObject({ label: "Office", total: 200 });
    expect(rows[1]).toMatchObject({ label: "Unassigned", total: 20 });
  });
});

describe("warrantyState / attention", () => {
  const today = "2026-07-13";
  it("classifies warranty windows", () => {
    expect(warrantyState(item({}), today)).toBe("none");
    expect(warrantyState(item({ warrantyExpiry: "2026-07-01" }), today)).toBe("expired");
    expect(warrantyState(item({ warrantyExpiry: "2026-07-30" }), today)).toBe("soon");
    expect(warrantyState(item({ warrantyExpiry: "2027-01-01" }), today)).toBe("ok");
  });
  it("buckets items needing attention, flagging overdue returns", () => {
    const a = attention(
      [
        item({ name: "Laptop", warrantyExpiry: "2026-07-01" }),
        item({ name: "Drill", warrantyExpiry: "2026-08-01" }),
        item({ name: "Book", lentTo: "Sam", dueDate: "2026-07-10" }),
        item({ name: "Charger", lentTo: "Kim", dueDate: "2026-08-10" }),
      ],
      today
    );
    expect(a.warrantyExpired.map((i) => i.name)).toEqual(["Laptop"]);
    expect(a.warrantySoon.map((i) => i.name)).toEqual(["Drill"]);
    expect(a.lentOut).toHaveLength(2);
    expect(a.returnOverdue.map((i) => i.name)).toEqual(["Book"]);
  });
});

describe("formatMoney", () => {
  it("formats a currency amount", () => {
    expect(formatMoney(1200, "USD")).toBe("$1,200");
  });
  it("does not throw on a bad currency code", () => {
    expect(() => formatMoney(10, "!!")).not.toThrow();
  });
});
