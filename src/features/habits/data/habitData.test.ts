import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(() => ({})),
  deleteDoc: vi.fn(),
  doc: vi.fn(() => ({})),
  getDocs: vi.fn(),
  onSnapshot: vi.fn(() => () => {}),
  query: vi.fn(),
  serverTimestamp: vi.fn(() => "ts"),
  setDoc: vi.fn(async () => {}),
  where: vi.fn(),
}));
vi.mock("@/lib/firebase", () => ({
  db: {},
  ensureFirebaseGoogleAuth: vi.fn(async () => ({ uid: "u1" })),
}));

import { onSnapshot, setDoc } from "firebase/firestore";
import { saveEntryCount, subscribeEntries, subscribeHabits } from "./habitData";

const entry = {
  id: "w_2026-10-11",
  habitId: "w",
  day: "2026-10-11",
  status: "done" as const,
  count: 5,
  createdAt: null,
};

// A count taken from a linked source can reach this device before the entry's
// note does (the hydration listener opens before the entries one). Writing the
// whole entry then erased a note and time logged on another device.
describe("saveEntryCount", () => {
  beforeEach(() => vi.mocked(setDoc).mockClear());

  it("writes the count and nothing the entry's other fields hold", async () => {
    await saveEntryCount("a@example.com", { ...entry, note: "", at: undefined });
    expect(setDoc).toHaveBeenCalledExactlyOnceWith(
      expect.anything(),
      { habitId: "w", day: "2026-10-11", status: "done", count: 5, updatedAt: "ts" },
      { merge: true }
    );
  });
});

// Both lists replace the hook's cached one wholesale; offline, a cache-only first
// answer was empty and emptied them until the server answered.
describe.each([
  ["subscribeHabits", subscribeHabits],
  ["subscribeEntries", subscribeEntries],
] as const)("%s — cache-only guard", (_name, subscribe) => {
  beforeEach(() => vi.mocked(onSnapshot).mockClear());
  const list = (fromCache: boolean) => ({ docs: [], metadata: { fromCache, hasPendingWrites: false } });

  it("holds cache-only answers back until the server has answered", async () => {
    const cb = vi.fn();
    subscribe("a@example.com", cb);
    await vi.waitFor(() => expect(onSnapshot).toHaveBeenCalled());
    const [, options, feed] = vi.mocked(onSnapshot).mock.calls[0] as unknown as [
      unknown,
      { includeMetadataChanges: boolean },
      (s: ReturnType<typeof list>) => void,
    ];
    expect(options.includeMetadataChanges).toBe(true);
    feed(list(true));
    expect(cb).not.toHaveBeenCalled();
    feed(list(false));
    feed(list(true));
    expect(cb).toHaveBeenCalledTimes(2);
  });
});
