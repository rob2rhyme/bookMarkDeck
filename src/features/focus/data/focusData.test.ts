import { beforeEach, describe, expect, it, vi } from "vitest";

// Offline, Firestore answers a new listener at once from this device's cache.
// A day record another device wrote while this one slept isn't in that cache,
// so the first answer said "missing" — and a merge against "missing" queued a
// write that replaced the other device's count on reconnect. Reproduced against
// the real SDK and the emulator; this pins the rule that closes it.
const batch = vi.hoisted(() => ({
  set: vi.fn(),
  commit: vi.fn(async () => {}),
}));
const tx = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }));
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(() => ({})),
  deleteDoc: vi.fn(),
  doc: vi.fn(() => ({})),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  increment: vi.fn((n: number) => ({ increment: n })),
  maximum: vi.fn((n: number) => ({ maximum: n })),
  onSnapshot: vi.fn(() => () => {}),
  query: vi.fn(),
  runTransaction: vi.fn(async (_db: unknown, fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  serverTimestamp: vi.fn(() => "ts"),
  setDoc: vi.fn(),
  where: vi.fn(),
  writeBatch: vi.fn(() => batch),
}));
vi.mock("@/lib/firebase", () => ({
  db: {},
  ensureFirebaseGoogleAuth: vi.fn(async () => ({ uid: "u1" })),
}));

import { getDoc, onSnapshot } from "firebase/firestore";
import {
  addHydration,
  fetchHydration,
  recoverHydration,
  subscribeHydration,
  subscribeHydrationHistory,
  subscribeJournal,
  subscribeNotes,
  subscribeTasks,
  subscribeTodos,
} from "@/features/focus/data/focusData";

type Snap = {
  exists: () => boolean;
  data: () => { cups: number };
  metadata: { fromCache: boolean; hasPendingWrites: boolean };
};
const snap = (cups: number | null, fromCache: boolean, hasPendingWrites = false): Snap => ({
  exists: () => cups != null,
  data: () => ({ cups: cups as number }),
  metadata: { fromCache, hasPendingWrites },
});

/** Subscribe, wait for the listener to attach, and hand back its snapshot feed. */
async function attach(opts?: { serverFirst?: boolean }) {
  const cb = vi.fn();
  subscribeHydration("a@example.com", "2026-10-11", cb, opts);
  await vi.waitFor(() => expect(onSnapshot).toHaveBeenCalled());
  const call = vi.mocked(onSnapshot).mock.calls[0] as unknown as [
    unknown,
    { includeMetadataChanges: boolean },
    (s: Snap) => void,
  ];
  return { cb, options: call[1], feed: call[2] };
}

beforeEach(() => vi.mocked(onSnapshot).mockClear());

describe("subscribeHydration — serverFirst", () => {
  it("holds cache-only answers back until the server has answered", async () => {
    const { cb, feed } = await attach({ serverFirst: true });
    feed(snap(null, true)); // offline: "missing", from the cache
    feed(snap(2, true));
    expect(cb).not.toHaveBeenCalled();
    feed(snap(3, false)); // the server's view
    expect(cb).toHaveBeenLastCalledWith(3);
    feed(snap(4, true)); // after that, everything — a later offline echo included
    expect(cb).toHaveBeenLastCalledWith(4);
  });

  it("hears the server confirm a record really is missing", async () => {
    const { cb, options, feed } = await attach({ serverFirst: true });
    // A metadata-only change (fromCache true → false, same data) is delivered
    // only when metadata changes are listened for.
    expect(options.includeMetadataChanges).toBe(true);
    feed(snap(null, true));
    feed(snap(null, false));
    expect(cb).toHaveBeenCalledExactlyOnceWith(null);
  });

  // The SDK lays a pending increment over the count cached when it was made:
  // a day never read reads as 0 + 1 until the write is acknowledged.
  it("holds back a snapshot carrying this page's unacknowledged writes", async () => {
    const { cb, feed } = await attach({ serverFirst: true });
    feed(snap(1, false, true)); // the server has answered, but over a stale base
    expect(cb).not.toHaveBeenCalled();
    feed(snap(6, false)); // acknowledged
    expect(cb).toHaveBeenCalledExactlyOnceWith(6);
    feed(snap(7, true, true)); // offline, a later change of its own
    expect(cb).toHaveBeenCalledOnce();
  });

  it("passes every snapshot through when not asked to wait", async () => {
    const { cb, options, feed } = await attach();
    expect(options.includeMetadataChanges).toBe(false);
    feed(snap(null, true));
    expect(cb).toHaveBeenCalledWith(null);
    feed(snap(2, true, true));
    expect(cb).toHaveBeenLastCalledWith(2);
  });
});

