// Pure helpers for the wishlist ("want to buy"). No React/Firebase — see
// wishlist.test.ts.

import type {
  InventoryItem,
  ItemLink,
  WishlistItem,
} from "@/features/inventory/lib/types";

export function blankWishlistItem(currency: string): WishlistItem {
  return {
    id: crypto.randomUUID(),
    name: "",
    currency,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Convert a wishlist entry into a real inventory item — used when you buy it
 * ("Got it → My Stuff"). Carries name, category, the estimate as the price,
 * the product-page link, the product photo (as the item's first photo), and
 * the price-comparison inputs (barcode + saved compare-links); leaves
 * everything else to be filled in later.
 */
export function wishlistToInventoryItem(
  w: WishlistItem,
  fallbackCurrency: string
): InventoryItem {
  const links: ItemLink[] = w.link ? [w.link] : [];
  return {
    id: crypto.randomUUID(),
    name: w.name.trim(),
    category: w.category?.trim() || undefined,
    locationId: null,
    tags: [],
    quantity: 1,
    price: typeof w.estPrice === "number" ? w.estPrice : undefined,
    currency: w.currency || fallbackCurrency,
    notes: w.note?.trim() || undefined,
    barcode: w.barcode?.trim() || undefined,
    compareLinks: w.compareLinks?.length ? w.compareLinks : undefined,
    links,
    photos: w.imageUrl
      ? [{ id: crypto.randomUUID(), url: w.imageUrl }]
      : [],
    lentTo: null,
    lentDate: null,
    dueDate: null,
    createdAt: new Date().toISOString(),
    updatedAt: null,
  };
}

/**
 * "Got it" on a wish that came from an item running low: the item you already
 * have, one more in stock — rather than a second copy of it. Null when the wish
 * isn't a restock, or its item is gone or has been let go (then "Got it" makes a
 * new item as usual). Clears nothing else: the item keeps its own fields.
 */
export function applyRestock(
  w: WishlistItem,
  items: InventoryItem[],
  count = 1
): InventoryItem | null {
  if (!w.restockOf) return null;
  const item = items.find((i) => i.id === w.restockOf);
  if (!item || item.archived || item.releasedDate) return null;
  return { ...item, quantity: Math.max(0, item.quantity || 0) + Math.max(1, count) };
}
