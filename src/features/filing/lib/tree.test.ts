import { describe, expect, it } from "vitest";

import { buildTree, flattenTree, subtreeIds } from "@/features/filing/lib/tree";
import type { FilingPlace } from "@/features/filing/lib/types";

const place = (id: string, name: string, parentId: string | null = null,
               sortOrder?: number): FilingPlace => ({
  id, name, parentId, sortOrder, createdAt: null, updatedAt: null,
});

describe("buildTree", () => {
  it("nests children under their parent and stamps depth", () => {
    const tree = buildTree([
      place("garage", "Garage"),
      place("cab", "Grey cabinet", "garage"),
      place("d2", "Drawer 2", "cab"),
    ]);
    expect(tree).toHaveLength(1);
    expect(tree[0].depth).toBe(0);
    expect(tree[0].children[0].name).toBe("Grey cabinet");
    expect(tree[0].children[0].depth).toBe(1);
    expect(tree[0].children[0].children[0].depth).toBe(2);
  });

  it("surfaces orphans at the root rather than dropping them", () => {
    const tree = buildTree([place("d2", "Drawer 2", "missing-cabinet")]);
    expect(tree.map((n) => n.name)).toEqual(["Drawer 2"]);
  });

  it("does not hang when a place claims itself as its parent", () => {
    const tree = buildTree([place("a", "Self-parent", "a")]);
    expect(tree.map((n) => n.name)).toEqual(["Self-parent"]);
  });

  it("sorts by sortOrder, then name", () => {
    const tree = buildTree([
      place("b", "Bravo", null, 1),
      place("a", "Alpha", null, 1),
      place("z", "Zulu", null, 0),
    ]);
    expect(tree.map((n) => n.name)).toEqual(["Zulu", "Alpha", "Bravo"]);
  });
});

describe("flattenTree", () => {
  it("returns a depth-first list", () => {
    const tree = buildTree([
      place("home", "Home"),
      place("office", "Office"),
      place("desk", "Desk", "office"),
    ]);
    expect(flattenTree(tree).map((n) => n.name)).toEqual([
      "Home", "Office", "Desk",
    ]);
  });
});

describe("subtreeIds", () => {
  const places = [
    place("garage", "Garage"),
    place("cab", "Cabinet", "garage"),
    place("d1", "Drawer 1", "cab"),
    place("home", "Home"),
  ];

  it("includes the node and every descendant", () => {
    expect([...subtreeIds(places, "garage")].sort()).toEqual(["cab", "d1", "garage"]);
  });

  it("is just the node itself for a leaf", () => {
    expect([...subtreeIds(places, "d1")]).toEqual(["d1"]);
  });

  it("excludes unrelated branches", () => {
    expect(subtreeIds(places, "garage").has("home")).toBe(false);
  });
});
