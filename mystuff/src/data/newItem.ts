import * as Crypto from "expo-crypto";

import type { InventoryItem, ItemKind } from "@/lib/types";

/**
 * Build a valid InventoryItem from the minimum a user actually types.
 *
 * Progressive disclosure means the add form asks for a name and (optionally) a
 * kind — everything else must still come out schema-valid, because the same
 * record is read by the ported lib modules and, later, synced to the identical
 * Firestore shape the web app uses.
 *
 * `now` is injected so the function stays pure and testable (no clock reads).
 */
export function newItem(
  input: { name: string; kind?: ItemKind | ""; id?: string },
  now: string
): InventoryItem {
  const kind = input.kind ? input.kind : undefined;
  return {
    id: input.id ?? Crypto.randomUUID(),
    name: input.name.trim(),
    locationId: null,
    kind,
    tags: [],
    quantity: 1,
    links: [],
    photos: [],
    createdAt: now,
    updatedAt: now,
  };
}
