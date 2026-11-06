import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase", () => ({ db: {}, ensureFirebaseGoogleAuth: async () => ({ uid: "u1" }) }));
vi.mock("firebase/firestore", () => ({
  Timestamp: class {
    static fromDate = (d: Date) => d;
  },
  addDoc: vi.fn(async () => ({})),
  collection: vi.fn(() => ({})),
  deleteDoc: vi.fn(async () => {}),
  doc: vi.fn(() => ({})),
  getDocs: vi.fn(async () => ({ docs: [] })),
  orderBy: vi.fn(),
  query: vi.fn(),
  serverTimestamp: () => "SERVER_TIME",
  setDoc: vi.fn(async () => {}),
}));

import { addDoc, setDoc } from "firebase/firestore";
import { DocTooLargeError } from "@/lib/docSize";
import { saveBookmarks } from "@/utils/firestoreBookmarks";

// A library over one document (1 MiB) is now split into chunks (see
// firestoreBookmarks.chunks.test.ts). What is still refused — before either copy is
// written, with a message that says what to do — is a library too big even for that,
// and shortcuts that alone outgrow the root document.
const library = (n: number, note = "") =>
  Array.from({ length: n }, (_, i) => ({
    id: `b${i}`,
    title: `Bookmark ${i}`,
    url: `https://example.com/${i}`,
    createdAt: "2026-01-01T00:00:00Z",
    ...(note ? { note } : {}),
  }));

beforeEach(() => {
  vi.mocked(addDoc).mockClear();
  vi.mocked(setDoc).mockClear();
});

describe("a bookmark library over what can be saved", () => {
  it("is refused before either copy is written, and says nothing left the device", async () => {
    const err = await saveBookmarks("me@example.com", library(40_000, "n".repeat(300)) as never, []).catch((e) => e);
    expect(err).toBeInstanceOf(DocTooLargeError);
    expect((err as Error).message).toMatch(/^Your bookmark library is \d+\.\d\d MB, and one saved record holds up to 1 MB\. Nothing was uploaded/);
    expect(addDoc).not.toHaveBeenCalled();
    expect(setDoc).not.toHaveBeenCalled();
  });

  it("counts the shortcuts that share its document", async () => {
    const shortcuts = Array.from({ length: 5_000 }, (_, i) => ({ id: `s${i}`, name: "n".repeat(200), url: `https://example.com/${i}` }));
    await expect(saveBookmarks("me@example.com", library(10) as never, [], shortcuts as never)).rejects.toBeInstanceOf(DocTooLargeError);
    expect(setDoc).not.toHaveBeenCalled();
  });

  it("writes a library that fits", async () => {
    await saveBookmarks("me@example.com", library(100) as never, []);
    expect(addDoc).toHaveBeenCalledTimes(1);
    expect(setDoc).toHaveBeenCalledTimes(1);
  });
});
