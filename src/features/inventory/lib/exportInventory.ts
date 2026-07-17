// Build + parse exportable inventory data (CSV for spreadsheets, JSON for a
// full-fidelity, re-importable backup). Pure — no React/Firebase — mirroring
// exportFocus.ts, so it's easy to test and reason about.

import { toCsv } from "@/utils/download";
import {
  CONDITIONS,
  DEFAULT_INVENTORY_SETTINGS,
  ITEM_STATUSES,
  normalizeSettings,
  type InventoryBackup,
  type InventoryItem,
  type InventoryLocation,
  type ItemActivity,
  type ItemActivityType,
  type ItemCondition,
  type ItemDisposition,
  type ItemKind,
  type ItemOrigin,
  type ItemStatus,
  type ReadStatus,
} from "@/features/inventory/lib/types";

const ITEM_COLUMNS = [
  "name",
  "category",
  "location",
  "quantity",
  "value",
  "price",
  "tax_rate",
  "currency",
  "purchase_date",
  "warranty_expiry",
  "warranty_cost",
  "warranty_years",
  "maintenance_date",
  "condition",
  "in_box",
  "status",
  "origin",
  "borrowed_from",
  "return_by",
  "kind",
  "author",
  "read_status",
  "use_by",
  "opened_date",
  "pao_months",
  "size",
  "manufacturer",
  "model",
  "serial",
  "barcode",
  "retailer",
  "store_url",
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
      tax_rate: i.taxRate ?? "",
      currency: i.currency ?? "",
      purchase_date: i.purchaseDate ?? "",
      warranty_expiry: i.warrantyExpiry ?? "",
      warranty_cost: i.warrantyCost ?? "",
      warranty_years: i.warrantyYears ?? "",
      maintenance_date: i.maintenanceDate ?? "",
      condition: i.condition ?? "",
      in_box: i.inBox === true ? "yes" : i.inBox === false ? "no" : "",
      status: i.status ?? "",
      origin: i.origin ?? "",
      borrowed_from: i.borrowedFrom ?? "",
      return_by: i.borrowReturnBy ?? "",
      kind: i.kind ?? "",
      author: i.author ?? "",
      read_status: i.readStatus ?? "",
      use_by: i.useBy ?? "",
      opened_date: i.openedDate ?? "",
      pao_months: i.paoMonths ?? "",
      size: i.size ?? "",
      manufacturer: i.manufacturer ?? "",
      model: i.model ?? "",
      serial: i.serial ?? "",
      barcode: i.barcode ?? "",
      retailer: i.retailer ?? "",
      store_url: i.storeUrl ?? "",
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

const CONDITION_SET = new Set<ItemCondition>(CONDITIONS.map((c) => c.id));
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

const STATUS_SET = new Set<ItemStatus>(ITEM_STATUSES.map((s) => s.id));
const asOrigin = (v: unknown): ItemOrigin | undefined =>
  v === "borrowed" || v === "rented" ? v : undefined;
const asKind = (v: unknown): ItemKind | undefined =>
  v === "book" || v === "food" || v === "selfcare" || v === "clothing" || v === "tool"
    ? v
    : undefined;
const asRead = (v: unknown): ReadStatus | undefined =>
  v === "unread" || v === "reading" || v === "read" ? v : undefined;
const asStatus = (v: unknown): ItemStatus | undefined =>
  typeof v === "string" && STATUS_SET.has(v as ItemStatus)
    ? (v as ItemStatus)
    : undefined;

const ACTIVITY_TYPES = new Set<ItemActivityType>([
  "acquired",
  "used",
  "lent",
  "returned",
  "refunded",
  "relocated",
  "misplaced",
  "lost",
  "found",
  "note",
]);

function coerceActivity(raw: unknown): ItemActivity[] | undefined {
  const events = (Array.isArray(raw) ? raw : [])
    .map((e): ItemActivity | null => {
      const r = rec(e);
      if (!ACTIVITY_TYPES.has(r.type as ItemActivityType)) return null;
      if (typeof r.at !== "string") return null;
      return pruneUndefined({
        id: typeof r.id === "string" ? r.id : r.at,
        type: r.type as ItemActivityType,
        at: r.at,
        to: str(r.to).trim() || undefined,
        fromLoc: str(r.fromLoc).trim() || undefined,
        toLoc: str(r.toLoc).trim() || undefined,
        condition: asCondition(r.condition),
        note: str(r.note).trim() || undefined,
      }) as ItemActivity;
    })
    .filter((e): e is ItemActivity => e !== null);
  return events.length ? events : undefined;
}

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

function coercePriceLinks(raw: unknown): InventoryItem["compareLinks"] {
  const links = (Array.isArray(raw) ? raw : [])
    .map((l) => {
      const r = rec(l);
      if (typeof r.url !== "string" || !r.url.trim()) return null;
      return {
        id: typeof r.id === "string" ? r.id : r.url,
        store: str(r.store).trim(),
        url: r.url.trim(),
        price: numOrUndef(r.price),
        currency: str(r.currency).trim() || undefined,
      };
    })
    .filter((l): l is NonNullable<typeof l> => l !== null);
  return links.length ? links : undefined;
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
    kind: asKind(r.kind),
    author: str(r.author).trim() || undefined,
    readStatus: asRead(r.readStatus),
    useBy: isDay(r.useBy) ? r.useBy : undefined,
    openedDate: isDay(r.openedDate) ? r.openedDate : undefined,
    paoMonths: numOrUndef(r.paoMonths),
    size: str(r.size).trim() || undefined,
    tags: Array.isArray(r.tags) ? r.tags.filter((t): t is string => typeof t === "string") : [],
    quantity: Math.max(1, Math.round(numOrUndef(r.quantity) ?? 1)),
    purchaseDate: isDay(r.purchaseDate) ? r.purchaseDate : undefined,
    price: numOrUndef(r.price),
    taxRate: numOrUndef(r.taxRate),
    currency: str(r.currency).trim() || undefined,
    retailer: str(r.retailer).trim() || undefined,
    storeUrl: str(r.storeUrl).trim() || undefined,
    compareLinks: coercePriceLinks(r.compareLinks),
    manufacturer: str(r.manufacturer).trim() || undefined,
    model: str(r.model).trim() || undefined,
    serial: str(r.serial).trim() || undefined,
    barcode: str(r.barcode).trim() || undefined,
    warrantyExpiry: isDay(r.warrantyExpiry) ? r.warrantyExpiry : undefined,
    warrantyCost: numOrUndef(r.warrantyCost),
    warrantyYears: numOrUndef(r.warrantyYears),
    maintenanceDate: isDay(r.maintenanceDate) ? r.maintenanceDate : undefined,
    condition: asCondition(r.condition),
    inBox: typeof r.inBox === "boolean" ? r.inBox : undefined,
    status: asStatus(r.status),
    origin: asOrigin(r.origin),
    borrowedFrom: str(r.borrowedFrom).trim() || undefined,
    borrowReturnBy: isDay(r.borrowReturnBy) ? r.borrowReturnBy : undefined,
    activity: coerceActivity(r.activity),
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
