import { describe, it, expect, beforeEach } from "vitest";

import { createMemoryStore, type KeyValueStore } from "./repo";
import { createLocalRepo } from "./localRepo";
import { DEFAULT_INVENTORY_SETTINGS, type InventoryItem } from "@/lib/types";

function item(over: Partial<InventoryItem> & { id: string }): InventoryItem {
  return {
    name: `item-${over.id}`,
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

let store: KeyValueStore;
let repo: ReturnType<typeof createLocalRepo>;

beforeEach(() => {
  store = createMemoryStore();
  repo = createLocalRepo(store);
});

describe("items", () => {
  it("starts empty", async () => {
    expect(await repo.listItems()).toEqual([]);
    expect(await repo.getItem("nope")).toBeNull();
  });

  it("round-trips an item", async () => {
    await repo.upsertItem(item({ id: "a", name: "Coffee grinder" }));
    expect(await repo.listItems()).toHaveLength(1);
    expect((await repo.getItem("a"))?.name).toBe("Coffee grinder");
  });

  it("upsert replaces in place rather than duplicating", async () => {
    await repo.upsertItem(item({ id: "a", name: "First" }));
    await repo.upsertItem(item({ id: "b", name: "Second" }));
    await repo.upsertItem(item({ id: "a", name: "Renamed" }));

    const rows = await repo.listItems();
    expect(rows).toHaveLength(2);
    // Order is preserved — an edit must not jump the item to the end of the list.
    expect(rows.map((r) => r.id)).toEqual(["a", "b"]);
    expect(rows[0].name).toBe("Renamed");
  });

  it("deletes only the targeted item", async () => {
    await repo.upsertItem(item({ id: "a" }));
    await repo.upsertItem(item({ id: "b" }));
    await repo.deleteItem("a");

    expect((await repo.listItems()).map((r) => r.id)).toEqual(["b"]);
  });

  it("deleting a missing id is a no-op, not an error", async () => {
    await repo.upsertItem(item({ id: "a" }));
    await expect(repo.deleteItem("ghost")).resolves.toBeUndefined();
    expect(await repo.listItems()).toHaveLength(1);
  });
});

describe("locations and wishlist", () => {
  it("round-trip independently of items", async () => {
    await repo.upsertLocation({
      id: "loc1",
      name: "Kitchen",
      parentId: null,
      createdAt: null,
      updatedAt: null,
    });
    await repo.upsertWish({ id: "w1", name: "Kettle", createdAt: null });
    await repo.upsertItem(item({ id: "a" }));

    expect(await repo.listLocations()).toHaveLength(1);
    expect(await repo.listWishlist()).toHaveLength(1);
    expect(await repo.listItems()).toHaveLength(1);

    // Collections must not bleed into each other.
    await repo.deleteItem("a");
    expect(await repo.listLocations()).toHaveLength(1);
    expect(await repo.listWishlist()).toHaveLength(1);
  });
});

describe("settings", () => {
  it("returns defaults before anything is saved", async () => {
    expect(await repo.getSettings()).toEqual(DEFAULT_INVENTORY_SETTINGS);
  });

  it("round-trips and normalizes on the way in", async () => {
    await repo.saveSettings({ defaultCurrency: "GBP", defaultView: "list" });
    const s = await repo.getSettings();
    expect(s.defaultCurrency).toBe("GBP");
    expect(s.defaultView).toBe("list");
  });
});

describe("resilience", () => {
  it("survives a corrupt blob instead of throwing", async () => {
    // A crash on launch is unrecoverable for a user; an empty collection is not.
    const corrupt = createMemoryStore({
      inventoryItems: "{not json",
      inventorySettings: "also not json",
    });
    const r = createLocalRepo(corrupt);

    expect(await r.listItems()).toEqual([]);
    expect(await r.getSettings()).toEqual(DEFAULT_INVENTORY_SETTINGS);
  });

  it("ignores a non-array payload", async () => {
    const wrong = createMemoryStore({ inventoryItems: '{"id":"a"}' });
    expect(await createLocalRepo(wrong).listItems()).toEqual([]);
  });

  it("persists through the store, so a fresh repo sees prior writes", async () => {
    await repo.upsertItem(item({ id: "a", name: "Persisted" }));
    // Same store, new repo instance — proves nothing is held in memory.
    const reopened = createLocalRepo(store);
    expect((await reopened.getItem("a"))?.name).toBe("Persisted");
  });
});
