import { describe, expect, it } from "vitest";

import {
  blankWishlistItem,
  wishlistToInventoryItem,
} from "@/features/inventory/lib/wishlist";
import type { WishlistItem } from "@/features/inventory/lib/types";

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
    createdAt: null,
  };

  it("carries name (trimmed), category, price, note, and the link", () => {
    const item = wishlistToInventoryItem(base, "GBP");
    expect(item.name).toBe("Sony A7 IV");
    expect(item.category).toBe("Cameras");
    expect(item.price).toBe(2100);
    expect(item.currency).toBe("USD");
    expect(item.notes).toBe("wait for a sale");
    expect(item.links).toEqual([base.link]);
    expect(item.id).not.toBe("w1"); // a new item id
    expect(item.photos).toEqual([]);
    expect(item.quantity).toBe(1);
  });

  it("falls back to the default currency and empty links", () => {
    const item = wishlistToInventoryItem({ id: "w2", name: "Kettle", createdAt: null }, "GBP");
    expect(item.currency).toBe("GBP");
    expect(item.links).toEqual([]);
    expect(item.price).toBeUndefined();
  });
});
