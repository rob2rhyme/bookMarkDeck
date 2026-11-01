import { describe, expect, it } from "vitest";

import { conflictCopy, planReconnect, textDiffers } from "./conflicts";
import type { Note } from "./notes";

const T = (h: number) => new Date(Date.UTC(2026, 9, 21, h)).toISOString();
const note = (id: string, over: Partial<Note> = {}): Note => ({
  id,
  title: id,
  body: "",
  pinned: false,
  tags: [],
  createdAt: T(0),
  updatedAt: T(1),
  ...over,
});
const NOW = new Date(T(9));
const ids = () => {
  let i = 0;
  return () => `copy-${++i}`;
};

describe("planReconnect", () => {
  it("uploads an offline edit when the cloud hasn't moved since this device last saw it", () => {
    const local = note("a", { body: "mine", updatedAt: T(3) });
    const cloud = new Map([["a", note("a", { body: "old", updatedAt: T(1) })]]);
    expect(planReconnect([local], cloud, { a: T(1) }, NOW, ids())).toEqual({ push: [local], copies: [], superseded: [] });
  });

  it("keeps both when another device edited too — this device newer: it wins, theirs becomes a copy", () => {
    const local = note("a", { body: "mine", updatedAt: T(4) });
    const remote = note("a", { body: "theirs", updatedAt: T(3), tags: ["work"] });
    const plan = planReconnect([local], new Map([["a", remote]]), { a: T(1) }, NOW, ids());
    expect(plan.push).toEqual([local]);
    expect(plan.superseded).toEqual([]);
    expect(plan.copies).toEqual([
      expect.objectContaining({ id: "copy-1", title: "a (conflicted copy)", body: "theirs", tags: ["work", "conflict"] }),
    ]);
  });

  it("keeps both when another device edited too — theirs newer: it stays, this device's becomes a copy", () => {
    const local = note("a", { body: "mine", updatedAt: T(3) });
    const remote = note("a", { body: "theirs", updatedAt: T(4) });
    const plan = planReconnect([local], new Map([["a", remote]]), { a: T(1) }, NOW, ids());
    expect(plan.push).toEqual([]);
    expect(plan.superseded).toEqual(["a"]);
    expect(plan.copies[0]).toMatchObject({ body: "mine", activity: [{ kind: "conflict" }] });
  });

  it("is no conflict when only pins or tags differ, or the text ended up the same", () => {
    const local = note("a", { body: "same", pinned: true, updatedAt: T(4) });
    const remote = note("a", { body: "same", tags: ["x"], updatedAt: T(3) });
    expect(planReconnect([local], new Map([["a", remote]]), { a: T(1) }, NOW, ids()).copies).toEqual([]);
  });

  it("leaves locked notes and notes with no recorded base to the last writer", () => {
    const lock = { kid: "v", iv: "i", ct: "c1" };
    const locked = note("l", { lock, updatedAt: T(4) });
    const unknown = note("u", { body: "mine", updatedAt: T(4) });
    const cloud = new Map([
      ["l", note("l", { lock: { ...lock, ct: "c2" }, updatedAt: T(3) })],
      ["u", note("u", { body: "theirs", updatedAt: T(3) })],
    ]);
    const plan = planReconnect([locked, unknown], cloud, { l: T(1) }, NOW, ids());
    expect(plan).toEqual({ push: [locked, unknown], copies: [], superseded: [] });
  });

  it("uploads a note the cloud never had", () => {
    const fresh = note("new");
    expect(planReconnect([fresh], new Map(), {}, NOW, ids()).push).toEqual([fresh]);
  });
});

describe("conflictCopy", () => {
  it("is a new, unpinned note dated now, titled so it's recognisable", () => {
    const copy = conflictCopy(note("x", { title: "", pinned: true }), NOW, "id1");
    expect(copy).toMatchObject({ id: "id1", title: "Untitled (conflicted copy)", pinned: false, createdAt: T(9), updatedAt: T(9) });
    expect(textDiffers(copy, { ...copy, body: "changed" })).toBe(true);
  });
});
