import { beforeEach, describe, expect, it, vi } from "vitest";

// Highlights ride the bookmark record, and the cloud path rebuilds each record from
// a whitelist of fields — so a field that isn't named there is silently lost on the
// way up and on the way back. These pin that highlights are named.
const saved: unknown[] = [];
let stored: unknown = null;

vi.mock("@/lib/firebase", () => ({ db: {}, ensureFirebaseGoogleAuth: async () => ({ uid: "u1" }) }));
vi.mock("firebase/firestore", () => ({
  Timestamp: class {
    static fromDate = (d: Date) => d;
  },
  addDoc: vi.fn(async () => ({})),
  collection: vi.fn(() => ({})),
  deleteDoc: vi.fn(async () => {}),
  doc: vi.fn(() => ({})),
  getDoc: vi.fn(async () => ({ exists: () => true, data: () => stored })),
  getDocs: vi.fn(async () => ({ docs: [] })),
  orderBy: vi.fn(),
  query: vi.fn(),
  serverTimestamp: () => "SERVER_TIME",
  setDoc: vi.fn(async (_ref: unknown, payload: unknown) => {
    saved.push(payload);
  }),
}));

import { fetchBookmarks, saveBookmarks } from "@/utils/firestoreBookmarks";

const bookmark = (over = {}) => ({ id: "b1", title: "T", url: "https://example.com", createdAt: "2026-01-01T00:00:00Z", ...over });

beforeEach(() => {
  saved.length = 0;
  stored = null;
});

describe("highlights through the cloud", () => {
  it("are sent up with the bookmark", async () => {
    await saveBookmarks("me@example.com", [bookmark({ highlights: [{ id: "h1", text: "a passage", createdAt: "2026-01-02T00:00:00Z" }] })] as never, []);
    const payload = saved[0] as { bookmarks: { highlights?: { id: string; text: string }[] }[] };
    expect(payload.bookmarks[0].highlights).toEqual([{ id: "h1", text: "a passage", createdAt: "2026-01-02T00:00:00Z" }]);
  });

  it("are left off a bookmark that has none, and junk is cleaned on the way up", async () => {
    await saveBookmarks("me@example.com", [bookmark(), bookmark({ id: "b2", highlights: [{ text: "x" }, 7] })] as never, []);
    const payload = saved[0] as { bookmarks: Record<string, unknown>[] };
    expect("highlights" in payload.bookmarks[0]).toBe(false);
    expect("highlights" in payload.bookmarks[1]).toBe(false);
  });

  it("come back down with the bookmark", async () => {
    stored = { bookmarks: [bookmark({ highlights: [{ id: "h1", text: "a passage", createdAt: "2026-01-02T00:00:00Z" }] })], folders: [] };
    const got = await fetchBookmarks("me@example.com");
    expect(got.bookmarks[0].highlights?.map((h) => h.text)).toEqual(["a passage"]);
  });
});

describe("the read-later queue through the cloud", () => {
  const queued = { readLaterAt: "2026-02-01T09:00:00.000Z" };
  const finished = { readLaterAt: "2026-02-01T09:00:00.000Z", readAt: "2026-02-03T09:00:00.000Z" };

  it("goes up with the bookmark, and junk is cleaned on the way", async () => {
    await saveBookmarks("me@example.com", [bookmark(queued), bookmark({ id: "b2", ...finished }), bookmark({ id: "b3", readLaterAt: "nope", readAt: 4 })] as never, []);
    const payload = saved[0] as { bookmarks: Record<string, unknown>[] };
    expect(payload.bookmarks[0]).toMatchObject(queued);
    expect(payload.bookmarks[1]).toMatchObject(finished);
    expect("readLaterAt" in payload.bookmarks[2]).toBe(false);
    expect("readAt" in payload.bookmarks[2]).toBe(false);
  });

  it("comes back down with it", async () => {
    stored = { bookmarks: [bookmark(finished)], folders: [] };
    const got = await fetchBookmarks("me@example.com");
    expect(got.bookmarks[0]).toMatchObject(finished);
  });
});
