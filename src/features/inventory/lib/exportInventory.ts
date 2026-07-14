// Build + parse exportable inventory data (CSV for spreadsheets, JSON for a
// full-fidelity, re-importable backup). Pure — no React/Firebase — mirroring
// exportFocus.ts, so it's easy to test and reason about.

import { toCsv } from "@/utils/download";
import {
  DEFAULT_INVENTORY_SETTINGS,
  normalizeSettings,
  type InventoryBackup,
  type InventoryItem,
  type InventoryLocation,
  type ItemCondition,
  type ItemDisposition,
} from "@/features/inventory/lib/types";

const ITEM_COLUMNS = [
  "name",
  "category",
  "location",
  "quantity",
  "value",
  "price",
  "currency",
  "purchase_date",
  "warranty_expiry",
  "maintenance_date",
  "condition",
  "manufacturer",
  "model",
  "serial",
  "barcode",
  "retailer",
  "lent_to",
  "due_date",
  "project",
  "collection",
  "disposition",
  "released_date",
  "tags",
  "links",
  "notes",
  "description",
  "lent_date",
  "archived",
];

export function itemsToCsv(
  items: InventoryItem[],
  locationNameById: Record<string, string>
): string {
  const rows = [...items]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((i) => ({
      name: i.name,
      category: i.category ?? "",
      location: i.locationId ? locationNameById[i.locationId] ?? "" : "",
      quantity: i.quantity,
      value: i.value ?? "",
      price: i.price ?? "",
      currency: i.currency ?? "",
      purchase_date: i.purchaseDate ?? "",
      warranty_expiry: i.warrantyExpiry ?? "",
      maintenance_date: i.maintenanceDate ?? "",
      condition: i.condition ?? "",
      manufacturer: i.manufacturer ?? "",
      model: i.model ?? "",
      serial: i.serial ?? "",
      barcode: i.barcode ?? "",
      retailer: i.retailer ?? "",
      lent_to: i.lentTo ?? "",
      due_date: i.dueDate ?? "",
      project: i.projectName ?? "",
      collection: i.collection ?? "",
      disposition: i.disposition ?? "",
      released_date: i.releasedDate ?? "",
      tags: i.tags.join("; "),
      links: (i.links ?? []).map((l) => l.url).join("; "),
      notes: i.notes ?? "",
      description: i.description ?? "",
      lent_date: i.lentDate ?? "",
      archived: i.archived ? "yes" : "",
    }));
  return toCsv(ITEM_COLUMNS, rows);
}

export function inventoryToJson(data: InventoryBackup, exportedAt: string): string {
  return JSON.stringify({ exportedAt, ...data }, null, 2);
}

/* --------------------------------------------------------------- import --- */

const isDay = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const strOrNull = (v: unknown): string | null =>
  typeof v === "string" ? v : null;
const numOrUndef = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;
const rec = (raw: unknown): Record<string, unknown> =>
  (raw ?? {}) as Record<string, unknown>;

const CONDITION_SET = new Set<ItemCondition>(["new", "good", "fair", "poor"]);
const asCondition = (v: unknown): ItemCondition | undefined =>
  typeof v === "string" && CONDITION_SET.has(v as ItemCondition)
    ? (v as ItemCondition)
    : undefined;

const DISPOSITION_SET = new Set<ItemDisposition>([
  "donate",
  "sell",
  "giveaway",
  "trash",
]);
const asDisposition = (v: unknown): ItemDisposition | undefined =>
  typeof v === "string" && DISPOSITION_SET.has(v as ItemDisposition)
    ? (v as ItemDisposition)
    : undefined;

function pruneUndefined<T extends Record<string, unknown>>(o: T): T {
  for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k];
  return o;
}

function coerceLinks(raw: unknown): InventoryItem["links"] {
  return (Array.isArray(raw) ? raw : [])
    .map((l) => {
      const r = rec(l);
      if (typeof r.url !== "string" || !r.url.trim()) return null;
      return {
        id: typeof r.id === "string" ? r.id : r.url,
        title: typeof r.title === "string" && r.title.trim() ? r.title : r.url,
        url: r.url,
      };
    })
    .filter((l): l is NonNullable<typeof l> => l !== null);
}