// The chart took every snapshot, including one carrying this page's
// unacknowledged cup — laid, as subscribeHydration explains, over a stale count.
describe("subscribeHydrationHistory", () => {
  const days = (cups: number, hasPendingWrites: boolean) => ({
    docs: [{ id: "2026-10-11", data: () => ({ cups }) }],
    metadata: { fromCache: false, hasPendingWrites },
  });

  it("holds back a snapshot carrying this page's unacknowledged writes", async () => {
    const cb = vi.fn();
    subscribeHydrationHistory("a@example.com", cb);
    await vi.waitFor(() => expect(onSnapshot).toHaveBeenCalled());
    const [, options, feed] = vi.mocked(onSnapshot).mock.calls[0] as unknown as [
      unknown,
      { includeMetadataChanges: boolean },
      (s: ReturnType<typeof days>) => void,
    ];
    // Acknowledged with the same count, only the metadata changes.
    expect(options.includeMetadataChanges).toBe(true);
    feed(days(1, true));
    expect(cb).not.toHaveBeenCalled();
    feed(days(6, false));
    expect(cb).toHaveBeenCalledExactlyOnceWith([{ day: "2026-10-11", cups: 6 }]);
  });
});

// Every routine change is an increment, so changes from several devices add up
// instead of the last writer's count replacing the others'. Each carries its
// receipt in the same atomic write, which is how a page that finds a change
// left behind tells "landed, acknowledgement lost" from "never sent".
describe("addHydration", () => {
  beforeEach(() => {
    batch.set.mockClear();
    batch.commit.mockClear();
  });

  it("adds the change and its receipt in one write", async () => {
    await addHydration("a@example.com", "2026-10-10", 1, "op-1");
    expect(batch.set).toHaveBeenCalledExactlyOnceWith(
      expect.anything(),
      { cups: { increment: 1 }, updatedAt: "ts", ops: { "op-1": 1 } },
      { merge: true }
    );
    expect(batch.commit).toHaveBeenCalledOnce();
  });

  // Without the clamp a removal reaching an empty record leaves -1, and that
  // debt silently eats the next cup anyone logs.
  it("clamps a removal at 0 in the same write", async () => {
    await addHydration("a@example.com", "2026-10-10", -1, "op-2");
    expect(batch.set).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      { cups: { increment: -1 }, updatedAt: "ts", ops: { "op-2": -1 } },
      { merge: true }
    );
    expect(batch.set).toHaveBeenNthCalledWith(2, expect.anything(), { cups: { maximum: 0 } }, {
      merge: true,
    });
    expect(batch.commit).toHaveBeenCalledOnce();
  });

  it("reads a record an increment took below 0 as 0", async () => {
    const { cb, feed } = await attach();
    feed(snap(-1, false));
    expect(cb).toHaveBeenCalledWith(0);
  });
});

// A change found in the outbox may already have landed, its acknowledgement
// lost. It is delivered in a transaction — a read of the server itself, not of
// an open listener's view, which can lag the write it is looking for — and
// only if its receipt isn't there.
describe("recoverHydration", () => {
  const record = (data: object | null) =>
    tx.get.mockResolvedValueOnce({ exists: () => data != null, data: () => data });
  beforeEach(() => tx.set.mockClear());

  it("applies a change whose receipt isn't on the server, with its receipt", async () => {
    record({ cups: 3, ops: { a: 1 } });
    await recoverHydration("a@example.com", "2026-10-10", 1, "b");
    expect(tx.set).toHaveBeenCalledExactlyOnceWith(
      expect.anything(),
      { cups: 4, updatedAt: "ts", ops: { b: 1 } },
      { merge: true }
    );
  });

  it("writes nothing when the receipt is already there", async () => {
    record({ cups: 3, ops: { a: 1 } });
    await recoverHydration("a@example.com", "2026-10-10", 1, "a");
    expect(tx.set).not.toHaveBeenCalled();
  });

  it("starts a missing record from 0, and clamps a removal there", async () => {
    record(null);
    await recoverHydration("a@example.com", "2026-10-10", -1, "c");
    expect(tx.set).toHaveBeenCalledWith(
      expect.anything(),
      { cups: 0, updatedAt: "ts", ops: { c: -1 } },
      { merge: true }
    );
  });
});

describe("fetchHydration", () => {
  const answer = (cups: number, hasPendingWrites: boolean) =>
    vi.mocked(getDoc).mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ cups }),
      metadata: { hasPendingWrites, fromCache: false },
    } as never);

  it("reads the day's count", async () => {
    answer(5, false);
    expect(await fetchHydration("a@example.com", "2026-10-10")).toBe(5);
  });

  // The SDK lays a pending increment over a stale count: against the emulator a
  // day never read answered 1 with the server at 6.
  it("answers nothing while this page has a change to the day unacknowledged", async () => {
    answer(1, true);
    expect(await fetchHydration("a@example.com", "2026-10-10")).toBeUndefined();
  });
});

// Each of these lists replaces the hook's cached one wholesale. Offline, the
// first answer is the memory cache's — empty on a fresh load — and it emptied
// the list (and the device cache with it) until the server answered.
describe.each([
  ["subscribeTasks", subscribeTasks],
  ["subscribeJournal", subscribeJournal],
  ["subscribeNotes", subscribeNotes],
  ["subscribeTodos", subscribeTodos],
] as const)("%s — cache-only guard", (_name, subscribe) => {
  const list = (fromCache: boolean) => ({ docs: [], metadata: { fromCache, hasPendingWrites: false } });

  it("holds cache-only answers back until the server has answered", async () => {
    const cb = vi.fn();
    (subscribe as (e: string, cb: () => void) => unknown)("a@example.com", cb);
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
