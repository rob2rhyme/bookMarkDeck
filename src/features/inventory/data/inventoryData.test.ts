import { beforeEach, describe, expect, it, vi } from "vitest";

// Every main-collection subscription here used to adopt whatever a snapshot
// said, cache-only or not — a device opening offline, or whose local cache
// happened to answer empty before the real network round-trip, could have a
// hook wholesale-replace its state with that empty answer. Generalizes
// focusData.ts's subscribeHydration serverFirst guard from #348.
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(() => ({})),
  onSnapshot: vi.fn(() => () => {}),
}));
vi.mock("@/lib/firebase", () => ({
  db: {},
  ensureFirebaseGoogleAuth: vi.fn(async () => ({ uid: "u1" })),
}));

import { onSnapshot } from "firebase/firestore";
import { subscribeItems, subscribeLocations, subscribeWishlist } from "@/features/inventory/data/inventoryData";

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

beforeEach(() => vi.mocked(onSnapshot).mockClear());

describe.each([
  ["subscribeItems", subscribeItems],
  ["subscribeLocations", subscribeLocations],
  ["subscribeWishlist", subscribeWishlist],
] as const)("%s — cache-only guard", (_name, subscribe) => {
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
