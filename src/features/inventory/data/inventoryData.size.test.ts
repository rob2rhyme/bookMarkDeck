import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn(() => ({})),
  setDoc: vi.fn(async () => {}),
  serverTimestamp: () => ({ _methodName: "serverTimestamp" }),
}));
vi.mock("@/lib/firebase", () => ({
  db: {},
  ensureFirebaseGoogleAuth: vi.fn(async () => ({ uid: "u1" })),
}));

import { setDoc } from "firebase/firestore";
import { DocTooLargeError, MAX_DOC_BYTES } from "@/lib/docSize";
import type { InventoryItem, ItemActivity } from "@/features/inventory/lib/types";
import { itemDocBytes, saveItem, saveItemDoc } from "./inventoryData";

// Firestore refuses a document over 1 MiB on the server, after the write was
// accepted locally — the offline queue then drops it and the edit is lost. The
// writers refuse first, so nothing that can't land is ever sent.
const dataUrl = (chars: number) => `data:image/jpeg;base64,${"A".repeat(chars)}`;
const item = (over: Partial<InventoryItem> = {}): InventoryItem => ({
  id: "i1",
  name: "Camera",
  locationId: null,
  tags: [],
  quantity: 1,
  links: [],
  photos: [],
  lentTo: null,
  lentDate: null,
  dueDate: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: null,
  ...over,
});

beforeEach(() => vi.mocked(setDoc).mockClear());

describe("inventory items over Firestore's limit", () => {
  it("refuses one, without sending it", async () => {
    const big = item({ photos: [{ id: "p1", url: dataUrl(600_000) }, { id: "p2", url: dataUrl(600_000) }] });
    expect(itemDocBytes(big)).toBeGreaterThan(MAX_DOC_BYTES);
    await expect(saveItem("me@example.com", big)).rejects.toBeInstanceOf(DocTooLargeError);
    expect(setDoc).not.toHaveBeenCalled();
  });

  it("sends one that fits", async () => {
    await saveItem("me@example.com", item());
    expect(setDoc).toHaveBeenCalledTimes(1);
  });

  it("the form's own photo budget (700k characters of data: URLs) still fits beside a full history", () => {
    const activity: ItemActivity[] = Array.from({ length: 300 }, (_, n) => ({
      id: crypto.randomUUID(),
      type: "relocated",
      at: "2026-01-01T00:00:00.000Z",
      fromLoc: `Shelf ${n}`,
      toLoc: `Drawer ${n}`,
    }));
    const full = item({
      photos: [233_000, 233_000, 233_000].map((n, i) => ({ id: `p${i}`, url: dataUrl(n) })),
      activity,
      notes: "x".repeat(2_000),
    });
    expect(itemDocBytes(full)).toBeLessThan(MAX_DOC_BYTES);
  });
});

describe("item attachments over Firestore's limit", () => {
  it("refuses one held as a data: URL, without sending it", async () => {
    const doc = { id: "d1", itemId: "i1", name: "Receipt", kind: "receipt" as const, data: dataUrl(1_100_000), createdAt: null };
    await expect(saveItemDoc("me@example.com", doc)).rejects.toThrow(/^This attachment is 1\.\d\d MB/);
    expect(setDoc).not.toHaveBeenCalled();
  });
});
