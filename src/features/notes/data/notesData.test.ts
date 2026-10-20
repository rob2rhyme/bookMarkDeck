import { describe, expect, it, vi } from "vitest";

vi.mock("firebase/firestore", () => {
  class Timestamp {
    constructor(private d: Date) {}
    static fromDate(d: Date) {
      return new Timestamp(d);
    }
    toDate() {
      return this.d;
    }
  }
  return {
    Timestamp,
    collection: vi.fn(() => ({})),
    deleteDoc: vi.fn(),
    doc: vi.fn(() => ({})),
    getDocs: vi.fn(),
    onSnapshot: vi.fn(),
    setDoc: vi.fn(),
  };
});
vi.mock("@/lib/firebase", () => ({
  db: {},
  ensureFirebaseGoogleAuth: vi.fn(async () => ({ uid: "u1" })),
}));

import { collection, setDoc } from "firebase/firestore";
import { mapNote, saveNote, toFirestore } from "./notesData";
import type { Note } from "@/features/notes/lib/notes";

const NOTE: Note = {
  id: "n1",
  title: "Title",
  body: "Body",
  pinned: true,
  tags: ["x"],
  createdAt: "2026-10-01T08:00:00.000Z",
  updatedAt: "2026-10-02T09:30:00.000Z",
};

describe("notesData", () => {
  it("round-trips a note through the Firestore shape", () => {
    const stored = toFirestore(NOTE);
    expect(Object.keys(stored).sort()).toEqual(["body", "createdAt", "lock", "pinned", "tags", "title", "updatedAt"]);
    expect(stored.lock).toBeNull();
    // Client instants, not serverTimestamp(): a pending server time reads back
    // null locally and would sink the note being typed to the bottom of the list.
    expect(mapNote({ id: "n1", data: () => stored as unknown as Record<string, unknown> })).toEqual(NOTE);
  });

  it("maps a malformed document without throwing", () => {
    expect(mapNote({ id: "n2", data: () => ({ title: 7, tags: "nope" }) })).toMatchObject({
      id: "n2",
      title: "",
      body: "",
      pinned: false,
      tags: [],
    });
  });

  it("round-trips a locked note, which carries no body", () => {
    const lock = { kid: "v1", iv: "aXY=", ct: "Y3Q=" };
    const locked = { ...NOTE, body: "", lock };
    const stored = toFirestore(locked);
    expect(stored).toMatchObject({ body: "", lock });
    expect(mapNote({ id: "n1", data: () => stored as unknown as Record<string, unknown> })).toEqual(locked);
  });

  it("refuses to write a locked note's plaintext", () => {
    expect(() => toFirestore({ ...NOTE, lock: { kid: "v1", iv: "i", ct: "c" } })).toThrow(/plaintext/);
  });

  it("reads a locked document's stray body as empty", () => {
    const n = mapNote({ id: "n3", data: () => ({ body: "leaked?", lock: { kid: "v", iv: "i", ct: "c" } }) });
    expect(n?.body).toBe("");
  });

  it("writes to users/{uid}/notes/{id}", async () => {
    await saveNote("a@example.com", NOTE);
    expect(collection).toHaveBeenCalledWith({}, "users", "u1", "notes");
    expect(setDoc).toHaveBeenCalledTimes(1);
  });
});
