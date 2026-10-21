import { beforeEach, describe, expect, it, vi } from "vitest";

// Offline, Firestore answers a new listener at once from this device's cache.
// A day record another device wrote while this one slept isn't in that cache,
// so the first answer said "missing" — and a merge against "missing" queued a
// write that replaced the other device's count on reconnect. Reproduced against
// the real SDK and the emulator; this pins the rule that closes it.
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(() => ({})),
  deleteDoc: vi.fn(),
  doc: vi.fn(() => ({})),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  increment: vi.fn((n: number) => ({ increment: n })),
  onSnapshot: vi.fn(() => () => {}),
  query: vi.fn(),
  runTransaction: vi.fn(),
  serverTimestamp: vi.fn(() => "ts"),
  setDoc: vi.fn(),
  where: vi.fn(),
}));
vi.mock("@/lib/firebase", () => ({
  db: {},
  ensureFirebaseGoogleAuth: vi.fn(async () => ({ uid: "u1" })),
}));

import { onSnapshot, runTransaction, setDoc } from "firebase/firestore";
import { addHydration, subscribeHydration } from "@/features/focus/data/focusData";

type Snap = { exists: () => boolean; data: () => { cups: number }; metadata: { fromCache: boolean } };
const snap = (cups: number | null, fromCache: boolean): Snap => ({
  exists: () => cups != null,
  data: () => ({ cups: cups as number }),
  metadata: { fromCache },
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

  it("passes every snapshot through when not asked to wait", async () => {
    const { cb, options, feed } = await attach();
    expect(options.includeMetadataChanges).toBe(false);
    feed(snap(null, true));
    expect(cb).toHaveBeenCalledWith(null);
  });
});

// A change owed to a day whose record was never read goes up as an increment:
// unlike an absolute count, it composes with what another device wrote.
describe("addHydration", () => {
  it("writes an increment, merged into the record", async () => {
    await addHydration("a@example.com", "2026-10-10", 2);
    expect(setDoc).toHaveBeenCalledWith(
      expect.anything(),
      { cups: { increment: 2 }, updatedAt: "ts" },
      { merge: true }
    );
  });

  it("reads a record an increment took below 0 as 0", async () => {
    const { cb, feed } = await attach();
    feed(snap(-1, false));
    expect(cb).toHaveBeenCalledWith(0);
  });
});

// A removal used to be a bare increment too, so two devices taking away the
// last cup at once left the record at -1 — it read as 0, but the next cup
// landed on 0. A removal now reads and writes in one transaction, floored at 0.
describe("addHydration — removals", () => {
  /** A one-record store that runTransaction reads and writes. */
  let stored: number | null;
  const writes: unknown[] = [];
  beforeEach(() => {
    stored = null;
    writes.length = 0;
    vi.mocked(setDoc).mockClear();
    vi.mocked(runTransaction).mockReset();
    vi.mocked(runTransaction).mockImplementation((async (_db: unknown, fn: (tx: unknown) => unknown) =>
      fn({
        get: async () => ({ exists: () => stored != null, data: () => ({ cups: stored }) }),
        set: (_ref: unknown, data: { cups: number }) => {
          writes.push(data);
          stored = data.cups;
        },
      })) as never);
  });

  it("floors the count at 0 when two devices remove the last cup", async () => {
    stored = 1;
    await addHydration("a@example.com", "2026-10-11", -1);
    await addHydration("a@example.com", "2026-10-11", -1); // the other device, a beat later
    expect(stored).toBe(0);
    await addHydration("a@example.com", "2026-10-11", 1); // the next cup
    expect(setDoc).toHaveBeenLastCalledWith(
      expect.anything(),
      { cups: { increment: 1 }, updatedAt: "ts" },
      { merge: true }
    );
  });

  it("takes a habit's clear off what is there, never below 0", async () => {
    stored = 2;
    await addHydration("a@example.com", "2026-10-11", -5);
    expect(stored).toBe(0);
  });

  it("falls back to the increment when the transaction can't run (offline)", async () => {
    vi.mocked(runTransaction).mockRejectedValueOnce(new Error("unavailable"));
    await addHydration("a@example.com", "2026-10-11", -1);
    expect(setDoc).toHaveBeenCalledWith(
      expect.anything(),
      { cups: { increment: -1 }, updatedAt: "ts" },
      { merge: true }
    );
  });

  it("adds a cup without a transaction, so it still works offline", async () => {
    await addHydration("a@example.com", "2026-10-11", 1);
    expect(runTransaction).not.toHaveBeenCalled();
  });

  it("repairs a record the server confirms below 0, and not a cached one", async () => {
    stored = -1;
    const { feed } = await attach();
    feed(snap(-1, true));
    expect(runTransaction).not.toHaveBeenCalled();
    feed(snap(-1, false));
    await vi.waitFor(() => expect(stored).toBe(0));
  });
});

