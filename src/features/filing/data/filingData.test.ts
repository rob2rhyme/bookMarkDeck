import { beforeEach, describe, expect, it, vi } from "vitest";

// saveDocument writes with setDoc and no merge, so whatever it is handed
// REPLACES the cloud document. A partial record (rebuilt from the slim cache,
// missing its notes, obligations and history) must never get that far.
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(() => ({})),
  deleteDoc: vi.fn(),
  doc: vi.fn(() => ({})),
  getDoc: vi.fn(),
  getDocFromServer: vi.fn(),
  getDocs: vi.fn(),
  getDocsFromServer: vi.fn(),
  onSnapshot: vi.fn(() => () => {}),
  serverTimestamp: vi.fn(() => "ts"),
  setDoc: vi.fn(),
}));
vi.mock("@/lib/firebase", () => ({
  db: {},
  ensureFirebaseGoogleAuth: vi.fn(async () => ({ uid: "u1" })),
}));

import { onSnapshot, setDoc } from "firebase/firestore";
import {
  saveDocument,
  subscribeDocuments,
  subscribeFolders,
  subscribeParties,
  subscribePlaces,
} from "@/features/filing/data/filingData";
import type { CompleteDocument, FilingDocument } from "@/features/filing/lib/types";

const DOC: CompleteDocument = {
  id: "d1",
  title: "Passport",
  folderId: null,
  aliases: [],
  tags: [],
  obligations: [],
  createdAt: null,
  updatedAt: null,
};

beforeEach(() => vi.mocked(setDoc).mockReset());

describe("saveDocument", () => {
  it("writes a complete record", async () => {
    await saveDocument("a@example.com", DOC);
    expect(setDoc).toHaveBeenCalledTimes(1);
  });

  it("refuses a partial record at runtime, before touching Firestore", async () => {
    const partial: FilingDocument = { ...DOC, partial: true };
    await expect(
      // The type refuses it too: `npm run lint` fails if this stops being an error.
      // @ts-expect-error a FilingDocument is not a CompleteDocument
      saveDocument("a@example.com", partial)
    ).rejects.toThrow(/partial/);
    expect(setDoc).not.toHaveBeenCalled();
  });

  it("never persists the marker itself", async () => {
    await saveDocument("a@example.com", { ...DOC, partial: undefined });
    const payload = vi.mocked(setDoc).mock.calls[0][1] as Record<string, unknown>;
    expect("partial" in payload).toBe(false);
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
  ["subscribePlaces", subscribePlaces],
  ["subscribeParties", subscribeParties],
  ["subscribeFolders", subscribeFolders],
  ["subscribeDocuments", subscribeDocuments],
] as const)("%s — cache-only guard", (_name, subscribe) => {
  beforeEach(() => vi.mocked(onSnapshot).mockClear());

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
