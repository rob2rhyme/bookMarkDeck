// Pure value / roll-up math for the inventory pillar. No React/Firebase, so it's
// trivially unit-testable (see value.test.ts). `today` is always passed in as a
// YYYY-MM-DD string to keep everything deterministic — never read the clock here.

import type { InventoryItem, InventoryLocation } from "@/features/inventory/lib/types";

/** Days until a YYYY-MM-DD date relative to another. Positive = future. */
export function daysUntil(target: string, today: string): number | null {
  const a = toUTC(target);
  const b = toUTC(today);
  if (a === null || b === null) return null;
  return Math.round((a - b) / 86_400_000);
}

function toUTC(day: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** Per-unit worth: manual estimate first, else purchase price, else 0. */
export function unitValue(item: InventoryItem): number {
  const v = typeof item.value === "number" ? item.value : item.price;
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/** Total worth of an item line (unit value × quantity). */
export function itemValue(item: InventoryItem): number {
  return unitValue(item) * Math.max(1, item.quantity || 1);
}

const live = (items: InventoryItem[]) => items.filter((i) => !i.archived);

export function totalValue(items: InventoryItem[]): number {
  return live(items).reduce((sum, i) => sum + itemValue(i), 0);
}

export function itemCount(items: InventoryItem[]): number {
  return live(items).length;
}

export type Rollup = { key: string; label: string; total: number; count: number };

/** Value grouped by category, biggest first. Uncategorized folds into one row. */
export function valueByCategory(items: InventoryItem[]): Rollup[] {
  const map = new Map<string, Rollup>();
  for (const i of live(items)) {
    const key = i.category?.trim() || "Uncategorized";
    const row = map.get(key) ?? { key, label: key, total: 0, count: 0 };
    row.total += itemValue(i);
    row.count += 1;
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

/** Value grouped by location, biggest first. Missing/absent location → one row. */
export function valueByLocation(
  items: InventoryItem[],
  locations: InventoryLocation[]
): Rollup[] {
  const nameById = new Map(locations.map((l) => [l.id, l.name]));
  const map = new Map<string, Rollup>();
  for (const i of live(items)) {
    const key = i.locationId ?? "__none__";
    const label = (i.locationId && nameById.get(i.locationId)) || "Unassigned";
    const row = map.get(key) ?? { key, label, total: 0, count: 0 };
    row.total += itemValue(i);
    row.count += 1;
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

export type WarrantyState = "none" | "ok" | "soon" | "expired";

/** Warranty status relative to `today`. "soon" = expiring within 30 days. */
export function warrantyState(item: InventoryItem, today: string): WarrantyState {
  if (!item.warrantyExpiry) return "none";
  const d = daysUntil(item.warrantyExpiry, today);
  if (d === null) return "none";
  if (d < 0) return "expired";
  if (d <= 30) return "soon";
  return "ok";
}

export type Attention = {
  warrantyExpired: InventoryItem[];
  warrantySoon: InventoryItem[];
  lentOut: InventoryItem[];
  returnOverdue: InventoryItem[];
};

/**
 * Items that need a look: warranties ending or gone, and things lent out (with
 * an overdue-return sub-bucket). Zero new infra — computed client-side on load.
 */
export function attention(items: InventoryItem[], today: string): Attention {
  const out: Attention = {
    warrantyExpired: [],
    warrantySoon: [],
    lentOut: [],
    returnOverdue: [],
  };
  for (const i of live(items)) {
    const w = warrantyState(i, today);
    if (w === "expired") out.warrantyExpired.push(i);
    else if (w === "soon") out.warrantySoon.push(i);
    if (i.lentTo?.trim()) {
      out.lentOut.push(i);
      const d = i.dueDate ? daysUntil(i.dueDate, today) : null;
      if (d !== null && d < 0) out.returnOverdue.push(i);
    }
  }
  return out;
}

export function attentionCount(a: Attention): number {
  return (
    a.warrantyExpired.length +
    a.warrantySoon.length +
    a.lentOut.length
  );
}

/** Locale money formatting; falls back to a plain number if the code is bad. */
export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}
