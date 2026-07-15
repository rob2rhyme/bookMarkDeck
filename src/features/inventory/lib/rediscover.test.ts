import { describe, expect, it } from "vitest";

import { pickRediscover } from "@/features/inventory/lib/rediscover";
import type { InventoryItem } from "@/features/inventory/lib/types";

function item(id: string, updatedAt: string | null, archived = false): InventoryItem {
  return {
    id,
    name: id,
    locationId: null,
    tags: [],
    quantity: 1,
    links: [],
    photos: [],
    archived,
    createdAt: null,
    updatedAt,
  };
}

const many = (n: number) =>
  Array.from({ length: n }, (_, i) =>
    item(`i${i}`, `2026-07-${String((i % 28) + 1).padStart(2, "0")}`)
  );

describe("pickRediscover", () => {
  it("returns null below the minimum item count", () => {
    expect(pickRediscover(many(4), "2026-07-15")).toBeNull();
  });

  it("returns null for an empty day string", () => {
    expect(pickRediscover(many(10), "")).toBeNull();
  });

  it("is deterministic for a given day and varies across days", () => {
    const items = many(10);
    expect(pickRediscover(items, "2026-07-15")!.id).toBe(
      pickRediscover(items, "2026-07-15")!.id
    );
    const days = ["2026-07-15", "2026-07-16", "2026-07-17", "2026-07-18"];
    const picks = new Set(days.map((d) => pickRediscover(items, d)!.id));
    expect(picks.size).toBeGreaterThan(1); // not stuck on one item
  });

  it("never surfaces an archived item", () => {
    const items = [
      ...Array.from({ length: 6 }, (_, i) => item(`a${i}`, "2026-01-01", true)),
      item("live", "2026-07-01"),
      ...many(5),
    ];
    for (const d of ["2026-07-15", "2026-07-16", "2026-07-20", "2026-08-01"]) {
      expect(pickRediscover(items, d)!.archived).not.toBe(true);
    }
  });

  it("draws from the least-recently-touched pool", () => {
    // 25 items; the pool is the 20 oldest, so the 5 newest never appear.
    const items = Array.from({ length: 25 }, (_, i) =>
      item(`i${String(i).padStart(2, "0")}`, `2026-07-${String(i + 1).padStart(2, "0")}`)
    );
    const newestIds = new Set(items.slice(-5).map((i) => i.id));
    for (let d = 1; d <= 60; d++) {
      const pick = pickRediscover(items, `2026-09-${String(d).padStart(2, "0")}`);
      if (pick) expect(newestIds.has(pick.id)).toBe(false);
    }
  });
});
