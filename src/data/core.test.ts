import { describe, expect, it } from "vitest";

import {
  blankItem,
  newestFirst,
  removeById,
  restoreAt,
  upsertById,
} from "./core";

const row = (id: string, createdAt = "2026-01-01") => ({ id, createdAt });

describe("upsertById / removeById / restoreAt", () => {
  it("prepends new rows and replaces existing in place", () => {
    const a = row("a");
    const b = row("b");
    expect(upsertById([a], b).map((r) => r.id)).toEqual(["b", "a"]);
    const a2 = { ...a, createdAt: "2026-02-02" };
    const out = upsertById([a, b], a2);
    expect(out.map((r) => r.id)).toEqual(["a", "b"]);
    expect(out[0].createdAt).toBe("2026-02-02");
  });

  it("removes and restores at the original index (undo)", () => {
    const rows = [row("a"), row("b"), row("c")];
    const { rows: rest, removed } = removeById(rows, "b");
    expect(rest.map((r) => r.id)).toEqual(["a", "c"]);
    expect(removed?.id).toBe("b");
    expect(restoreAt(rest, removed!, 1).map((r) => r.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
    // no duplicate if already present
    expect(restoreAt(rows, row("b"), 0)).toHaveLength(3);
    // missing id is a no-op
    expect(removeById(rows, "zz").removed).toBeNull();
  });
});

describe("blankItem / newestFirst", () => {
  it("builds a valid empty item and sorts newest first", () => {
    const it1 = blankItem("2026-07-17T00:00:00.000Z");
    expect(it1.quantity).toBe(1);
    expect(it1.tags).toEqual([]);
    expect(it1.id).not.toBe(blankItem("x").id);
    const sorted = newestFirst([
      row("old", "2026-01-01"),
      row("new", "2026-07-01"),
      { id: "none", createdAt: null },
    ]);
    expect(sorted.map((r) => r.id)).toEqual(["new", "old", "none"]);
  });
});
