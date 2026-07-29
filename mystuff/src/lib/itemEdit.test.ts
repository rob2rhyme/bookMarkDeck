import { describe, it, expect } from "vitest";
import {
  applyDraft,
  draftErrors,
  isDirty,
  itemToDraft,
  parseQuantity,
} from "./itemEdit";
import type { InventoryItem, InventoryLocation } from "./types";

const ITEM: InventoryItem = {
  id: "i1",
  name: "Cordless drill",
  locationId: "garage",
  kind: "tool",
  category: "Power tools",
  notes: "18V battery",
  tags: [],
  quantity: 1,
  links: [],
  photos: [],
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

const LOCATIONS: InventoryLocation[] = [
  {
    id: "garage",
    name: "Garage",
    parentId: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "loft",
    name: "Loft",
    parentId: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
];

const NOW = "2026-07-29T12:00:00Z";
const OPTS = { now: NOW, eventId: "ev1", locations: LOCATIONS };

describe("itemToDraft", () => {
  it("maps absent optionals to empty strings, never undefined", () => {
    const bare: InventoryItem = { ...ITEM, kind: undefined, category: undefined, notes: undefined };
    expect(itemToDraft(bare)).toEqual({
      name: "Cordless drill",
      kind: "",
      locationId: "garage",
      quantity: "1",
      category: "",
      notes: "",
    });
  });

  it("round-trips an unchanged item", () => {
    expect(isDirty(ITEM, itemToDraft(ITEM))).toBe(false);
  });
});

describe("parseQuantity", () => {
  it("accepts whole numbers including zero, ignoring surrounding space", () => {
    expect(parseQuantity("3")).toBe(3);
    expect(parseQuantity("  12 ")).toBe(12);
    expect(parseQuantity("0")).toBe(0);
  });

  it("rejects blanks, decimals, negatives and text rather than coercing", () => {
    for (const bad of ["", "   ", "2.5", "-1", "two", "1e3", "٣"]) {
      expect(parseQuantity(bad)).toBeNull();
    }
  });
});

describe("draftErrors", () => {
  it("passes a valid draft", () => {
    expect(draftErrors(itemToDraft(ITEM))).toEqual({});
  });

  it("flags a blank name", () => {
    expect(draftErrors({ ...itemToDraft(ITEM), name: "   " }).name).toBeTruthy();
  });

  it("flags an unparseable quantity", () => {
    expect(draftErrors({ ...itemToDraft(ITEM), quantity: "" }).quantity).toBeTruthy();
  });
});

describe("isDirty", () => {
  it("ignores whitespace-only edits", () => {
    expect(isDirty(ITEM, { ...itemToDraft(ITEM), name: " Cordless drill " })).toBe(false);
  });

  it("sees a quantity change through the string form", () => {
    expect(isDirty(ITEM, { ...itemToDraft(ITEM), quantity: "01" })).toBe(false);
    expect(isDirty(ITEM, { ...itemToDraft(ITEM), quantity: "2" })).toBe(true);
  });

  it("sees a move, a kind change and a cleared note", () => {
    expect(isDirty(ITEM, { ...itemToDraft(ITEM), locationId: "loft" })).toBe(true);
    expect(isDirty(ITEM, { ...itemToDraft(ITEM), kind: "" })).toBe(true);
    expect(isDirty(ITEM, { ...itemToDraft(ITEM), notes: "" })).toBe(true);
  });
});

describe("applyDraft", () => {
  it("writes trimmed values and stamps updatedAt", () => {
    const next = applyDraft(
      ITEM,
      { ...itemToDraft(ITEM), name: "  Drill  ", quantity: "4" },
      OPTS
    );
    expect(next.name).toBe("Drill");
    expect(next.quantity).toBe(4);
    expect(next.updatedAt).toBe(NOW);
    expect(next.createdAt).toBe(ITEM.createdAt);
  });

  it("removes cleared optionals entirely — no empty strings, no undefined keys", () => {
    const next = applyDraft(
      ITEM,
      { ...itemToDraft(ITEM), kind: "", category: "  ", notes: "" },
      OPTS
    );
    expect("kind" in next).toBe(false);
    expect("category" in next).toBe(false);
    expect("notes" in next).toBe(false);
    // The Firestore adapter rejects undefined; JSON.stringify must not see one.
    expect(JSON.parse(JSON.stringify(next))).toEqual(next);
  });

  it("keeps untouched fields, including ones the form never shows", () => {
    const withExtras: InventoryItem = { ...ITEM, serial: "SN-9", price: 89.99 };
    const next = applyDraft(withExtras, itemToDraft(withExtras), OPTS);
    expect(next.serial).toBe("SN-9");
    expect(next.price).toBe(89.99);
  });

  it("logs a relocated event with name snapshots when the item moves", () => {
    const next = applyDraft(ITEM, { ...itemToDraft(ITEM), locationId: "loft" }, OPTS);
    expect(next.locationId).toBe("loft");
    expect(next.activity).toEqual([
      { id: "ev1", type: "relocated", at: NOW, fromLoc: "Garage", toLoc: "Loft" },
    ]);
  });

  it("omits the from/to snapshot when a side is unassigned", () => {
    const next = applyDraft(ITEM, { ...itemToDraft(ITEM), locationId: null }, OPTS);
    const event = next.activity?.[0];
    expect(event).toMatchObject({ type: "relocated", fromLoc: "Garage" });
    expect(event && "toLoc" in event).toBe(false);
  });

  it("appends to existing history rather than replacing it", () => {
    const seeded: InventoryItem = {
      ...ITEM,
      activity: [{ id: "old", type: "acquired", at: "2026-01-01T00:00:00Z" }],
    };
    const next = applyDraft(seeded, { ...itemToDraft(seeded), locationId: "loft" }, OPTS);
    expect(next.activity?.map((a) => a.id)).toEqual(["old", "ev1"]);
  });

  it("logs nothing when the location is untouched", () => {
    const next = applyDraft(ITEM, { ...itemToDraft(ITEM), name: "Drill" }, OPTS);
    expect("activity" in next).toBe(false);
  });

  it("falls back to current values instead of writing an invalid draft", () => {
    const next = applyDraft(ITEM, { ...itemToDraft(ITEM), name: "  ", quantity: "x" }, OPTS);
    expect(next.name).toBe("Cordless drill");
    expect(next.quantity).toBe(1);
  });
});
