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
    links: partial.links ?? [],
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
      items: [
        item({
          name: "Camera",
          value: 900,
          warrantyExpiry: "2027-01-01",
          maintenanceDate: "2026-10-01",
          projectName: "Photo studio",
          collection: "Camera bag",
          disposition: "sell",
          releasedDate: "2026-07-14",
          barcode: "0123456789012",
        }),
      ],
      locations: [
        { id: "loc1", name: "Office", parentId: null, createdAt: null, updatedAt: null },
      ],
      settings: { defaultCurrency: "EUR", defaultView: "list" },
    };
    const json = inventoryToJson(backup, "2026-07-13T00:00:00Z");
    const parsed = inventoryFromJson(json);
    expect(parsed).not.toBeNull();
    expect(parsed!.items[0].name).toBe("Camera");
    // Maintenance + project + declutter survive the round-trip (not dropped).
    expect(parsed!.items[0].maintenanceDate).toBe("2026-10-01");
    expect(parsed!.items[0].projectName).toBe("Photo studio");
    expect(parsed!.items[0].collection).toBe("Camera bag");
    expect(parsed!.items[0].disposition).toBe("sell");
    expect(parsed!.items[0].releasedDate).toBe("2026-07-14");
    expect(parsed!.items[0].barcode).toBe("0123456789012");
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

  it("round-trips item links and drops malformed ones", () => {
    const backup: InventoryBackup = {
      items: [
        item({
          name: "Drill",
          links: [{ id: "bm1", title: "Manual", url: "https://bosch.com/manual" }],
        }),
      ],
      locations: [],
      settings: { defaultCurrency: "USD", defaultView: "grid" },
    };
    const parsed = inventoryFromJson(inventoryToJson(backup, "2026-07-14T00:00:00Z"));
    expect(parsed!.items[0].links).toEqual([
      { id: "bm1", title: "Manual", url: "https://bosch.com/manual" },
    ]);
    const junk = inventoryFromJson(
      JSON.stringify({ items: [{ id: "a", name: "X", links: [{ title: "no url" }] }] })
    );
    expect(junk!.items[0].links).toEqual([]);
  });
});