function coercePhotos(raw: unknown): InventoryItem["photos"] {
  return (Array.isArray(raw) ? raw : [])
    .map((p) => {
      const r = rec(p);
      if (typeof r.url !== "string" || !r.url.trim()) return null;
      return pruneUndefined({
        id: typeof r.id === "string" ? r.id : crypto.randomUUID(),
        url: r.url,
        path: typeof r.path === "string" ? r.path : undefined,
        w: numOrUndef(r.w),
        h: numOrUndef(r.h),
      });
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);
}

function coerceItem(raw: unknown): InventoryItem | null {
  const r = rec(raw);
  if (typeof r.id !== "string" || !str(r.name).trim()) return null;
  return pruneUndefined({
    id: r.id,
    name: str(r.name),
    description: str(r.description).trim() || undefined,
    locationId: typeof r.locationId === "string" ? r.locationId : null,
    category: str(r.category).trim() || undefined,
    tags: Array.isArray(r.tags) ? r.tags.filter((t): t is string => typeof t === "string") : [],
    quantity: Math.max(1, Math.round(numOrUndef(r.quantity) ?? 1)),
    purchaseDate: isDay(r.purchaseDate) ? r.purchaseDate : undefined,
    price: numOrUndef(r.price),
    currency: str(r.currency).trim() || undefined,
    retailer: str(r.retailer).trim() || undefined,
    manufacturer: str(r.manufacturer).trim() || undefined,
    model: str(r.model).trim() || undefined,
    serial: str(r.serial).trim() || undefined,
    barcode: str(r.barcode).trim() || undefined,
    warrantyExpiry: isDay(r.warrantyExpiry) ? r.warrantyExpiry : undefined,
    maintenanceDate: isDay(r.maintenanceDate) ? r.maintenanceDate : undefined,
    condition: asCondition(r.condition),
    value: numOrUndef(r.value),
    notes: str(r.notes).trim() || undefined,
    lentTo: str(r.lentTo).trim() || null,
    lentDate: isDay(r.lentDate) ? r.lentDate : null,
    dueDate: isDay(r.dueDate) ? r.dueDate : null,
    projectName: str(r.projectName).trim() || undefined,
    collection: str(r.collection).trim() || undefined,
    disposition: asDisposition(r.disposition),
    releasedDate: isDay(r.releasedDate) ? r.releasedDate : null,
    links: coerceLinks(r.links),
    photos: coercePhotos(r.photos),
    archived: Boolean(r.archived),
    createdAt: strOrNull(r.createdAt),
    updatedAt: strOrNull(r.updatedAt),
  });
}

function coerceLocation(raw: unknown): InventoryLocation | null {
  const r = rec(raw);
  if (typeof r.id !== "string" || !str(r.name).trim()) return null;
  return {
    id: r.id,
    name: str(r.name),
    parentId: typeof r.parentId === "string" ? r.parentId : null,
    sortOrder: numOrUndef(r.sortOrder),
    createdAt: strOrNull(r.createdAt),
    updatedAt: strOrNull(r.updatedAt),
  };
}

function pick<T>(v: unknown, fn: (x: unknown) => T | null): T[] {
  return (Array.isArray(v) ? v : []).map(fn).filter((x): x is T => x !== null);
}

/**
 * Parse a previously-exported inventory JSON back into a validated backup.
 * Returns null when the text isn't valid JSON or carries no recognizable
 * records. Every record is coerced, so malformed ones are dropped.
 */
export function inventoryFromJson(text: string): InventoryBackup | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const backup: InventoryBackup = {
    items: pick(d.items, coerceItem),
    locations: pick(d.locations, coerceLocation),
    settings: d.settings ? normalizeSettings(d.settings) : DEFAULT_INVENTORY_SETTINGS,
  };
  if (backup.items.length + backup.locations.length === 0) return null;
  return backup;
}

export function backupCount(b: InventoryBackup): number {
  return b.items.length + b.locations.length;
}
