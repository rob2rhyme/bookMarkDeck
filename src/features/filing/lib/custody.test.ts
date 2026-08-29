import { describe, expect, it } from "vitest";

import {
  checkOutPatch,
  custodyItems,
  isOverdueBack,
  overdueBackCount,
  returnPatch,
} from "@/features/filing/lib/custody";
import type { FilingFolder } from "@/features/filing/lib/types";

const folder = (over: Partial<FilingFolder> = {}): FilingFolder => ({
  id: "f1",
  name: "Vehicles",
  homePlaceId: "drawer2",
  currentPlaceId: null,
  parentId: null,
  aliases: [],
  tags: [],
  createdAt: null,
  updatedAt: null,
  ...over,
});

describe("checkOutPatch", () => {
  it("records where it went, who has it and when it's wanted back", () => {
    expect(
      checkOutPatch({ toPlaceId: "desk", heldBy: "Dad", dueBack: "2026-09-10", on: "2026-08-27" })
    ).toEqual({
      currentPlaceId: "desk",
      heldBy: "Dad",
      takenAt: "2026-08-27",
      dueBack: "2026-09-10",
    });
  });

  it("trims a name and treats blank as nobody", () => {
    expect(checkOutPatch({ toPlaceId: null, heldBy: "  ", on: "2026-08-27" }).heldBy).toBeNull();
    expect(checkOutPatch({ toPlaceId: null, heldBy: " Mom ", on: "2026-08-27" }).heldBy).toBe("Mom");
  });

  it("drops a malformed due-back date rather than storing it", () => {
    expect(checkOutPatch({ toPlaceId: "desk", dueBack: "soon", on: "2026-08-27" }).dueBack).toBeNull();
  });

  it("supports going out to nowhere in particular", () => {
    // "It's not in the drawer and I don't know where" is still useful to record.
    const p = checkOutPatch({ toPlaceId: null, heldBy: "Dad", on: "2026-08-27" });
    expect(p.currentPlaceId).toBeNull();
  });
});

describe("returnPatch", () => {
  it("clears the whole custody record", () => {
    expect(returnPatch()).toEqual({
      currentPlaceId: null,
      heldBy: null,
      takenAt: null,
      dueBack: null,
    });
  });

  it("makes a checked-out folder read as home again", () => {
    const out = folder({ currentPlaceId: "desk", heldBy: "Dad", dueBack: "2020-01-01" });
    const home = { ...out, ...returnPatch() };
    expect(isOverdueBack(home, "2026-08-27")).toBe(false);
    expect(custodyItems([home], "2026-08-27")).toHaveLength(0);
  });
});

describe("isOverdueBack", () => {
  it("is true only when it is out AND past its date", () => {
    expect(isOverdueBack(folder({ currentPlaceId: "desk", dueBack: "2026-08-01" }), "2026-08-27")).toBe(true);
    expect(isOverdueBack(folder({ currentPlaceId: "desk", dueBack: "2026-09-01" }), "2026-08-27")).toBe(false);
  });

  it("is false on the due date itself", () => {
    expect(isOverdueBack(folder({ currentPlaceId: "desk", dueBack: "2026-08-27" }), "2026-08-27")).toBe(false);
  });

  it("is false with no date, and false at home whatever the date says", () => {
    expect(isOverdueBack(folder({ currentPlaceId: "desk" }), "2026-08-27")).toBe(false);
    expect(isOverdueBack(folder({ dueBack: "2020-01-01" }), "2026-08-27")).toBe(false);
  });

  it("treats current === home as home, not as out", () => {
    const f = folder({ homePlaceId: "drawer2", currentPlaceId: "drawer2", dueBack: "2020-01-01" });
    expect(isOverdueBack(f, "2026-08-27")).toBe(false);
  });
});

describe("custodyItems", () => {
  it("lists only what is away from home", () => {
    const items = custodyItems(
      [
        folder({ id: "home" }),
        folder({ id: "same", currentPlaceId: "drawer2" }),
        folder({ id: "out", currentPlaceId: "desk" }),
      ],
      "2026-08-27"
    );
    expect(items.map((i) => i.folder.id)).toEqual(["out"]);
  });

  it("skips archived folders", () => {
    expect(custodyItems([folder({ currentPlaceId: "desk", archived: true })], "2026-08-27")).toHaveLength(0);
  });

  it("counts days out and days remaining", () => {
    const [item] = custodyItems(
      [folder({ currentPlaceId: "desk", takenAt: "2026-08-20", dueBack: "2026-09-03" })],
      "2026-08-27"
    );
    expect(item.daysOut).toBe(7);
    expect(item.daysAway).toBe(7);
    expect(item.overdue).toBe(false);
  });

  it("leaves the counters null when the dates were never recorded", () => {
    const [item] = custodyItems([folder({ currentPlaceId: "desk" })], "2026-08-27");
    expect(item.daysOut).toBeNull();
    expect(item.daysAway).toBeNull();
    expect(item.overdue).toBe(false);
  });

  it("puts late folders first, then soonest due, then undated", () => {
    const items = custodyItems(
      [
        folder({ id: "undated", name: "B", currentPlaceId: "desk" }),
        folder({ id: "later", currentPlaceId: "desk", dueBack: "2026-12-01" }),
        folder({ id: "late", currentPlaceId: "desk", dueBack: "2026-08-01" }),
        folder({ id: "soon", currentPlaceId: "desk", dueBack: "2026-08-28" }),
      ],
      "2026-08-27"
    );
    expect(items.map((i) => i.folder.id)).toEqual(["late", "soon", "later", "undated"]);
  });

  it("counts the overdue ones", () => {
    const folders = [
      folder({ id: "a", currentPlaceId: "desk", dueBack: "2026-08-01" }),
      folder({ id: "b", currentPlaceId: "desk", dueBack: "2026-08-02" }),
      folder({ id: "c", currentPlaceId: "desk", dueBack: "2026-12-01" }),
      folder({ id: "d" }),
    ];
    expect(overdueBackCount(folders, "2026-08-27")).toBe(2);
  });
});
