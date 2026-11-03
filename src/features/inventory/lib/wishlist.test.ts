import { describe, expect, it } from "vitest";

import {
  applyRestock,
  blankWishlistItem,
  wishlistToInventoryItem,
} from "@/features/inventory/lib/wishlist";
import type { InventoryItem, WishlistItem } from "@/features/inventory/lib/types";

describe("blankWishlistItem", () => {
  it("seeds a fresh entry with the given currency", () => {
    const w = blankWishlistItem("EUR");
    expect(w.name).toBe("");
    expect(w.currency).toBe("EUR");
    expect(typeof w.id).toBe("string");
  });
});

describe("wishlistToInventoryItem", () => {
  const base: WishlistItem = {
    id: "w1",
    name: "  Sony A7 IV  ",
    category: "Cameras",
    estPrice: 2100,
    currency: "USD",
    note: "wait for a sale",
    link: { id: "b1", title: "Product page", url: "https://sony.com/a7iv" },
    imageUrl: "https://cdn.example.com/a7iv.jpg",
    createdAt: null,
  };

  it("carries name (trimmed), category, price, note, link, and photo", () => {
    const item = wishlistToInventoryItem(base, "GBP");
    expect(item.name).toBe("Sony A7 IV");
    expect(item.category).toBe("Cameras");
    expect(item.price).toBe(2100);
    expect(item.currency).toBe("USD");
    expect(item.notes).toBe("wait for a sale");
    expect(item.links).toEqual([base.link]);
    expect(item.id).not.toBe("w1"); // a new item id
    expect(item.photos).toHaveLength(1);
    expect(item.photos[0].url).toBe("https://cdn.example.com/a7iv.jpg");
    expect(item.quantity).toBe(1);
  });

  it("falls back to the default currency, empty links, and no photos", () => {
    const item = wishlistToInventoryItem({ id: "w2", name: "Kettle", createdAt: null }, "GBP");
    expect(item.currency).toBe("GBP");
    expect(item.links).toEqual([]);
    expect(item.price).toBeUndefined();
    expect(item.photos).toEqual([]);
  });
});

describe("applyRestock", () => {
  const item = (over: Partial<InventoryItem> = {}) =>
    ({ id: "i1", name: "Shampoo", quantity: 1, restockAt: 1, ...over }) as InventoryItem;
  const wish = (over: Partial<WishlistItem> = {}): WishlistItem => ({
    id: "w1",
    name: "Shampoo",
    restockOf: "i1",
    createdAt: null,
    ...over,
  });

  it("adds one to the item the wish came from", () => {
    expect(applyRestock(wish(), [item()])?.quantity).toBe(2);
    expect(applyRestock(wish(), [item({ quantity: 0 })])?.quantity).toBe(1);
  });

  it("keeps the item's own fields and id", () => {
    const out = applyRestock(wish(), [item({ category: "Care" })]);
    expect(out).toMatchObject({ id: "i1", name: "Shampoo", category: "Care", restockAt: 1 });
  });

  it("is null for an ordinary wish, a missing item, or one let go", () => {
    expect(applyRestock(wish({ restockOf: undefined }), [item()])).toBeNull();
    expect(applyRestock(wish(), [item({ id: "other" })])).toBeNull();
    expect(applyRestock(wish(), [item({ archived: true })])).toBeNull();
    expect(applyRestock(wish(), [item({ releasedDate: "2026-01-01" })])).toBeNull();
  });
});
