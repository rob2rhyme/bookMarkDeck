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
  onSnapshot: vi.fn(() => () => {}),
  query: vi.fn(),
  serverTimestamp: vi.fn(() => "ts"),
  setDoc: vi.fn(),
  where: vi.fn(),
}));
vi.mock("@/lib/firebase", () => ({
  db: {},
  ensureFirebaseGoogleAuth: vi.fn(async () => ({ uid: "u1" })),
}));

import { onSnapshot } from "firebase/firestore";
import { subscribeHydration } from "@/features/focus/data/focusData";

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
