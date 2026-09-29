import { beforeEach, describe, expect, it, vi } from "vitest";

// saveDocument writes with setDoc and no merge, so whatever it is handed
// REPLACES the cloud document. A partial record (rebuilt from the slim cache,
// missing its notes, obligations and history) must never get that far.
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(() => ({})),
  deleteDoc: vi.fn(),
  doc: vi.fn(() => ({})),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  onSnapshot: vi.fn(),
  serverTimestamp: vi.fn(() => "ts"),
  setDoc: vi.fn(),
}));
vi.mock("@/lib/firebase", () => ({
  db: {},
  ensureFirebaseGoogleAuth: vi.fn(async () => ({ uid: "u1" })),
}));

import { setDoc } from "firebase/firestore";
import { saveDocument } from "@/features/filing/data/filingData";
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
