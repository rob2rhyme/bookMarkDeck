import { describe, expect, it } from "vitest";

import {
  activitySummary,
  countType,
  hasTrending,
  lendingHistory,
  possessionDays,
  trending,
} from "./activity";
import type { InventoryItem, ItemActivity } from "./types";

const DAY = 86_400_000;
const NOW = Date.parse("2026-07-15T00:00:00Z");
const daysAgo = (n: number) => new Date(NOW - n * DAY).toISOString();

function item(partial: Partial<InventoryItem>): InventoryItem {
  return {
    id: partial.id ?? crypto.randomUUID(),
    name: partial.name ?? "Thing",
    locationId: null,
    tags: [],
    quantity: 1,
    links: [],
    photos: [],
    createdAt: null,
    updatedAt: null,
    ...partial,
  };
}

const act = (partial: Partial<ItemActivity>): ItemActivity => ({
  id: crypto.randomUUID(),
  type: partial.type ?? "used",
  at: partial.at ?? daysAgo(1),
  ...partial,
});

describe("possessionDays", () => {
  it("counts from the acquired event", () => {
    const i = item({ activity: [act({ type: "acquired", at: daysAgo(30) })] });
    expect(possessionDays(i, NOW)).toBe(30);
  });
  it("falls back to purchaseDate, then createdAt", () => {
    expect(possessionDays(item({ purchaseDate: "2026-07-05" }), NOW)).toBe(10);
    expect(possessionDays(item({ createdAt: daysAgo(3) }), NOW)).toBe(3);
    expect(possessionDays(item({}), NOW)).toBeNull();
  });
});

describe("lendingHistory", () => {
  it("pairs lent → returned with condition in/out and duration", () => {
    const i = item({
      activity: [
        act({ type: "lent", at: daysAgo(20), to: "Sam", condition: "good" }),
        act({ type: "returned", at: daysAgo(6), condition: "fair" }),
      ],
    });
    const loans = lendingHistory(i, NOW);
    expect(loans).toHaveLength(1);
    expect(loans[0]).toMatchObject({
      to: "Sam",
      days: 14,
      conditionOut: "good",
      conditionIn: "fair",
    });
    expect(loans[0].returnedAt).not.toBeNull();
  });

  it("treats an unreturned loan as still out, measured to now", () => {
    const i = item({
      activity: [act({ type: "lent", at: daysAgo(5), to: "Kai" })],
    });
    const loans = lendingHistory(i, NOW);
    expect(loans[0].returnedAt).toBeNull();
    expect(loans[0].days).toBe(5);
  });

  it("orders most-recent first across multiple loans", () => {
    const i = item({
      activity: [
        act({ type: "lent", at: daysAgo(40), to: "A" }),
        act({ type: "returned", at: daysAgo(38) }),
        act({ type: "lent", at: daysAgo(10), to: "B" }),
        act({ type: "returned", at: daysAgo(9) }),
      ],
    });
    expect(lendingHistory(i, NOW).map((l) => l.to)).toEqual(["B", "A"]);
  });
});

describe("activitySummary", () => {
  it("summarizes uses, lends, relocations and the open loan", () => {
    const i = item({
      createdAt: daysAgo(100),
      activity: [
        act({ type: "used", at: daysAgo(3) }),
        act({ type: "used", at: daysAgo(1) }),
        act({ type: "relocated", at: daysAgo(2), fromLoc: "Garage", toLoc: "Attic" }),
        act({ type: "lent", at: daysAgo(1), to: "Sam" }),
      ],
    });
    const s = activitySummary(i, NOW);
    expect(s.uses).toBe(2);
    expect(s.lends).toBe(1);
    expect(s.relocations).toBe(1);
    expect(s.possessionDays).toBe(100);
    expect(s.currentLoan?.to).toBe("Sam");
  });
});

describe("countType windowing", () => {
  it("respects the since bound", () => {
    const i = item({
      activity: [act({ type: "used", at: daysAgo(120) }), act({ type: "used", at: daysAgo(2) })],
    });
    expect(countType(i, "used")).toBe(2);
    expect(countType(i, "used", NOW - 90 * DAY)).toBe(1);
  });
});

describe("trending", () => {
  const a = item({ name: "A", activity: [act({ type: "used", at: daysAgo(1) }), act({ type: "used", at: daysAgo(2) })] });
  const b = item({ name: "B", activity: [act({ type: "used", at: daysAgo(1) }), act({ type: "lent", at: daysAgo(1) }), act({ type: "lent", at: daysAgo(2) })] });
  const stale = item({ name: "Old", activity: [act({ type: "used", at: daysAgo(200) })] });
  const archived = item({ name: "Arch", archived: true, activity: [act({ type: "used", at: daysAgo(1) })] });

  it("ranks by recent count, excludes stale/archived", () => {
    const t = trending([a, b, stale, archived], NOW, 90);
    expect(t.used.map((e) => e.item.name)).toEqual(["A", "B"]);
    expect(t.used[0].count).toBe(2);
    expect(t.lent[0].item.name).toBe("B");
    expect(hasTrending(t)).toBe(true);
  });

  it("is empty when nothing is recent", () => {
    const t = trending([stale], NOW, 90);
    expect(hasTrending(t)).toBe(false);
  });
});
