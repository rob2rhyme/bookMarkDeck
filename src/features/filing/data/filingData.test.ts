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
  documentPayload,
  mapAttachment,
  mapDocument,
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


// A locked paper's reference and note live only as a sealed blob. The data layer is
// the last line: reads ignore plaintext beside a lock, and a write refuses it.
describe("a locked paper", () => {
  const LOCK = { kid: "v1", iv: "aXY=", ct: "Y3Q=" };

  it("round-trips the lock and writes confidential to match it", () => {
    const payload = documentPayload({ ...DOC, lock: LOCK });
    expect(payload).toMatchObject({ lock: LOCK, confidential: true });
    expect(payload).not.toHaveProperty("reference");
    const back = mapDocument({ id: "d1", data: () => ({ ...payload, createdAt: null }) as Record<string, unknown> });
    expect(back).toMatchObject({ lock: LOCK, confidential: true });
  });

  it("writes lock: null for an ordinary paper, so a removed lock leaves the cloud copy", () => {
    expect(documentPayload({ ...DOC, reference: "POL-1" })).toMatchObject({ lock: null, confidential: false, reference: "POL-1" });
  });

  it("refuses to write plaintext beside a lock — before touching Firestore", async () => {
    expect(() => documentPayload({ ...DOC, lock: LOCK, reference: "POL-1" })).toThrow(/plaintext/);
    expect(() => documentPayload({ ...DOC, lock: LOCK, note: "secret" })).toThrow(/plaintext/);
    await expect(saveDocument("a@example.com", { ...DOC, lock: LOCK, note: "secret" })).rejects.toThrow(/plaintext/);
    expect(setDoc).not.toHaveBeenCalled();
  });

  it("reads a stray plaintext field on a locked document as absent", () => {
    const read = mapDocument({
      id: "d1",
      data: () => ({ title: "Policy", lock: LOCK, reference: "POL-1", note: "leaked?" }),
    });
    expect(read.lock).toEqual(LOCK);
    expect(read.reference).toBeUndefined();
    expect(read.note).toBeUndefined();
  });

  it("drops a malformed lock rather than half-locking: the paper reads as ordinary", () => {
    const read = mapDocument({ id: "d1", data: () => ({ title: "Policy", lock: { kid: "v" }, reference: "POL-1" }) });
    expect(read.lock).toBeUndefined();
    expect(read.reference).toBe("POL-1");
  });
});


// A scan's pointer: the object's path is what matters now (a scan is read through a signed
// URL built from it), and a sealed one names its vault and carries its file name sealed.
describe("an attachment pointer", () => {
  const SEAL = { kid: "v1", iv: "aXY=", ct: "Y3Q=" };
  const read = (data: Record<string, unknown>) => mapAttachment({ id: "a1", data: () => data });

  it("reads a legacy pointer (public url, no enc) unchanged", () => {
    expect(read({ documentId: "d1", name: "scan.pdf", contentType: "application/pdf", size: 10, path: "filing/x/d1/y.pdf", url: "https://cdn/y.pdf" })).toMatchObject({
      path: "filing/x/d1/y.pdf",
      url: "https://cdn/y.pdf",
      enc: null,
    });
  });

  it("reads a new pointer with no url at all — the path is enough", () => {
    const a = read({ documentId: "d1", name: "Locked scan", contentType: "application/pdf", size: 10, path: "filing/x/d1/y.bin", enc: { kid: "v1", name: SEAL } });
    expect(a).not.toBeNull();
    expect(a).not.toHaveProperty("url");
    expect(a?.enc).toEqual({ kid: "v1", name: SEAL });
  });

  it("drops a pointer with no path, and reads a half-formed enc as NOT sealed rather than half-sealed", () => {
    expect(read({ name: "x", url: "https://cdn/y.pdf" })).toBeNull();
    for (const enc of [{ kid: "v1" }, { name: SEAL }, { kid: "", name: SEAL }, { kid: "v1", name: { kid: "v" } }, "yes", 7]) {
      expect(read({ path: "filing/x/y.bin", enc })?.enc).toBeNull();
    }
  });

  it("writes enc as null when a scan is not sealed, so a replaced pointer cannot keep a stale one", async () => {
    const { saveAttachment } = await import("@/features/filing/data/filingData");
    const base = { id: "a1", documentId: "d1", name: "scan.pdf", contentType: "application/pdf", size: 1, path: "filing/x/y.pdf", addedAt: null };
    await saveAttachment("a@example.com", base);
    const plain = vi.mocked(setDoc).mock.calls.at(-1)![1] as Record<string, unknown>;
    expect(plain.enc).toBeNull();
    expect(plain).not.toHaveProperty("url");
    await saveAttachment("a@example.com", { ...base, enc: { kid: "v1", name: SEAL } });
    expect((vi.mocked(setDoc).mock.calls.at(-1)![1] as Record<string, unknown>).enc).toEqual({ kid: "v1", name: SEAL });
  });
});
