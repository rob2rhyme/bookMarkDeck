// Nestable-place tree helpers. Copied from the inventory pillar's
// useInventoryLocations rather than imported: the two pillars are deliberately
// independent so each stays a one-folder extraction
// (MYSTUFF-DECOUPLING-READINESS.md). Pure — see tree.test.ts.

import type { FilingPlace } from "@/features/filing/lib/types";

export type PlaceNode = FilingPlace & { children: PlaceNode[]; depth: number };

/** Build a nested tree; orphaned children (missing parent) surface at the root. */
export function buildTree(places: FilingPlace[]): PlaceNode[] {
  const byId = new Map(
    places.map((p) => [p.id, { ...p, children: [], depth: 0 } as PlaceNode])
  );
  const roots: PlaceNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parentId ? byId.get(node.parentId) : null;
    // A place that claims itself as its parent would recurse forever.
    if (parent && parent.id !== node.id) parent.children.push(node);
    else roots.push(node);
  }
  const sortRec = (nodes: PlaceNode[], depth: number) => {
    nodes.sort(
      (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name)
    );
    for (const n of nodes) {
      n.depth = depth;
      sortRec(n.children, depth + 1);
    }
  };
  sortRec(roots, 0);
  return roots;
}

/** Flatten a tree to a depth-ordered list — handy for indented <option>s. */
export function flattenTree(nodes: PlaceNode[]): PlaceNode[] {
  return nodes.flatMap((n) => [n, ...flattenTree(n.children)]);
}

/**
 * Ids of `id` and everything beneath it. Used to stop a place being reparented
 * into its own subtree, which would detach the whole branch from the root.
 */
export function subtreeIds(places: FilingPlace[], id: string): Set<string> {
  const childrenOf = new Map<string, string[]>();
  for (const p of places) {
    if (!p.parentId) continue;
    const list = childrenOf.get(p.parentId) ?? [];
    list.push(p.id);
    childrenOf.set(p.parentId, list);
  }
  const out = new Set<string>();
  const walk = (cur: string) => {
    if (out.has(cur)) return; // cycle guard
    out.add(cur);
    for (const child of childrenOf.get(cur) ?? []) walk(child);
  };
  walk(id);
  return out;
}

/**
 * Each place's count including everything nested under it. A cabinet whose four
 * drawers hold ten folders each holds forty — and says so. Without this a
 * cabinet reads "0 folders" while being full, which is wrong on screen and
 * wronger once it is printed onto the label stuck to its door.
 */
export function rollUpCounts(
  places: FilingPlace[],
  direct: Record<string, number>
): Record<string, number> {
  const childrenOf = new Map<string, string[]>();
  for (const p of places) {
    if (!p.parentId) continue;
    const list = childrenOf.get(p.parentId) ?? [];
    list.push(p.id);
    childrenOf.set(p.parentId, list);
  }
  const total: Record<string, number> = {};
  const walk = (id: string, seen: Set<string>): number => {
    const known = total[id];
    if (known !== undefined) return known;
    if (seen.has(id)) return 0; // cycle guard
    seen.add(id);
    let sum = direct[id] ?? 0;
    for (const child of childrenOf.get(id) ?? []) sum += walk(child, seen);
    total[id] = sum;
    return sum;
  };
  for (const p of places) walk(p.id, new Set());
  return total;
}
