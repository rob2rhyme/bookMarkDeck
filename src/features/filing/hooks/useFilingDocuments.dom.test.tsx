import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FilingDocument } from "@/features/filing/lib/types";

// The slim on-device cache drops a paper's obligations, note, reference,
// aliases and history. Two ways that used to destroy data:
//  - unsynced, every reload silently dropped them for good;
//  - synced, an edit before the first snapshot wrote the stripped record over
//    the full cloud copy (setDoc, no merge).
vi.mock("@/features/filing/data/filingData", () => ({
  fetchDocuments: vi.fn(),
  saveDocument: vi.fn(),
  deleteDocument: vi.fn(),
  subscribeDocuments: vi.fn(),
}));

import {
  fetchDocuments,
  saveDocument,
  subscribeDocuments,
} from "@/features/filing/data/filingData";
import { useFilingDocuments } from "./useFilingDocuments";

const EMAIL = "a@example.com";
const KEY = `bookmarkdeck:filing:documents:v1:${EMAIL}`;
const OBLIGATION = { kind: "renew" as const, label: "Renew", dueOn: "2027-03-01" };

/** A paper as the cloud holds it — every field present. */
const FULL: FilingDocument = {
  id: "doc-1",
  title: "Passport",
  folderId: null,
  reference: "P1234567",
  aliases: ["travel"],
  tags: [],
  note: "Blue folder, top drawer",
  obligations: [{ id: "ob-1", ...OBLIGATION }],
  activity: [{ id: "act-1", type: "filed", at: "2025-01-01T00:00:00Z" }],
  createdAt: "2025-01-01T00:00:00Z",
  updatedAt: null,
};

/** What the old cache format (and a synced account's cache) holds for FULL. */
const SLIM = { id: FULL.id, title: FULL.title, folderId: null, tags: [] };

let deliver: (docs: FilingDocument[]) => void;

beforeEach(() => {
  window.localStorage.clear();
  vi.mocked(saveDocument).mockReset().mockResolvedValue(undefined);
  vi.mocked(fetchDocuments).mockReset().mockResolvedValue([FULL]);
  vi.mocked(subscribeDocuments).mockReset().mockImplementation((_email, cb) => {
    deliver = cb;
    return () => {};
  });
});

const saved = () => vi.mocked(saveDocument).mock.calls.map(([, d]) => d);
const mount = (connected: boolean) =>
  renderHook(() => useFilingDocuments(EMAIL, connected));

describe("unsynced", () => {
  it("keeps obligations, notes and references across a reload", async () => {
    const first = mount(false);
    await waitFor(() => expect(first.result.current.hydrated).toBe(true));
    let id = "";
    act(() => {
      id = first.result.current.addDocument({
        title: "Car insurance",
        reference: "POL-9",
        note: "Renews with the car",
      })!.id;
    });
    act(() => first.result.current.addObligation(id, OBLIGATION));
    first.unmount();

    const second = mount(false);
    await waitFor(() => expect(second.result.current.documents).toHaveLength(1));
    const [doc] = second.result.current.documents;
    expect(doc.obligations).toHaveLength(1);
    expect(doc.reference).toBe("POL-9");
    expect(doc.note).toBe("Renews with the car");
    expect(doc.activity?.length).toBeGreaterThan(0);
  });

  it("keeps a reminder added to a paper from the old slim cache", async () => {
    window.localStorage.setItem(KEY, JSON.stringify([SLIM]));
    const first = mount(false);
    await waitFor(() => expect(first.result.current.documents).toHaveLength(1));
    act(() => first.result.current.addObligation(FULL.id, OBLIGATION));
    first.unmount();

    const second = mount(false);
    await waitFor(() => expect(second.result.current.documents).toHaveLength(1));
    expect(second.result.current.documents[0].obligations).toHaveLength(1);
    // Still marked: the edit happened without the cloud copy, so it must never
    // become eligible to overwrite that copy.
    expect(second.result.current.documents[0].partial).toBe(true);
  });
});

describe("synced, before the first snapshot", () => {
  async function loadedFromSlimCache() {
    window.localStorage.setItem(KEY, JSON.stringify([SLIM]));
    const hook = mount(true);
    await waitFor(() => expect(subscribeDocuments).toHaveBeenCalled());
    return hook;
  }

  it("never writes a partial record over the cloud copy", async () => {
    const { result } = await loadedFromSlimCache();

    act(() => {
      result.current.addObligation(FULL.id, OBLIGATION);
      result.current.completeObligation(FULL.id, "ob-1", "2027-03-01");
      result.current.updateDocument(FULL.id, { title: "Passport (new)" });
      result.current.setArchived(FULL.id, true);
      result.current.importMany([{ ...FULL, obligations: [] }]);
    });

    // The cloud already has doc-1, so the connect-time seed leaves it alone too.
    expect(saveDocument).not.toHaveBeenCalled();
    expect(result.current.documents[0].title).toBe("Passport");
    expect(result.current.awaitingCloud).toBe(true);
  });

  it("edits normally once the cloud copy lands, keeping its fields", async () => {
    const { result } = await loadedFromSlimCache();
    act(() => deliver([FULL]));

    act(() => result.current.setArchived(FULL.id, true));
    expect(saved()).toHaveLength(1);
    const [written] = saved();
    expect(written.partial).toBeUndefined();
    expect(written.archived).toBe(true);
    expect(written.obligations).toEqual(FULL.obligations);
    expect(written.note).toBe(FULL.note);
    expect(written.reference).toBe(FULL.reference);
    expect(result.current.awaitingCloud).toBe(false);
  });

  it("uploads a partial paper the cloud has never seen, as the only copy", async () => {
    vi.mocked(fetchDocuments).mockResolvedValue([]);
    await loadedFromSlimCache();
    expect(saved()).toHaveLength(1);
    expect(saved()[0].id).toBe(FULL.id);
    expect(saved()[0].partial).toBeUndefined();
  });

  it("goes back to the slim cache once the cloud copy has loaded", async () => {
    await loadedFromSlimCache();
    act(() => deliver([FULL]));
    const cached = JSON.parse(window.localStorage.getItem(KEY)!);
    expect(cached[0].obligations).toBeUndefined();
    expect(cached[0].note).toBeUndefined();
  });
});

describe("importMany", () => {
  it("a partial record in a backup cannot erase the fields it lacks", async () => {
    window.localStorage.setItem(KEY, JSON.stringify([SLIM]));
    const { result } = mount(true);
    await waitFor(() => expect(subscribeDocuments).toHaveBeenCalled());
    act(() => deliver([FULL]));

    act(() =>
      result.current.importMany([
        { ...FULL, title: "Passport (renewed)", obligations: [], note: undefined, partial: true },
      ])
    );
    const [written] = saved();
    expect(written.title).toBe("Passport (renewed)");
    expect(written.obligations).toEqual(FULL.obligations);
    expect(written.note).toBe(FULL.note);
  });
});
