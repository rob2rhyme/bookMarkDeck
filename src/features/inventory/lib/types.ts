// Types for the "My Stuff" home-inventory feature (INVENTORY-ROADMAP.md, Phase 1).
// Pure type declarations + a couple of consts — no React/Firebase — mirroring
// the focus feature's lib/types.ts. Kept fully under src/features/inventory/ so
// the pillar stays removable and never touches bookmark data.

export type ItemCondition = "new" | "good" | "fair" | "poor";

export const CONDITIONS: { id: ItemCondition; label: string }[] = [
  { id: "new", label: "New" },
  { id: "good", label: "Good" },
  { id: "fair", label: "Fair" },
  { id: "poor", label: "Poor" },
];

/** Declutter intent — where an item is headed when you're letting it go.
 *  Undefined = keeping it (the default). */
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
  currency?: string;
  retailer?: string;
  manufacturer?: string;
  model?: string;
  serial?: string;
  barcode?: string; // UPC/EAN/other captured code (product id; no lookup in P1)
  warrantyExpiry?: string; // YYYY-MM-DD → surfaces in the Attention panel
  maintenanceDate?: string; // YYYY-MM-DD → next service/upkeep; surfaces in Attention
  condition?: ItemCondition;
  value?: number; // manual current-value estimate (per unit)
  notes?: string;
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

export type InventoryView = "grid" | "list";

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
    defaultView: r.defaultView === "list" ? "list" : "grid",
  };
}

/** Full-fidelity backup, re-importable. */
export type InventoryBackup = {
  items: InventoryItem[];
  locations: InventoryLocation[];
  settings: InventorySettings;
};
