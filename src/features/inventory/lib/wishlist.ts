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
 * the product-page link, and the price-comparison inputs (barcode + saved
 * compare-links); leaves everything else to be filled in later.
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
    photos: [],
    lentTo: null,
    lentDate: null,
    dueDate: null,
    createdAt: new Date().toISOString(),
    updatedAt: null,
  };
}
