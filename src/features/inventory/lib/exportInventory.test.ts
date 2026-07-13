import { describe, expect, it } from "vitest";

import {
  backupCount,
  inventoryFromJson,
  inventoryToJson,
  itemsToCsv,
} from "@/features/inventory/lib/exportInventory";
import type { InventoryBackup, InventoryItem } from "@/features/inventory/lib/types";

function item(partial: Partial<InventoryItem>): InventoryItem {
  return {
    id: partial.id ?? crypto.randomUUID(),
    name: partial.name ?? "Thing",
    locationId: partial.locationId ?? null,
    tags: partial.tags ?? [],
    quantity: partial.quantity ?? 1,
    photos: partial.photos ?? [],
    createdAt: null,
    updatedAt: null,
    ...partial,
  };
}

describe("itemsToCsv", () => {
  it("emits a header and resolves the location name", () => {
    const csv = itemsToCsv(
      [item({ name: "Desk", locationId: "loc1", category: "Furniture", value: 300 })],
      { loc1: "Office" }
    );
    const [header, row] = csv.split("\n");
    expect(header.startsWith("name,category,location,quantity")).toBe(true);
    expect(row).toContain("Desk");
    expect(row).toContain("Office");
  });
  it("quotes cells that contain commas", () => {
    const csv = itemsToCsv([item({ name: "Sofa, large" })], {});
    expect(csv).toContain('"Sofa, large"');
  });
});

describe("inventory JSON round-trip", () => {
  it("re-imports what it exported, dropping malformed records", () => {
    const backup: InventoryBackup = {
      items: [item({ name: "Camera", value: 900, warrantyExpiry: "2027-01-01" })],
      locations: [
        { id: "loc1", name: "Office", parentId: null, createdAt: null, updatedAt: null },
      ],
      settings: { defaultCurrency: "EUR", defaultView: "list" },
    };
    const json = inventoryToJson(backup, "2026-07-13T00:00:00Z");
    const parsed = inventoryFromJson(json);
    expect(parsed).not.toBeNull();
    expect(parsed!.items[0].name).toBe("Camera");
    expect(parsed!.locations[0].name).toBe("Office");
    expect(parsed!.settings).toEqual({ defaultCurrency: "EUR", defaultView: "list" });
    expect(backupCount(parsed!)).toBe(2);
  });
  it("returns null for junk or empty payloads", () => {
    expect(inventoryFromJson("not json")).toBeNull();
    expect(inventoryFromJson(JSON.stringify({ items: [], locations: [] }))).toBeNull();
  });
  it("drops an item with no name but keeps valid ones", () => {
    const json = JSON.stringify({
      items: [{ id: "a", name: "" }, { id: "b", name: "Keeper" }],
    });
    const parsed = inventoryFromJson(json);
    expect(parsed!.items.map((i) => i.name)).toEqual(["Keeper"]);
  });
});
