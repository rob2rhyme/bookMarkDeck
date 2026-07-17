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

/** Default sales-tax rate (%) prefilled for a new item. */
export const DEFAULT_TAX_RATE = 6;

const posNum = (v: unknown): number =>
  typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0;

/** Sales tax for an item line: rate% on (price × qty + warranty-plan cost).
 *  0 when nothing was paid or no positive rate. Kept separate from "value"
 *  (current worth) — this is a purchase-cost concept. */
export function taxAmount(item: InventoryItem): number {
  const base =
    posNum(item.price) * Math.max(1, item.quantity || 1) + posNum(item.warrantyCost);
  const rate = posNum(item.taxRate);
  if (base <= 0 || rate <= 0) return 0;
  return base * (rate / 100);
}

/** Total paid for an item line: price × qty + warranty plan + sales tax. */
export function paidWithTax(item: InventoryItem): number {
  return (
    posNum(item.price) * Math.max(1, item.quantity || 1) +
    posNum(item.warrantyCost) +
    taxAmount(item)
  );
}

/** Day + N years (fractional ok — rounded to whole months), clamped to real
 *  month ends (Jan 31 + 1mo → Feb 28/29). For deriving a warranty expiry from
 *  a plan length. Null for bad input. */
export function shiftYears(day: string, years: number): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m || !Number.isFinite(years) || years <= 0) return null;
  const months = Math.round(years * 12);
  if (months <= 0) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const dayOfMonth = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + months);
  if (d.getUTCDate() !== dayOfMonth) d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}

// "Live" for money math: not archived and not returned to the store — a
// refunded item keeps its record but drops out of every total and reminder.
const live = (items: InventoryItem[]) =>
  items.filter((i) => !i.archived && i.status !== "returned");

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

export type MaintenanceState = "none" | "ok" | "soon" | "overdue";

/** Next-maintenance status relative to `today`. "soon" = due within 30 days. */
export function maintenanceState(item: InventoryItem, today: string): MaintenanceState {
  if (!item.maintenanceDate) return "none";
  const d = daysUntil(item.maintenanceDate, today);
  if (d === null) return "none";
  if (d < 0) return "overdue";
  if (d <= 30) return "soon";
  return "ok";
}

export type Attention = {
  warrantyExpired: InventoryItem[];
  warrantySoon: InventoryItem[];
  maintenanceOverdue: InventoryItem[];
  maintenanceSoon: InventoryItem[];
  lentOut: InventoryItem[];
  returnOverdue: InventoryItem[];
};

/**
 * Items that need a look: warranties ending or gone, upkeep due or coming up,
 * and things lent out (with an overdue-return sub-bucket). Zero new infra —
 * computed client-side on load.
 */
export function attention(items: InventoryItem[], today: string): Attention {
  const out: Attention = {
    warrantyExpired: [],
    warrantySoon: [],
    maintenanceOverdue: [],
    maintenanceSoon: [],
    lentOut: [],
    returnOverdue: [],
  };
  for (const i of live(items)) {
    const w = warrantyState(i, today);
    if (w === "expired") out.warrantyExpired.push(i);
    else if (w === "soon") out.warrantySoon.push(i);
    const m = maintenanceState(i, today);
    if (m === "overdue") out.maintenanceOverdue.push(i);
    else if (m === "soon") out.maintenanceSoon.push(i);
    if (i.lentTo?.trim()) {
      out.lentOut.push(i);
      const d = i.dueDate ? daysUntil(i.dueDate, today) : null;
      if (d !== null && d < 0) out.returnOverdue.push(i);
    }
  }
  return out;
}

/** Everything the Attention panel shows (returnOverdue is a subset of lentOut). */
export function attentionCount(a: Attention): number {
  return (
    a.warrantyExpired.length +
    a.warrantySoon.length +
    a.maintenanceOverdue.length +
    a.maintenanceSoon.length +
    a.lentOut.length
  );
}

/**
 * Time-based reminders worth a nudge — warranties ending/ended, upkeep
 * due/soon, and overdue returns (but not every open loan). Drives the nav badge.
 */
export function reminderCount(a: Attention): number {
  return (
    a.warrantyExpired.length +
    a.warrantySoon.length +
    a.maintenanceOverdue.length +
    a.maintenanceSoon.length +
    a.returnOverdue.length
  );
}

/** Reminder count straight from items — convenience for the nav badge hook. */
export function reminderCountFor(items: InventoryItem[], today: string): number {
  return reminderCount(attention(items, today));
}

// ── Depreciation / resale estimate ──────────────────────────────────────────
// A deliberately simple, honest heuristic: straight-line decline from the
// purchase price to a salvage floor over a category-typical useful life. It is
// an *estimate* of resale worth, kept separate from the catalog "total value"
// (which uses your manual estimate or purchase price). Pure + unit-tested.

