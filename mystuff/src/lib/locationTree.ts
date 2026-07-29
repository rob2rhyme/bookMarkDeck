// Location-tree edits that must not corrupt the tree.
//
// Deleting a location has two side effects the UI must never get wrong:
// items pointing at it would dangle, and its children would be orphaned
// (unreachable from any root). The web app handles the first and not the
// second — this is one of the defects the port fixes rather than inherits.
//
// Pure, so it is testable without a database.

import { locationPathsById } from "./inventorySearch";
import type { InventoryItem, InventoryLocation } from "./types";

/** Direct children of a location. */
export function childrenOf(
  locations: InventoryLocation[],
  parentId: string | null
): InventoryLocation[] {
  return locations.filter((l) => l.parentId === parentId);
}

/**
 * A location plus every descendant, depth-first. Cycle-guarded: a corrupt
 * parent chain must not hang the app.
 */
export function subtreeIds(
  locations: InventoryLocation[],
  rootId: string
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const walk = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    out.push(id);
    for (const child of childrenOf(locations, id)) walk(child.id);
  };
  walk(rootId);
  return out;
}

/**
 * Would moving `id` under `nextParentId` create a cycle? Guards the location
 * picker, since a location inside its own descendant is unreachable forever.
 */
export function wouldCreateCycle(
  locations: InventoryLocation[],
  id: string,
  nextParentId: string | null
): boolean {
  if (!nextParentId) return false;
  if (nextParentId === id) return true;
  return subtreeIds(locations, id).includes(nextParentId);
}

/**
 * Locations as pickable options, each labelled by its full path ("House /
 * Kitchen / Pantry") and ordered so a parent always reads before its children.
 * Sorting on the path string is what groups a branch together in a flat list.
 */
export function locationOptions(
  locations: InventoryLocation[]
): { id: string; label: string }[] {
  const paths = locationPathsById(locations);
  return locations
    .map((l) => ({ id: l.id, label: (paths[l.id] ?? [l.name]).join(" / ") }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Plan a deletion: children are re-parented to the deleted location's parent
 * (promoted rather than orphaned), and items held there become unassigned.
 *
 * Returns the updated rows to persist — the caller decides how to write them.
 */
export function planLocationDelete(
  locations: InventoryLocation[],
  items: InventoryItem[],
  id: string,
  now: string
): {
  removeId: string;
  reparentedLocations: InventoryLocation[];
  unassignedItems: InventoryItem[];
} {
  const target = locations.find((l) => l.id === id);
  const grandparent = target?.parentId ?? null;

  const reparentedLocations = childrenOf(locations, id).map((child) => ({
    ...child,
    parentId: grandparent,
    updatedAt: now,
  }));

  const unassignedItems = items
    .filter((i) => i.locationId === id)
    .map((i) => ({ ...i, locationId: null, updatedAt: now }));

  return { removeId: id, reparentedLocations, unassignedItems };
}
