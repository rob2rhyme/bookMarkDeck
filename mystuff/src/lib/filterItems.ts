// Item search + ordering.
//
// Ported from the web app, where it lived as an untested `matches()` helper
// buried in a 1,200-line dashboard component. Same matching rules, now pure and
// covered by tests — one of the defects the port deliberately fixes rather than
// inherits.

import type { InventoryItem } from "./types";

/**
 * Free-text match across every field a person might search by.
 *
 * `locationText` is passed in rather than looked up, because an item stores a
 * location *id* and this module stays pure — but "garage" is one of the first
 * things anyone types into a home inventory, so it has to be searchable.
 */
export function matchesQuery(
  item: InventoryItem,
  q: string,
  locationText?: string
): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const hay = [
    item.name,
    item.category,
    item.manufacturer,
    item.model,
    item.serial,
    item.barcode,
    item.notes,
    item.projectName,
    item.collection,
    item.tags?.join(" "),
    item.links?.map((l) => l.title).join(" "),
    locationText,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(needle);
}

/**
 * The visible list: archived hidden unless asked for, optional location filter,
 * most-recently-updated first.
 *
 * `"__none__"` selects unassigned items, and an item whose `locationId` points
 * at a deleted location counts as unassigned so it can never vanish from every
 * view (the web app's fix for dangling references, preserved here).
 */
export function visibleItems(
  items: InventoryItem[],
  opts: {
    query?: string;
    locationId?: string | null;
    showArchived?: boolean;
    knownLocationIds?: Set<string>;
    /** Location id → path segments, as `locationPathsById` returns. */
    locationPaths?: Record<string, string[]>;
  } = {}
): InventoryItem[] {
  const {
    query = "",
    locationId = null,
    showArchived = false,
    knownLocationIds,
    locationPaths,
  } = opts;
  const pathText = (id: string | null): string | undefined =>
    id && locationPaths ? locationPaths[id]?.join(" ") : undefined;
  return items
    .filter((i) => (showArchived ? true : !i.archived))
    .filter((i) => matchesQuery(i, query, pathText(i.locationId)))
    .filter((i) => {
      if (!locationId) return true;
      const dangling = Boolean(
        i.locationId && knownLocationIds && !knownLocationIds.has(i.locationId)
      );
      if (locationId === "__none__") return !i.locationId || dangling;
      return i.locationId === locationId;
    })
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
}
