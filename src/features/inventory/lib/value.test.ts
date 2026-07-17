import { describe, expect, it } from "vitest";

import {
  attention,
  attentionCount,
  daysUntil,
  depreciationFor,
  formatMoney,
  itemResale,
  itemValue,
  paidWithTax,
  shiftYears,
  taxAmount,
  maintenanceState,
  reminderCount,
  resaleCurve,
  straightLineValue,
  totalPaid,
  totalResale,
  totalValue,
  unitResale,
  valueByCategory,
  valueByLocation,
  warrantyState,
  yearsBetween,
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

describe("taxAmount / paidWithTax", () => {
  it("applies the rate to price × quantity", () => {
    const i = item({ price: 100, taxRate: 6, quantity: 2 });
    expect(taxAmount(i)).toBeCloseTo(12);
    expect(paidWithTax(i)).toBeCloseTo(212);
  });

  it("is zero without a price or a positive rate", () => {
    expect(taxAmount(item({ taxRate: 6 }))).toBe(0);
    expect(taxAmount(item({ price: 50 }))).toBe(0);
    expect(taxAmount(item({ price: 50, taxRate: 0 }))).toBe(0);
    expect(paidWithTax(item({ price: 50 }))).toBe(50);
  });

  it("taxes and totals a warranty-plan cost with the line", () => {
    const i = item({ price: 100, taxRate: 6, quantity: 2, warrantyCost: 50 });
    expect(taxAmount(i)).toBeCloseTo(15); // (200 + 50) × 6%
    expect(paidWithTax(i)).toBeCloseTo(265);
    // Warranty without a price still counts.
    const w = item({ taxRate: 6, warrantyCost: 50 });
    expect(taxAmount(w)).toBeCloseTo(3);
    expect(paidWithTax(w)).toBeCloseTo(53);
  });
});

describe("shiftYears", () => {
  it("adds whole and fractional years (rounded to months)", () => {
    expect(shiftYears("2026-07-17", 3)).toBe("2029-07-17");
    expect(shiftYears("2026-07-17", 0.5)).toBe("2027-01-17");
  });

  it("clamps to real month ends", () => {
    expect(shiftYears("2024-02-29", 1)).toBe("2025-02-28");
  });

  it("rejects bad input", () => {
    expect(shiftYears("not-a-day", 1)).toBeNull();
    expect(shiftYears("2026-07-17", 0)).toBeNull();
    expect(shiftYears("2026-07-17", -2)).toBeNull();
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
  it("classifies maintenance windows", () => {
    expect(maintenanceState(item({}), today)).toBe("none");
    expect(maintenanceState(item({ maintenanceDate: "2026-07-01" }), today)).toBe("overdue");
    expect(maintenanceState(item({ maintenanceDate: "2026-07-30" }), today)).toBe("soon");
    expect(maintenanceState(item({ maintenanceDate: "2027-01-01" }), today)).toBe("ok");
  });
  it("buckets items needing attention, flagging overdue returns and upkeep", () => {
    const a = attention(
      [
        item({ name: "Laptop", warrantyExpiry: "2026-07-01" }),
        item({ name: "Drill", warrantyExpiry: "2026-08-01" }),
        item({ name: "Furnace", maintenanceDate: "2026-07-05" }),
        item({ name: "Bike", maintenanceDate: "2026-07-25" }),
        item({ name: "Book", lentTo: "Sam", dueDate: "2026-07-10" }),
        item({ name: "Charger", lentTo: "Kim", dueDate: "2026-08-10" }),
      ],
      today
    );
    expect(a.warrantyExpired.map((i) => i.name)).toEqual(["Laptop"]);
    expect(a.warrantySoon.map((i) => i.name)).toEqual(["Drill"]);
    expect(a.maintenanceOverdue.map((i) => i.name)).toEqual(["Furnace"]);
    expect(a.maintenanceSoon.map((i) => i.name)).toEqual(["Bike"]);
    expect(a.lentOut).toHaveLength(2);
    expect(a.returnOverdue.map((i) => i.name)).toEqual(["Book"]);
    // panel counts everything shown (both loans); the nav badge counts only
    // reminders (overdue return, not the on-time one).
    expect(attentionCount(a)).toBe(6);
    expect(reminderCount(a)).toBe(5);
  });
});

describe("depreciation / resale", () => {
  const today = "2026-07-14";

  it("straight-lines from price to the salvage floor over the life", () => {
    const p = { lifeYears: 7, salvageRate: 0.1 };
    expect(straightLineValue(1000, 0, p)).toBe(1000); // new
    expect(straightLineValue(1000, 3.5, p)).toBe(550); // halfway
    expect(straightLineValue(1000, 7, p)).toBeCloseTo(100); // at life → floor
    expect(straightLineValue(1000, 20, p)).toBeCloseTo(100); // beyond → floor
    expect(straightLineValue(0, 2, p)).toBe(0);
  });

  it("picks category-typical params, else the default", () => {
    expect(depreciationFor("Electronics").lifeYears).toBe(4);
    expect(depreciationFor("Furniture").lifeYears).toBe(12);
    expect(depreciationFor("Groceries")).toEqual({ lifeYears: 7, salvageRate: 0.1 });
    expect(depreciationFor(undefined).lifeYears).toBe(7);
  });

  it("measures fractional years, never negative", () => {
    expect(yearsBetween("2024-07-14", today)).toBeCloseTo(2, 1);
    expect(yearsBetween("2030-01-01", today)).toBe(0); // future purchase
  });

  it("resolves unit resale by override → depreciated price → price → 0", () => {
    // manual value always wins
    expect(unitResale(item({ value: 500, price: 1000, purchaseDate: "2000-01-01" }), today)).toBe(500);
    // priced + bought today → age 0 → full price
    expect(unitResale(item({ price: 1000, purchaseDate: today }), today)).toBe(1000);
    // priced + ancient (past its life) → salvage floor (default 10%)
    expect(unitResale(item({ price: 1000, purchaseDate: "1990-01-01" }), today)).toBeCloseTo(100);
    // priced, no date → can't age it, use price
    expect(unitResale(item({ price: 200 }), today)).toBe(200);
    // nothing priced
    expect(unitResale(item({}), today)).toBe(0);
    // quantity multiplies
    expect(itemResale(item({ price: 200, quantity: 3 }), today)).toBe(600);
  });

  it("totals paid vs resale over live items only", () => {
    const items = [
      item({ price: 1000, purchaseDate: today, quantity: 2 }), // paid 2000, resale 2000 (age 0)
      item({ price: 500, purchaseDate: "1990-01-01" }), // paid 500, resale ~50 (floor)
      item({ price: 999, archived: true }), // excluded
    ];
    expect(totalPaid(items)).toBe(2500);
    expect(totalResale(items, today)).toBeCloseTo(2050);
  });

  it("totalPaid includes sales tax and warranty plans", () => {
    expect(totalPaid([item({ price: 100, taxRate: 6, quantity: 2 })])).toBeCloseTo(212);
    expect(
      totalPaid([item({ price: 100, taxRate: 6, warrantyCost: 50 })])
    ).toBeCloseTo(159);
  });

  it("projects a non-increasing portfolio curve; year 0 equals resale now", () => {
    const items = [
      item({ price: 1000, purchaseDate: today }), // declines
      item({ value: 500 }), // manual → flat
      item({ price: 200 }), // undated → flat
    ];
    const curve = resaleCurve(items, today, 5);
    expect(curve).toHaveLength(6);
    expect(curve[0].total).toBeCloseTo(totalResale(items, today));
    expect(curve[0].total).toBeCloseTo(1700); // 1000 + 500 + 200
    for (let i = 1; i < curve.length; i++) {
      expect(curve[i].total).toBeLessThanOrEqual(curve[i - 1].total);
    }
    // the flat items keep a floor under the curve
    expect(curve[5].total).toBeGreaterThan(700);
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
