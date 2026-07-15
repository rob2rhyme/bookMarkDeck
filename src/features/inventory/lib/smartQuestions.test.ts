import { describe, expect, it } from "vitest";

import { smartAnswers } from "@/features/inventory/lib/smartQuestions";
import type { InventoryItem } from "@/features/inventory/lib/types";

function item(extra: Partial<InventoryItem>): InventoryItem {
  return {
    id: extra.id ?? crypto.randomUUID(),
    name: extra.name ?? "Thing",
    locationId: extra.locationId ?? null,
    tags: [],
    quantity: 1,
    links: [],
    photos: extra.photos ?? [{ id: "p", url: "https://x/p.webp" }],
    createdAt: null,
    updatedAt: null,
    ...extra,
  };
}

const today = "2026-07-15";
const byId = (a: ReturnType<typeof smartAnswers>, id: string) =>
  a.find((x) => x.id === id);

describe("smartAnswers", () => {
  it("omits questions with no matches (calm — no wall of zeros)", () => {
    const answers = smartAnswers([item({ name: "Mug", locationId: "kitchen" })], today);
    expect(byId(answers, "warranty-expired")).toBeUndefined();
    expect(byId(answers, "lent-out")).toBeUndefined();
  });

  it("buckets warranty, upkeep, lending and overdue returns", () => {
    const items = [
      item({ name: "Laptop", warrantyExpiry: "2026-06-01", locationId: "office" }),
      item({ name: "Drill", warrantyExpiry: "2026-08-01", locationId: "garage" }),
      item({ name: "Furnace filter", maintenanceDate: "2026-07-20", locationId: "base" }),
      item({ name: "Book", lentTo: "Sam", dueDate: "2026-07-10", locationId: "shelf" }),
      item({ name: "Tent", lentTo: "Kim", dueDate: "2026-08-10", locationId: "garage" }),
    ];
    const a = smartAnswers(items, today);
    expect(byId(a, "warranty-expired")!.items.map((i) => i.name)).toEqual(["Laptop"]);
    expect(byId(a, "warranty-soon")!.items.map((i) => i.name)).toEqual(["Drill"]);
    expect(byId(a, "upkeep-due")!.items.map((i) => i.name)).toEqual(["Furnace filter"]);
    expect(byId(a, "lent-out")!.items).toHaveLength(2);
    expect(byId(a, "return-overdue")!.items.map((i) => i.name)).toEqual(["Book"]);
  });

  it("flags unassigned and un-photographed items", () => {
    const items = [
      item({ name: "Cable", locationId: null, photos: [] }),
      item({ name: "Lamp", locationId: "living", photos: [{ id: "p", url: "u" }] }),
    ];
    const a = smartAnswers(items, today);
    expect(byId(a, "unassigned")!.items.map((i) => i.name)).toEqual(["Cable"]);
    expect(byId(a, "no-photo")!.items.map((i) => i.name)).toEqual(["Cable"]);
  });

  it("ranks most-valuable desc and caps at 5, ignoring zero-value items", () => {
    const items = [
      item({ name: "A", value: 10, locationId: "x" }),
      item({ name: "B", value: 900, locationId: "x" }),
      item({ name: "C", locationId: "x" }), // no value
    ];
    const mv = byId(smartAnswers(items, today), "most-valuable")!;
    expect(mv.items.map((i) => i.name)).toEqual(["B", "A"]);
  });

  it("excludes archived items from every answer", () => {
    const items = [
      item({ name: "Old TV", warrantyExpiry: "2026-01-01", archived: true }),
      item({ name: "New TV", warrantyExpiry: "2026-01-01" }),
    ];
    const a = smartAnswers(items, today);
    expect(byId(a, "warranty-expired")!.items.map((i) => i.name)).toEqual(["New TV"]);
  });

  it("orders urgent buckets before neutral ones", () => {
    const items = [
      item({ name: "Book", lentTo: "Sam", dueDate: "2026-07-01" }), // overdue (urgent)
      item({ name: "Cable", locationId: null, photos: [] }), // unassigned/no-photo (neutral)
    ];
    const ids = smartAnswers(items, today).map((x) => x.id);
    expect(ids.indexOf("return-overdue")).toBeLessThan(ids.indexOf("unassigned"));
  });
});
