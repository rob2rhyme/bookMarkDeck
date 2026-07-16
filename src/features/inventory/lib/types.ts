// Types for the "My Stuff" home-inventory feature (INVENTORY-ROADMAP.md, Phase 1).
// Pure type declarations + a couple of consts — no React/Firebase — mirroring
// the focus feature's lib/types.ts. Kept fully under src/features/inventory/ so
// the pillar stays removable and never touches bookmark data.

export type ItemCondition = "new" | "open-box" | "good" | "fair" | "poor";

export const CONDITIONS: { id: ItemCondition; label: string }[] = [
  { id: "new", label: "New" },
  { id: "open-box", label: "Open box" },
  { id: "good", label: "Good" },
  { id: "fair", label: "Fair" },
  { id: "poor", label: "Poor" },
];

/** Declutter intent — where an item is headed when you're letting it go.
 *  Undefined = keeping it (the default). */
/** Where an item is right now. undefined = "have" (the default). */
export type ItemStatus = "have" | "lent" | "misplaced" | "lost";

export const ITEM_STATUSES: { id: ItemStatus; label: string; icon: string }[] = [
  { id: "have", label: "Have it", icon: "✅" },
  { id: "lent", label: "Lent out", icon: "🤝" },
  { id: "misplaced", label: "Misplaced", icon: "🫥" },
  { id: "lost", label: "Lost", icon: "🚫" },
];

/** A single event in an item's life — the raw record the history + trending
 *  analyses are computed from. Appended to `activity[]` on the item. */
export type ItemActivityType =
  | "acquired"
  | "used"
  | "lent"
  | "returned"
  | "relocated"
  | "misplaced"
  | "lost"
  | "found"
  | "note";

export type ItemActivity = {
  id: string;
  type: ItemActivityType;
  at: string; // ISO timestamp
  to?: string; // person an item was lent to
  fromLoc?: string; // location name (snapshot) an item moved from
  toLoc?: string; // location name (snapshot) an item moved to
  condition?: ItemCondition; // condition captured at lend / return
  note?: string;
};

export type ItemDisposition = "donate" | "sell" | "giveaway" | "trash";

export const DISPOSITIONS: { id: ItemDisposition; label: string }[] = [
  { id: "donate", label: "Donate" },
  { id: "sell", label: "Sell" },
  { id: "giveaway", label: "Give away" },
  { id: "trash", label: "Toss" },
];

/**
 * A photo reference. In Phase 1 (pre-Storage) `url` holds a direct link the user
 * pasted; once Firebase Storage lands (Blaze-gated), `path` will hold the object
 * path and `url` will cache the resolved download URL. The upload + compression
 * pipeline is deliberately deferred — the shape is ready for it.
 */
export type ItemPhoto = {
  id: string;
  url: string;
  path?: string;
  w?: number;
  h?: number;
};

/**
 * A link from an item to its online life — a snapshot of a bookmark from the
 * user's library (`id` is the bookmark id). Denormalized title/url so the item
 * still renders if the bookmark is later edited or removed. Read-only toward
 * bookmark data — the inventory feature never writes bookmarks.
 */
export type ItemLink = {
  id: string;
  title: string;
  url: string;
};

/**
 * A competitor store link the user saved to price-check an item — the *manual*
 * side of price comparison. When a live price API (UPCitemdb paid tier, matched
 * by barcode) returns offers, those take precedence and these are bypassed;
 * otherwise these saved links are what the comparison shows. `price` is the
 * last-known price the user typed (optional — a bare link still compares).
 */
export type PriceLink = {
  id: string;
  store: string;
  url: string;
  price?: number;
  currency?: string;
};

