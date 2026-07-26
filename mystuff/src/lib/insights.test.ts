import { describe, expect, it } from "vitest";

import type { InventoryItem } from "./types";
import {
  acquiredDay,
  categoryShares,
  interestTrend,
  insightsSummary,
  localFacts,
  locationCounts,
  statusMix,
  tagCounts,
  warrantyBuckets,
} from "./insights";

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

describe("categoryShares", () => {
  it("counts, sorts, folds the tail into Other, defaults uncategorized", () => {
    const items = [
      item({ category: "Books" }),
      item({ category: "Books" }),
      item({ category: "Tools" }),
      item({}),
    ];
    expect(categoryShares(items, 3)).toEqual([
      { label: "Books", count: 2 },
      { label: "Tools", count: 1 },
      { label: "Uncategorized", count: 1 },
    ]);
    expect(categoryShares(items, 1)).toEqual([
      { label: "Books", count: 2 },
      { label: "Other", count: 2 },
    ]);
  });

  it("skips archived items", () => {
    expect(categoryShares([item({ category: "Books", archived: true })])).toEqual([]);
  });
});

describe("locationCounts / tagCounts", () => {
  it("maps location ids to names and handles unassigned", () => {
    const items = [item({ locationId: "a" }), item({ locationId: "a" }), item({})];
    expect(locationCounts(items, { a: "Garage" })).toEqual([
      { label: "Garage", count: 2 },
      { label: "Unassigned", count: 1 },
    ]);
  });

  it("counts an item once per tag; empty when untagged", () => {
    expect(tagCounts([item({ tags: ["camp", "gear"] }), item({ tags: ["camp"] })])).toEqual([
      { label: "camp", count: 2 },
      { label: "gear", count: 1 },
    ]);
    expect(tagCounts([item({})])).toEqual([]);
  });
});

describe("statusMix", () => {
  it("splits keeping / lent / misplaced / lost / returned", () => {
    const items = [
      item({}),
      item({ lentTo: "Alex" }),
      item({ status: "misplaced" }),
      item({ status: "lost" }),
      item({ status: "returned" }),
    ];
    expect(statusMix(items)).toEqual([
      { label: "Keeping", count: 1 },
      { label: "Lent", count: 1 },
      { label: "Misplaced", count: 1 },
      { label: "Lost", count: 1 },
      { label: "Returned", count: 1 },
    ]);
  });
});

describe("warrantyBuckets", () => {
  it("buckets by time to expiry and counts uncovered; skips returned", () => {
    const items = [
      item({ warrantyExpiry: "2026-01-01" }), // expired
      item({ warrantyExpiry: "2026-08-01" }), // ≤30d
      item({ warrantyExpiry: "2026-10-01" }), // ≤90d
      item({ warrantyExpiry: "2027-06-01" }), // ≤1yr
      item({ warrantyExpiry: "2030-01-01" }), // later
      item({}), // uncovered
      item({ warrantyExpiry: "2026-08-01", status: "returned" }), // gone
    ];
    const { buckets, uncovered } = warrantyBuckets(items, today);
    expect(buckets.map((b) => b.count)).toEqual([1, 1, 1, 1, 1]);
    expect(uncovered).toBe(1);
  });
});

describe("interestTrend", () => {
  it("buckets acquisitions per quarter for top categories", () => {
    const items = [
      item({ category: "Books", purchaseDate: "2026-01-15" }),
      item({ category: "Books", purchaseDate: "2026-05-01" }),
      item({ category: "Tools", purchaseDate: "2026-05-20" }),
    ];
    const t = interestTrend(items);
    expect(t.quarters).toEqual(["2026-Q1", "2026-Q2"]);
    expect(t.series.find((s) => s.label === "Books")?.counts).toEqual([1, 1]);
    expect(t.series.find((s) => s.label === "Tools")?.counts).toEqual([0, 1]);
    expect(t.series.some((s) => s.label === "Other")).toBe(false); // all made the cut
  });

  it("falls back to createdAt and handles empty input", () => {
    expect(acquiredDay(item({ purchaseDate: "2026-02-02" }))).toBe("2026-02-02");
    expect(acquiredDay(item({}))).toBe("2026-01-01");
    expect(interestTrend([])).toEqual({ quarters: [], series: [] });
  });
});

describe("localFacts / insightsSummary", () => {
  it("produces grounded facts for a mixed catalog", () => {
    const items = [
      item({ category: "Books", locationId: "a" }),
      item({ category: "Books", locationId: "a" }),
      item({ category: "Tools", status: "returned" }),
      item({ category: "Books", warrantyExpiry: "2026-08-01" }),
    ];
    const facts = localFacts(items, { a: "Study" }, today);
    expect(facts.join(" ")).toContain("Books");
    expect(facts.join(" ")).toContain("Study");
    expect(facts.join(" ")).toContain("back under warranty");
    expect(facts.join(" ")).toContain("within 90 days");
  });

  it("stays quiet on an empty catalog and never leaks item names", () => {
    expect(localFacts([], {}, today)).toEqual([]);
    const summary = JSON.stringify(
      insightsSummary([item({ name: "SECRET-SERIAL-123", category: "Books" })], {}, today)
    );
    expect(summary).not.toContain("SECRET");
    expect(summary).toContain("Books");
  });
});
