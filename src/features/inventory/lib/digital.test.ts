import { describe, expect, it } from "vitest";

import type { InventoryItem } from "./types";
import { subscriptionLedger } from "./digital";
import { monthlyEquivalent, nextRenewal } from "./value";

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

describe("nextRenewal", () => {
  it("keeps a future date and rolls a past one forward by the cycle", () => {
    const future = item({
      kind: "digital",
      billingCycle: "monthly",
      renewsOn: "2026-07-20",
    });
    expect(nextRenewal(future, today)).toBe("2026-07-20");

    const stale = item({
      kind: "digital",
      billingCycle: "monthly",
      renewsOn: "2026-03-05",
    });
    expect(nextRenewal(stale, today)).toBe("2026-08-05");

    const yearly = item({
      kind: "digital",
      billingCycle: "yearly",
      renewsOn: "2024-02-01",
    });
    expect(nextRenewal(yearly, today)).toBe("2027-02-01");
  });

  it("is null for one-time purchases, missing dates, and garbage", () => {
    expect(
      nextRenewal(item({ billingCycle: "once", renewsOn: "2026-08-01" }), today)
    ).toBeNull();
    expect(nextRenewal(item({ billingCycle: "monthly" }), today)).toBeNull();
    expect(
      nextRenewal(item({ billingCycle: "monthly", renewsOn: "junk" }), today)
    ).toBeNull();
  });
});

describe("subscriptions vs the value roll-ups", () => {
  it("keeps subscriptions out of worth; one-time licenses stay assets", async () => {
    const { totalValue } = await import("./value");
    expect(
      totalValue([
        item({ price: 100 }), // asset
        item({ kind: "digital", billingCycle: "monthly", price: 10 }), // running cost
        item({ kind: "digital", billingCycle: "once", price: 99 }), // license = asset
      ])
    ).toBe(199);
  });
});

describe("monthlyEquivalent / subscriptionLedger", () => {
  it("normalizes yearly to per-month, tax included", () => {
    expect(
      monthlyEquivalent(item({ billingCycle: "monthly", price: 10, taxRate: 6 }))
    ).toBeCloseTo(10.6);
    expect(
      monthlyEquivalent(item({ billingCycle: "yearly", price: 120 }))
    ).toBeCloseTo(10);
    expect(monthlyEquivalent(item({ billingCycle: "once", price: 99 }))).toBe(0);
  });

  it("splits subs (soonest first) from one-time and totals both", () => {
    const items = [
      item({
        kind: "digital",
        name: "Cloud",
        billingCycle: "monthly",
        price: 10,
        renewsOn: "2026-07-25",
      }),
      item({
        kind: "digital",
        name: "Stream",
        billingCycle: "yearly",
        price: 120,
        renewsOn: "2026-07-19",
      }),
      item({ kind: "digital", name: "Editor", billingCycle: "once", price: 99 }),
      item({ kind: "digital", name: "Old", billingCycle: "monthly", price: 5, status: "returned" }),
      item({ name: "Chair", price: 50 }), // not digital
    ];
    const l = subscriptionLedger(items, today);
    expect(l.subs.map((s) => s.item.name)).toEqual(["Stream", "Cloud"]);
    expect(l.monthlyTotal).toBeCloseTo(20);
    expect(l.yearlyTotal).toBeCloseTo(240);
    expect(l.oneTime.map((i) => i.name)).toEqual(["Editor"]);
    expect(l.oneTimeSpend).toBeCloseTo(99);
  });
});
