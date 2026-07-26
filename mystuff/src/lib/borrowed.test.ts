import { describe, expect, it } from "vitest";

import type { InventoryItem } from "./types";
import { borrowSpend, borrowedLedger } from "./borrowed";
import { itemCount, totalPaid, totalResale, totalValue } from "./value";

const today = "2026-07-17";

function item(overrides: Partial<InventoryItem>): InventoryItem {
  return {
    id: Math.random().toString(36).slice(2),
    name: "x",
    locationId: null,
    tags: [],
    quantity: 1,
    links: [],
    photos: [],
    lentTo: null,
    lentDate: null,
    dueDate: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: null,
    ...overrides,
  };
}

describe("borrowedLedger", () => {
  it("splits out vs history, computes overdue and costs", () => {
    const items = [
      item({
        origin: "rented",
        borrowedFrom: "CamRent",
        borrowReturnBy: "2026-07-10", // overdue
        price: 100,
        taxRate: 6,
      }),
      item({ origin: "borrowed", borrowedFrom: "Sam", borrowReturnBy: "2026-07-30" }),
      item({
        origin: "borrowed",
        borrowedFrom: "Alex",
        status: "returned",
        activity: [
          { id: "a", type: "refunded", at: "2026-06-01T10:00:00.000Z" },
        ],
      }),
      item({}), // owned — not in the ledger
    ];
    const { out, history } = borrowedLedger(items, today);
    expect(out).toHaveLength(2);
    expect(out[0].overdue).toBe(true); // sorted overdue-first
    expect(out[0].from).toBe("CamRent");
    expect(out[0].cost).toBeCloseTo(106);
    expect(out[1].daysLeft).toBe(13);
    expect(history).toHaveLength(1);
    expect(history[0].returnedAt).toBe("2026-06-01T10:00:00.000Z");
  });

  it("borrowSpend totals fees incl. tax across out + history", () => {
    const items = [
      item({ origin: "rented", price: 100, taxRate: 6 }),
      item({ origin: "borrowed", status: "returned", price: 10 }),
      item({ price: 999 }), // owned — not borrow spend
    ];
    expect(borrowSpend(items)).toBeCloseTo(116);
  });
});

describe("owned-vs-borrowed in the value roll-ups", () => {
  it("keeps borrowed/rented out of worth but inside spend", () => {
    const items = [
      item({ price: 100 }), // owned asset
      item({ origin: "rented", price: 50, taxRate: 6 }), // fee, not an asset
    ];
    expect(totalValue(items)).toBe(100);
    expect(itemCount(items)).toBe(1);
    expect(totalResale(items, today)).toBe(100);
    expect(totalPaid(items)).toBeCloseTo(153); // 100 + 53 rental incl. tax
  });
});