export type InventoryItem = {
  id: string;
  name: string;
  description?: string;
  locationId: string | null;
  category?: string;
  tags: string[];
  quantity: number;
  purchaseDate?: string; // YYYY-MM-DD
  price?: number;
  taxRate?: number; // sales-tax % applied to price (e.g. 6 → 6%)
  currency?: string;
  retailer?: string;
  storeUrl?: string; // where to (re)buy it — the item's product/store page
  compareLinks?: PriceLink[]; // competitor store links for price comparison
  manufacturer?: string;
  model?: string;
  serial?: string;
  barcode?: string; // UPC/EAN/other captured code (product id; no lookup in P1)
  warrantyExpiry?: string; // YYYY-MM-DD → surfaces in the Attention panel
  maintenanceDate?: string; // YYYY-MM-DD → next service/upkeep; surfaces in Attention
  condition?: ItemCondition;
  // Whether the item is in its original box/packaging. undefined = unspecified;
  // the item's `locationId` records where it lives either way (the box, if
  // boxed; the loose item, if not).
  inBox?: boolean;
  value?: number; // manual current-value estimate (per unit)
  notes?: string;
  status?: ItemStatus; // where it is now (undefined = have)
  activity?: ItemActivity[]; // life history — drives history + trending
  lentTo?: string | null;
  lentDate?: string | null; // YYYY-MM-DD
  dueDate?: string | null; // YYYY-MM-DD (return-by for a lent item)
  disposition?: ItemDisposition; // declutter intent (undefined = keeping it)
  releasedDate?: string | null; // YYYY-MM-DD it was actually let go (declutter signal)
  links: ItemLink[]; // bookmarks attached to this item (manual, product page, …)
  projectName?: string; // a Focus project label this item belongs to ("" = none)
  collection?: string; // a kit/collection this item is part of ("" = none)
  photos: ItemPhoto[];
  archived?: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

export type ItemDocKind = "receipt" | "manual" | "warranty" | "photo" | "other";

export const DOC_KINDS: { id: ItemDocKind; label: string }[] = [
  { id: "receipt", label: "Receipt" },
  { id: "manual", label: "Manual" },
  { id: "warranty", label: "Warranty" },
  { id: "photo", label: "Photo" },
  { id: "other", label: "Other" },
];

/**
 * An attachment (receipt, manual, warranty card, …) for an item. Stored in its
 * own subcollection (`inventoryDocs`) keyed by `itemId`, NOT on the item doc —
 * so several compressed images never bloat the item or slow the item list; they
 * load only when you open the item. `data` is the display URL — the R2 public
 * URL when uploaded (`path` holds the object key), else a compressed image
 * data: URL fallback (same dual scheme as photos).
 */
export type ItemDoc = {
  id: string;
  itemId: string;
  name: string;
  kind: ItemDocKind;
  data: string; // display URL: R2 public URL or data: URL fallback
  path?: string; // R2 object key when uploaded
  w?: number;
  h?: number;
  createdAt: string | null;
};

/**
 * Nestable storage location — same shape family as src/types/folder.ts, kept
 * separate (its own subcollection) so the feature is removable and never reuses
 * bookmark folders.
 */
export type InventoryLocation = {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder?: number;
  createdAt: string | null;
  updatedAt: string | null;
};

/**
 * A "want to buy" entry — its own list, kept separate from owned items. Ties the
 * two on-brand connections: an optional `link` (the product-page bookmark) and,
 * via the duplicate guard, a nudge when you may already own something like it.
 * Stored in `users/{uid}/inventoryWishlist/{id}`.
 */
export type WishlistItem = {
  id: string;
  name: string;
  note?: string;
  estPrice?: number;
  currency?: string;
  category?: string;
  link?: ItemLink; // product page / where to buy
  barcode?: string; // captured at scan time — powers live price comparison
  compareLinks?: PriceLink[]; // competitor store links, same as items
  createdAt: string | null;
};

export type InventoryView = "grid" | "list" | "shelf";

export type InventorySettings = {
  defaultCurrency: string;
  defaultView: InventoryView;
};

export const DEFAULT_INVENTORY_SETTINGS: InventorySettings = {
  defaultCurrency: "USD",
  defaultView: "grid",
};

export function normalizeSettings(raw: unknown): InventorySettings {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    defaultCurrency:
      typeof r.defaultCurrency === "string" && r.defaultCurrency.trim()
        ? r.defaultCurrency
        : DEFAULT_INVENTORY_SETTINGS.defaultCurrency,
    defaultView:
      r.defaultView === "list" || r.defaultView === "shelf"
        ? r.defaultView
        : "grid",
  };
}

/** Full-fidelity backup, re-importable. */
export type InventoryBackup = {
  items: InventoryItem[];
  locations: InventoryLocation[];
  settings: InventorySettings;
};
