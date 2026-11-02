import { beforeEach, describe, expect, it, vi } from "vitest";

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

import { collection, onSnapshot, setDoc } from "firebase/firestore";
import { mapNote, saveNote, subscribeNotes, subscribeVaults, toFirestore } from "./notesData";
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
    expect(Object.keys(stored).sort()).toEqual([
      "activity",
      "body",
      "createdAt",
      "lock",
      "pinned",
      "tags",
      "title",
      "updatedAt",
    ]);
    expect(stored.lock).toBeNull();
    // Client instants, not serverTimestamp(): a pending server time reads back
    // null locally and would sink the note being typed to the bottom of the list.
    expect(mapNote({ id: "n1", data: () => stored as unknown as Record<string, unknown> })).toEqual(NOTE);
  });

  it("round-trips a note's history", () => {
    const withHistory = {
      ...NOTE,
      activity: [
        { at: "2026-10-01T00:00:00.000Z", kind: "created" as const },
        { at: "2026-10-02T00:00:00.000Z", kind: "edited" as const, n: 3, from: "2026-10-01T23:50:00.000Z" },
      ],
    };
    const stored = toFirestore(withHistory);
    expect(mapNote({ id: "n1", data: () => stored as unknown as Record<string, unknown> })).toEqual(withHistory);
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

// Every main-collection subscription here used to adopt whatever a snapshot
// said, cache-only or not — a device opening offline, or whose local cache
// happened to answer empty before the real network round-trip, could have a
// hook wholesale-replace its state with that empty answer. Generalizes
// focusData.ts's subscribeHydration serverFirst guard from #348.
type Snap = {
  docs: { id: string; data: () => Record<string, unknown> }[];
  metadata: { fromCache: boolean; hasPendingWrites: boolean };
};
const snap = (fromCache: boolean, hasPendingWrites = false): Snap => ({
  docs: [],
  metadata: { fromCache, hasPendingWrites },
});

/** Subscribe, wait for the listener to attach, and hand back its snapshot feed. */
async function attach(subscribe: (email: string, cb: (v: unknown[]) => void) => unknown) {
  const cb = vi.fn();
  subscribe("a@example.com", cb);
  await vi.waitFor(() => expect(onSnapshot).toHaveBeenCalled());
  const call = vi.mocked(onSnapshot).mock.calls.at(-1) as unknown as [
    unknown,
    { includeMetadataChanges: boolean },
    (s: Snap) => void,
  ];
  return { cb, options: call[1], feed: call[2] };
}

describe.each([
  ["subscribeNotes", subscribeNotes],
  ["subscribeVaults", subscribeVaults],
] as const)("%s — cache-only guard", (_name, subscribe) => {
  beforeEach(() => vi.mocked(onSnapshot).mockClear().mockReturnValue(() => {}));

  it("holds a cache-only first snapshot back until the server has answered", async () => {
    const { cb, options, feed } = await attach(subscribe);
    expect(options.includeMetadataChanges).toBe(true);
    feed(snap(true));
    feed(snap(true));
    expect(cb).not.toHaveBeenCalled();
    feed(snap(false));
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("passes a later cache-only or pending-write snapshot through once confirmed", async () => {
    const { cb, feed } = await attach(subscribe);
    feed(snap(false)); // confirmed
    feed(snap(true)); // a later offline blip
    feed(snap(false, true)); // this page's own unacknowledged write
    expect(cb).toHaveBeenCalledTimes(3);
  });
});
