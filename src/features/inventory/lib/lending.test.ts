import { describe, expect, it } from "vitest";

import { lendingLedger, lentCount } from "@/features/inventory/lib/lending";
import type { InventoryItem } from "@/features/inventory/lib/types";

const TODAY = "2026-07-14";

function item(name: string, extra: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: name,
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

describe("lentCount", () => {
  it("counts active items that are lent out, ignoring the rest", () => {
    const items = [
      item("A", { lentTo: "Sam" }),
      item("B", { lentTo: "  " }), // blank borrower → not lent
      item("C"), // not lent
      item("D", { lentTo: "Kim", archived: true }), // archived → skip
    ];
    expect(lentCount(items)).toBe(1);
  });
});

describe("lendingLedger", () => {
  const items = [
    item("Overdue 4d", { lentTo: "Sam", dueDate: "2026-07-10" }),
    item("Overdue 9d", { lentTo: "Ada", dueDate: "2026-07-05" }),
    item("Due soon", { lentTo: "Lee", dueDate: "2026-07-16" }),
    item("On loan", { lentTo: "Ives", dueDate: "2026-08-30" }),
    item("Open long", { lentTo: "Ola", lentDate: "2026-06-14" }), // 30d held
    item("Open short", { lentTo: "Uma", lentDate: "2026-07-01" }), // 13d held
    item("Not lent"),
    item("Archived", { lentTo: "Ray", dueDate: "2026-07-01", archived: true }),
  ];

  it("keeps only active, lent items", () => {
    const names = lendingLedger(items, TODAY).map((e) => e.item.name);
    expect(names).not.toContain("Not lent");
    expect(names).not.toContain("Archived");
    expect(names).toHaveLength(6);
  });

  it("orders by urgency: most overdue → soonest due → open-ended (longest held)", () => {
    expect(lendingLedger(items, TODAY).map((e) => e.item.name)).toEqual([
      "Overdue 9d",
      "Overdue 4d",
      "Due soon",
      "On loan",
      "Open long",
      "Open short",
    ]);
  });

  it("classifies status and computes days from stored fields", () => {
    const byName = Object.fromEntries(
      lendingLedger(items, TODAY).map((e) => [e.item.name, e])
    );
    expect(byName["Overdue 9d"].status).toBe("overdue");
    expect(byName["Overdue 9d"].daysUntilDue).toBe(-9);
    expect(byName["Due soon"].status).toBe("due-soon");
    expect(byName["Due soon"].daysUntilDue).toBe(2);
    expect(byName["On loan"].status).toBe("on-loan");
    expect(byName["Open long"].status).toBe("no-due");
    expect(byName["Open long"].daysUntilDue).toBeNull();
    expect(byName["Open long"].heldDays).toBe(30);
    expect(byName["Open short"].heldDays).toBe(13);
  });
});
