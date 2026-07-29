import { describe, it, expect } from "vitest";
import { matchesQuery, visibleItems } from "./filterItems";
import type { InventoryItem } from "./types";

const item = (over: Partial<InventoryItem> & { id: string; name: string }): InventoryItem => ({
  locationId: null,
  tags: [],
  quantity: 1,
  links: [],
  photos: [],
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  ...over,
});

describe("matchesQuery", () => {
  const drill = item({
    id: "1",
    name: "Cordless drill",
    manufacturer: "Makita",
    serial: "XY-9931",
    tags: ["garage", "power-tool"],
    notes: "borrowed from dad",
  });

  it("matches an empty/whitespace query (no filter applied)", () => {
    expect(matchesQuery(drill, "")).toBe(true);
    expect(matchesQuery(drill, "   ")).toBe(true);
  });

  it("matches on name, case-insensitively", () => {
    expect(matchesQuery(drill, "CORDLESS")).toBe(true);
  });

  it("matches on manufacturer, serial, tags and notes — not just the name", () => {
    expect(matchesQuery(drill, "makita")).toBe(true);
    expect(matchesQuery(drill, "xy-9931")).toBe(true);
    expect(matchesQuery(drill, "garage")).toBe(true);
    expect(matchesQuery(drill, "dad")).toBe(true);
  });

  it("does not match unrelated text", () => {
    expect(matchesQuery(drill, "toaster")).toBe(false);
  });

  it("survives items with missing optional collections", () => {
    const bare = { id: "2", name: "Thing" } as unknown as InventoryItem;
    expect(matchesQuery(bare, "thing")).toBe(true);
    expect(matchesQuery(bare, "nope")).toBe(false);
  });
});

describe("visibleItems", () => {
  const a = item({ id: "a", name: "Alpha", updatedAt: "2026-05-01T00:00:00Z" });
  const b = item({ id: "b", name: "Beta", updatedAt: "2026-06-01T00:00:00Z" });
  const archived = item({ id: "c", name: "Gamma", archived: true });

  it("hides archived items by default and shows them on request", () => {
    expect(visibleItems([a, archived]).map((i) => i.id)).toEqual(["a"]);
    expect(
      visibleItems([a, archived], { showArchived: true }).map((i) => i.id).sort()
    ).toEqual(["a", "c"]);
  });

  it("sorts most-recently-updated first", () => {
    expect(visibleItems([a, b]).map((i) => i.id)).toEqual(["b", "a"]);
  });

  it("filters by location", () => {
    const kitchen = item({ id: "k", name: "Kettle", locationId: "loc1" });
    expect(
      visibleItems([a, kitchen], { locationId: "loc1" }).map((i) => i.id)
    ).toEqual(["k"]);
  });

  it("treats an item pointing at a deleted location as unassigned, so it never vanishes", () => {
    const dangling = item({ id: "d", name: "Orphan", locationId: "gone" });
    const known = new Set(["loc1"]);
    // It must not appear under the real location…
    expect(
      visibleItems([dangling], { locationId: "loc1", knownLocationIds: known })
    ).toEqual([]);
    // …but it MUST still be reachable via "unassigned".
    expect(
      visibleItems([dangling], {
        locationId: "__none__",
        knownLocationIds: known,
      }).map((i) => i.id)
    ).toEqual(["d"]);
  });

  it("combines query and location filters", () => {
    const x = item({ id: "x", name: "Kettle", locationId: "loc1" });
    const y = item({ id: "y", name: "Kettle", locationId: "loc2" });
    expect(
      visibleItems([x, y], { query: "kettle", locationId: "loc2" }).map((i) => i.id)
    ).toEqual(["y"]);
  });
});