export type DepreciationParams = {
  /** Years from new until value reaches the salvage floor. */
  lifeYears: number;
  /** Residual fraction of the price the item never drops below (0–1). */
  salvageRate: number;
};

export const DEFAULT_DEPRECIATION: DepreciationParams = {
  lifeYears: 7,
  salvageRate: 0.1,
};

// Keyword → typical life/salvage. First match wins; order most-specific first.
const DEPRECIATION_TABLE: { test: RegExp; params: DepreciationParams }[] = [
  { test: /phone|laptop|computer|tablet|camera|tv|monitor|console|electronic|gadget/, params: { lifeYears: 4, salvageRate: 0.05 } },
  { test: /appliance|kitchen|fridge|washer|dryer|microwave|vacuum/, params: { lifeYears: 8, salvageRate: 0.05 } },
  { test: /tool|drill|saw|power/, params: { lifeYears: 10, salvageRate: 0.15 } },
  { test: /car|vehicle|bike|bicycle|scooter/, params: { lifeYears: 8, salvageRate: 0.1 } },
  { test: /furniture|sofa|couch|desk|chair|table|bed/, params: { lifeYears: 12, salvageRate: 0.15 } },
  { test: /jewel|watch|gold|art|collectib/, params: { lifeYears: 25, salvageRate: 0.6 } },
];

/** Typical depreciation params for a (free-text) category; default otherwise. */
export function depreciationFor(category?: string): DepreciationParams {
  const c = (category ?? "").toLowerCase();
  if (c) {
    for (const row of DEPRECIATION_TABLE) if (row.test.test(c)) return row.params;
  }
  return DEFAULT_DEPRECIATION;
}

/** Fractional years between two YYYY-MM-DD dates (0 if unknown or negative). */
export function yearsBetween(from: string, today: string): number {
  const d = daysUntil(today, from); // today - from, in days
  if (d === null) return 0;
  return Math.max(0, d / 365.25);
}

/** Straight-line price → salvage over `lifeYears`, clamped. `ageYears` ≥ 0. */
export function straightLineValue(
  price: number,
  ageYears: number,
  params: DepreciationParams = DEFAULT_DEPRECIATION
): number {
  if (!(price > 0)) return 0;
  const frac = Math.min(1, Math.max(0, ageYears / params.lifeYears));
  return price * (1 - (1 - params.salvageRate) * frac);
}

/**
 * Per-unit estimated resale value now: a manual `value` wins (your own
 * estimate); otherwise depreciate the purchase `price` by age; with a price but
 * no purchase date, fall back to the price; nothing priced → 0.
 */
export function unitResale(item: InventoryItem, today: string): number {
  if (typeof item.value === "number" && Number.isFinite(item.value)) return item.value;
  const price = typeof item.price === "number" && Number.isFinite(item.price) ? item.price : 0;
  if (price <= 0) return 0;
  if (!item.purchaseDate) return price;
  return straightLineValue(price, yearsBetween(item.purchaseDate, today), depreciationFor(item.category));
}

/** Estimated resale of an item line (unit resale × quantity). */
export function itemResale(item: InventoryItem, today: string): number {
  return unitResale(item, today) * Math.max(1, item.quantity || 1);
}

/** Total estimated resale now across live items. */
export function totalResale(items: InventoryItem[], today: string): number {
  return live(items).reduce((sum, i) => sum + itemResale(i, today), 0);
}

/** Total originally paid (purchase price × qty + sales tax) across live items. */
export function totalPaid(items: InventoryItem[]): number {
  return live(items).reduce((sum, i) => sum + paidWithTax(i), 0);
}

export type CurvePoint = { year: number; total: number };

/**
 * Portfolio resale projected forward `years` (0…years), summing each live
 * item's straight-line value at that future age. Manual-valued and undated
 * items hold flat (no model to decline them). Monotonically non-increasing.
 */
export function resaleCurve(
  items: InventoryItem[],
  today: string,
  years = 5
): CurvePoint[] {
  const live_ = live(items);
  const points: CurvePoint[] = [];
  for (let y = 0; y <= years; y++) {
    let total = 0;
    for (const i of live_) {
      const qty = Math.max(1, i.quantity || 1);
      if (typeof i.value === "number" && Number.isFinite(i.value)) {
        total += i.value * qty; // manual estimate holds flat
        continue;
      }
      const price = typeof i.price === "number" && Number.isFinite(i.price) ? i.price : 0;
      if (price <= 0) continue;
      if (!i.purchaseDate) {
        total += price * qty; // undated: can't age it
        continue;
      }
      const age = yearsBetween(i.purchaseDate, today) + y;
      total += straightLineValue(price, age, depreciationFor(i.category)) * qty;
    }
    points.push({ year: y, total });
  }
  return points;
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
