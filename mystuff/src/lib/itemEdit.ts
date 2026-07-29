// Editing an item, as pure functions.
//
// The web app does this inline in a ~1,200-line component, so none of it is
// tested: blank-vs-undefined handling, quantity parsing and the "did anything
// change?" check all live in JSX. Here the rules are data-in/data-out, which is
// what lets the form stay a thin shell.
//
// Two invariants the UI depends on:
//   1. A cleared optional field becomes an *absent* key, not `""` — the record
//      is written to the same Firestore shape the web app reads, and `undefined`
//      values are rejected there while empty strings would corrupt "is it set?"
//      checks across the ported lib.
//   2. Moving an item appends a `relocated` event, so the history and trending
//      analyses in `activity.ts` have something real to read.

import type { InventoryItem, InventoryLocation, ItemKind } from "./types";

/** What the form binds to — every value a string, as text inputs produce. */
export type ItemDraft = {
  name: string;
  kind: ItemKind | "";
  locationId: string | null;
  quantity: string;
  category: string;
  notes: string;
};

export type DraftErrors = Partial<Record<"name" | "quantity", string>>;

/** Load an item into an editable draft. Absent optionals become empty strings. */
export function itemToDraft(item: InventoryItem): ItemDraft {
  return {
    name: item.name,
    kind: item.kind ?? "",
    locationId: item.locationId,
    quantity: String(item.quantity),
    category: item.category ?? "",
    notes: item.notes ?? "",
  };
}

/**
 * Quantity as a whole number, or null when the text isn't one. Rejects blanks,
 * decimals and negatives rather than coercing them — silently turning "2.5"
 * into 2 loses what the user meant.
 */
export function parseQuantity(text: string): number | null {
  const t = text.trim();
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return Number.isSafeInteger(n) ? n : null;
}

/** Field-keyed messages for anything that would block a save. */
export function draftErrors(draft: ItemDraft): DraftErrors {
  const errors: DraftErrors = {};
  if (!draft.name.trim()) errors.name = "Give it a name so you can find it later.";
  if (parseQuantity(draft.quantity) === null) {
    errors.quantity = "Enter a whole number, like 1.";
  }
  return errors;
}

/** True when the draft differs from the item — powers the discard prompt. */
export function isDirty(item: InventoryItem, draft: ItemDraft): boolean {
  const original = itemToDraft(item);
  return (
    original.name.trim() !== draft.name.trim() ||
    original.kind !== draft.kind ||
    original.locationId !== draft.locationId ||
    original.category.trim() !== draft.category.trim() ||
    original.notes.trim() !== draft.notes.trim() ||
    parseQuantity(original.quantity) !== parseQuantity(draft.quantity)
  );
}

/** Drop keys whose value is `undefined` so the record stays Firestore-safe. */
function compact<T extends object>(obj: T): T {
  const out = { ...obj };
  for (const key of Object.keys(out) as (keyof T)[]) {
    if (out[key] === undefined) delete out[key];
  }
  return out;
}

const trimmedOrAbsent = (text: string): string | undefined =>
  text.trim() || undefined;

const locationName = (
  locations: InventoryLocation[],
  id: string | null
): string | undefined => locations.find((l) => l.id === id)?.name;

/**
 * Apply a valid draft to an item. Callers check `draftErrors` first — an
 * invalid draft here falls back to the item's current values rather than
 * writing nonsense.
 *
 * `now` and `eventId` are injected to keep this free of clock and crypto reads.
 * `locations` is only used to snapshot names onto the relocation event, so the
 * history still reads correctly after a location is renamed or deleted.
 */
export function applyDraft(
  item: InventoryItem,
  draft: ItemDraft,
  {
    now,
    eventId,
    locations = [],
  }: { now: string; eventId: string; locations?: InventoryLocation[] }
): InventoryItem {
  const moved = draft.locationId !== item.locationId;

  const activity = moved
    ? [
        ...(item.activity ?? []),
        compact({
          id: eventId,
          type: "relocated" as const,
          at: now,
          fromLoc: locationName(locations, item.locationId),
          toLoc: locationName(locations, draft.locationId),
        }),
      ]
    : item.activity;

  return compact({
    ...item,
    name: draft.name.trim() || item.name,
    kind: draft.kind || undefined,
    locationId: draft.locationId,
    quantity: parseQuantity(draft.quantity) ?? item.quantity,
    category: trimmedOrAbsent(draft.category),
    notes: trimmedOrAbsent(draft.notes),
    ...(activity ? { activity } : {}),
    updatedAt: now,
  });
}
