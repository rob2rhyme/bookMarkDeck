import { describe, it, expect } from "vitest";
import { pickRediscoverBookmark } from "./rediscoverBookmark";
import type { Bookmark } from "@/types/bookmark";

const bm = (over: Partial<Bookmark> & { id: string }): Bookmark => ({
  title: `t-${over.id}`,
  url: `https://${over.id}.com`,
  createdAt: "2026-01-01T00:00:00Z",
  ...over,
});

// 10 bookmarks so we clear the minLibrary=8 gate.
const many = (n: number, extra: (i: number) => Partial<Bookmark> = () => ({})) =>
  Array.from({ length: n }, (_, i) => bm({ id: `b${i}`, ...extra(i) }));

describe("pickRediscoverBookmark", () => {
  it("returns null for a small library", () => {
    expect(pickRediscoverBookmark(many(5), "2026-07-24")).toBeNull();
  });

  it("returns null for an empty day", () => {
    expect(pickRediscoverBookmark(many(10), "")).toBeNull();
  });

  it("is deterministic for a given day", () => {
    const list = many(10, (i) => ({ hits: i, lastUsedAt: `2026-0${(i % 9) + 1}-01T00:00:00Z` }));
    const a = pickRediscoverBookmark(list, "2026-07-24");
    const b = pickRediscoverBookmark(list, "2026-07-24");
    expect(a?.id).toBe(b?.id);
    expect(a).not.toBeNull();
  });

  it("favours once-loved (hits>0) bookmarks when at least 3 have hits", () => {
    // 3 loved (old), 7 never-opened (newer). Pick must be one of the loved.
    const loved = [
      bm({ id: "L1", hits: 5, lastUsedAt: "2025-01-01T00:00:00Z" }),
      bm({ id: "L2", hits: 3, lastUsedAt: "2025-02-01T00:00:00Z" }),
      bm({ id: "L3", hits: 9, lastUsedAt: "2025-03-01T00:00:00Z" }),
    ];
    const cold = many(7, (i) => ({ hits: 0, lastUsedAt: `2026-06-0${i + 1}T00:00:00Z` }));
    const pick = pickRediscoverBookmark([...cold, ...loved], "2026-07-24");
    expect(["L1", "L2", "L3"]).toContain(pick?.id);
  });

  it("rotates the pick across different days (not always identical)", () => {
    const list = many(15, (i) => ({ hits: 1, lastUsedAt: `2026-01-${String((i % 28) + 1).padStart(2, "0")}T00:00:00Z` }));
    const days = ["2026-07-01", "2026-07-02", "2026-07-03", "2026-07-04", "2026-07-05"];
    const picks = new Set(days.map((d) => pickRediscoverBookmark(list, d)?.id));
    expect(picks.size).toBeGreaterThan(1);
  });
});
