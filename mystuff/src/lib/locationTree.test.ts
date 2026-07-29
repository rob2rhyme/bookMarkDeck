import { describe, it, expect } from "vitest";
import {
  childrenOf,
  locationOptions,
  planLocationDelete,
  subtreeIds,
  wouldCreateCycle,
} from "./locationTree";
import type { InventoryItem, InventoryLocation } from "./types";

const loc = (id: string, name: string, parentId: string | null = null): InventoryLocation => ({
  id,
  name,
  parentId,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
});

const item = (id: string, locationId: string | null): InventoryItem => ({
  id,
  name: `item-${id}`,
  locationId,
  tags: [],
  quantity: 1,
  links: [],
  photos: [],
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
});

// house > kitchen > pantry ; house > garage
const TREE = [
  loc("house", "House"),
  loc("kitchen", "Kitchen", "house"),
  loc("pantry", "Pantry", "kitchen"),
  loc("garage", "Garage", "house"),
];

describe("childrenOf", () => {
  it("returns direct children only", () => {
    expect(childrenOf(TREE, "house").map((l) => l.id).sort()).toEqual([
      "garage",
      "kitchen",
    ]);
    expect(childrenOf(TREE, "kitchen").map((l) => l.id)).toEqual(["pantry"]);
  });

  it("returns roots for null", () => {
    expect(childrenOf(TREE, null).map((l) => l.id)).toEqual(["house"]);
  });
});

describe("subtreeIds", () => {
  it("includes the root and all descendants", () => {
    expect(subtreeIds(TREE, "house").sort()).toEqual([
      "garage",
      "house",
      "kitchen",
      "pantry",
    ]);
  });

  it("terminates on a corrupt parent cycle instead of hanging", () => {
    const cyclic = [loc("a", "A", "b"), loc("b", "B", "a")];
    expect(subtreeIds(cyclic, "a").sort()).toEqual(["a", "b"]);
  });
});

describe("wouldCreateCycle", () => {
  it("rejects moving a location into itself", () => {
    expect(wouldCreateCycle(TREE, "kitchen", "kitchen")).toBe(true);
  });

  it("rejects moving a location into its own descendant", () => {
    expect(wouldCreateCycle(TREE, "kitchen", "pantry")).toBe(true);
  });

  it("allows moving to an unrelated branch or to root", () => {
    expect(wouldCreateCycle(TREE, "pantry", "garage")).toBe(false);
    expect(wouldCreateCycle(TREE, "pantry", null)).toBe(false);
  });
});

describe("locationOptions", () => {
  it("labels each location by its full path", () => {
    const byId = Object.fromEntries(
      locationOptions(TREE).map((o) => [o.id, o.label])
    );
    expect(byId.pantry).toBe("House / Kitchen / Pantry");
    expect(byId.house).toBe("House");
  });

  it("orders a parent before its children", () => {
    const labels = locationOptions(TREE).map((o) => o.label);
    expect(labels).toEqual([
      "House",
      "House / Garage",
      "House / Kitchen",
      "House / Kitchen / Pantry",
    ]);
  });

  it("is empty for no locations", () => {
    expect(locationOptions([])).toEqual([]);
  });
});

describe("planLocationDelete", () => {
  const NOW = "2026-07-01T00:00:00Z";

  it("promotes children to the deleted location's parent — never orphans them", () => {
    const plan = planLocationDelete(TREE, [], "kitchen", NOW);
    expect(plan.removeId).toBe("kitchen");
    // Pantry was under Kitchen, which was under House → Pantry moves to House.
    expect(plan.reparentedLocations).toHaveLength(1);
    expect(plan.reparentedLocations[0]).toMatchObject({
      id: "pantry",
      parentId: "house",
    });
  });

  it("promotes children to root when deleting a top-level location", () => {
    const plan = planLocationDelete(TREE, [], "house", NOW);
    expect(plan.reparentedLocations.map((l) => l.parentId)).toEqual([null, null]);
  });

  it("unassigns items held in the deleted location", () => {
    const items = [item("i1", "kitchen"), item("i2", "garage"), item("i3", null)];
    const plan = planLocationDelete(TREE, items, "kitchen", NOW);
    expect(plan.unassignedItems).toHaveLength(1);
    expect(plan.unassignedItems[0]).toMatchObject({ id: "i1", locationId: null });
  });

  it("stamps updatedAt on everything it rewrites", () => {
    const plan = planLocationDelete(TREE, [item("i1", "kitchen")], "kitchen", NOW);
    expect(plan.reparentedLocations[0].updatedAt).toBe(NOW);
    expect(plan.unassignedItems[0].updatedAt).toBe(NOW);
  });

  it("is a no-op plan for a leaf with nothing in it", () => {
    const plan = planLocationDelete(TREE, [], "garage", NOW);
    expect(plan.reparentedLocations).toEqual([]);
    expect(plan.unassignedItems).toEqual([]);
  });
});
