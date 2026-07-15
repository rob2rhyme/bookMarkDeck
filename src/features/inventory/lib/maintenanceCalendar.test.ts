import { describe, expect, it } from "vitest";

import {
  relativeWhen,
  shortDate,
  upkeepCount,
  upkeepEntries,
  upkeepTimeline,
} from "@/features/inventory/lib/maintenanceCalendar";
import type { InventoryItem } from "@/features/inventory/lib/types";

function item(over: Partial<InventoryItem>): InventoryItem {
  return {
    id: Math.random().toString(36).slice(2),
    name: "Item",
    locationId: null,
    tags: [],
    quantity: 1,
    links: [],
    photos: [],
    createdAt: null,
    updatedAt: null,
    ...over,
  };
}

const TODAY = "2026-07-15";

describe("upkeepEntries", () => {
  it("includes maintenance dates (overdue and upcoming) and only upcoming warranty expiries", () => {
    const items = [
      item({ id: "a", name: "Boiler", maintenanceDate: "2026-07-01" }), // overdue upkeep
      item({ id: "b", name: "Laptop", warrantyExpiry: "2026-09-10" }), // upcoming warranty
      item({ id: "c", name: "Old TV", warrantyExpiry: "2025-01-01" }), // expired warranty → excluded
      item({ id: "d", name: "Bike", maintenanceDate: "2026-08-20" }), // upcoming upkeep
    ];
    const entries = upkeepEntries(items, TODAY);
    expect(entries.map((e) => e.id)).toEqual([
      "a:maintenance",
      "d:maintenance",
      "b:warranty",
    ]);
    expect(entries[0].days).toBe(-14); // Jul 1 is 14 days before Jul 15
    expect(entries.find((e) => e.id === "c:warranty")).toBeUndefined();
  });

  it("emits both a warranty and a maintenance entry for the same item", () => {
    const items = [
      item({ id: "x", name: "Furnace", maintenanceDate: "2026-08-01", warrantyExpiry: "2026-12-01" }),
    ];
    const entries = upkeepEntries(items, TODAY);
    expect(entries.map((e) => e.kind).sort()).toEqual(["maintenance", "warranty"]);
  });

  it("skips archived items", () => {
    const items = [item({ maintenanceDate: "2026-08-01", archived: true })];
    expect(upkeepEntries(items, TODAY)).toHaveLength(0);
  });
});

describe("upkeepTimeline", () => {
  it("puts overdue first, then months in chronological order with friendly labels", () => {
    const items = [
      item({ id: "a", name: "Boiler", maintenanceDate: "2026-07-01" }), // overdue
      item({ id: "b", name: "Filter", maintenanceDate: "2026-07-28" }), // this month
      item({ id: "c", name: "Bike", maintenanceDate: "2026-08-20" }), // next month
      item({ id: "d", name: "Car", maintenanceDate: "2026-11-05" }), // later
    ];
    const buckets = upkeepTimeline(items, TODAY);
    expect(buckets.map((b) => b.label)).toEqual([
      "Overdue",
      "This month",
      "Next month",
      "November 2026",
    ]);
    expect(buckets[0].entries[0].item.name).toBe("Boiler");
  });

  it("rolls the year over for December → next month", () => {
    const items = [item({ maintenanceDate: "2027-01-10" })];
    const buckets = upkeepTimeline(items, "2026-12-20");
    expect(buckets[0].label).toBe("Next month");
  });

  it("is empty when nothing is dated", () => {
    expect(upkeepTimeline([item({ name: "Mug" })], TODAY)).toEqual([]);
  });
});

describe("upkeepCount", () => {
  it("counts every tracked upkeep date", () => {
    const items = [
      item({ maintenanceDate: "2026-08-01", warrantyExpiry: "2026-12-01" }),
      item({ maintenanceDate: "2026-07-01" }),
    ];
    expect(upkeepCount(items, TODAY)).toBe(3);
  });
});

describe("shortDate & relativeWhen", () => {
  it("formats a short date", () => {
    expect(shortDate("2026-08-20")).toBe("Aug 20");
    expect(shortDate("bad")).toBe("bad");
  });

  it("phrases the day delta softly", () => {
    expect(relativeWhen(0)).toBe("today");
    expect(relativeWhen(1)).toBe("tomorrow");
    expect(relativeWhen(12)).toBe("in 12 days");
    expect(relativeWhen(-1)).toBe("1 day ago");
    expect(relativeWhen(-5)).toBe("5 days ago");
  });
});
