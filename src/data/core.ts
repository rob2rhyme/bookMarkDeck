// Pure state helpers behind the inventory store — kept React-free so the
// store's behaviour is unit-testable without a device.

import type { InventoryItem, InventoryLocation } from "@/lib/types";

export function makeId(): string {
  return (
    Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
  );
}

export function blankItem(now: string): InventoryItem {
  return {
    id: makeId(),
    name: "",
    locationId: null,
    tags: [],
    quantity: 1,
    links: [],
    photos: [],
    lentTo: null,
    lentDate: null,
    dueDate: null,
    createdAt: now,
    updatedAt: null,
  };
}

export function upsertById<T extends { id: string }>(rows: T[], row: T): T[] {
  const i = rows.findIndex((r) => r.id === row.id);
  if (i === -1) return [row, ...rows];
  const next = rows.slice();
  next[i] = row;
  return next;
}

export function removeById<T extends { id: string }>(
  rows: T[],
  id: string
): { rows: T[]; removed: T | null } {
  const i = rows.findIndex((r) => r.id === id);
  if (i === -1) return { rows, removed: null };
  const next = rows.slice();
  const [removed] = next.splice(i, 1);
  return { rows: next, removed };
}

/** Restore a removed row at its original position when possible. */
export function restoreAt<T extends { id: string }>(
  rows: T[],
  row: T,
  index: number
): T[] {
  if (rows.some((r) => r.id === row.id)) return rows;
  const next = rows.slice();
  next.splice(Math.min(Math.max(index, 0), next.length), 0, row);
  return next;
}

export function newestFirst<T extends { createdAt: string | null }>(
  rows: T[]
): T[] {
  return rows
    .slice()
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}

export function locationName(
  locations: InventoryLocation[],
  id: string | null | undefined
): string {
  if (!id) return "";
  return locations.find((l) => l.id === id)?.name ?? "";
}
