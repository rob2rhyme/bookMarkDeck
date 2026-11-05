import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn(() => ({})),
  getDocsFromServer: vi.fn(),
  onSnapshot: vi.fn(),
  setDoc: vi.fn(),
}));
vi.mock("@/lib/firebase", () => ({
  db: {},
  ensureFirebaseGoogleAuth: vi.fn(async () => ({ uid: "u1" })),
}));

import { collection, onSnapshot, setDoc } from "firebase/firestore";
import { saveVault, subscribeVaults } from "./vaultData";
import type { VaultRecord } from "./vault";

// The vault records are the only way into everything locked with them. A cache-only
// first answer offline reads as "no vault", and a hook that adopts it would offer to
// set up a second one over the first — the guard is the same one Notes' own
// subscription carries (moved here with the vault when Filing began sharing it).
type Snap = {
  docs: { id: string; data: () => Record<string, unknown> }[];
  metadata: { fromCache: boolean; hasPendingWrites: boolean };
};
const snap = (fromCache: boolean, hasPendingWrites = false): Snap => ({
  docs: [],
  metadata: { fromCache, hasPendingWrites },
});

async function attach() {
  const cb = vi.fn();
  subscribeVaults("a@example.com", cb);
  await vi.waitFor(() => expect(onSnapshot).toHaveBeenCalled());
  const call = vi.mocked(onSnapshot).mock.calls.at(-1) as unknown as [
    unknown,
    { includeMetadataChanges: boolean },
    (s: Snap) => void,
  ];
  return { cb, options: call[1], feed: call[2] };
}

describe("subscribeVaults — cache-only guard", () => {
  beforeEach(() => vi.mocked(onSnapshot).mockClear().mockReturnValue(() => {}));

  it("holds a cache-only first snapshot back until the server has answered", async () => {
    const { cb, options, feed } = await attach();
    expect(options.includeMetadataChanges).toBe(true);
    feed(snap(true));
    feed(snap(true));
    expect(cb).not.toHaveBeenCalled();
    feed(snap(false));
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("passes a later cache-only or pending-write snapshot through once confirmed", async () => {
    const { cb, feed } = await attach();
    feed(snap(false));
    feed(snap(true));
    feed(snap(false, true));
    expect(cb).toHaveBeenCalledTimes(3);
  });
});

describe("saveVault", () => {
  it("writes the record, without its id, to users/{uid}/notesVaults/{id}", async () => {
    const record = { id: "v1", v: 1, createdAt: "2026-11-05T00:00:00.000Z" } as unknown as VaultRecord;
    await saveVault("a@example.com", record);
    expect(collection).toHaveBeenCalledWith({}, "users", "u1", "notesVaults");
    const written = vi.mocked(setDoc).mock.calls.at(-1)![1] as Record<string, unknown>;
    expect(written).not.toHaveProperty("id");
    expect(written.v).toBe(1);
  });
});
