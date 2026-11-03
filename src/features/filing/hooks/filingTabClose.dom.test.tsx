import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Signed in but offline, a save never settles; a tab closed meanwhile lost the
// change, and the next load's snapshot put the old copy back. Each is now queued
// first and sent again on the next load. (Papers: useFilingDocuments' own test.)
vi.mock("@/features/filing/data/filingData", () => ({
  fetchFolders: vi.fn(),
  saveFolder: vi.fn(),
  deleteFolder: vi.fn(),
  subscribeFolders: vi.fn(),
  fetchParties: vi.fn(),
  saveParty: vi.fn(),
  deleteParty: vi.fn(),
  subscribeParties: vi.fn(),
  fetchPlaces: vi.fn(),
  savePlace: vi.fn(),
  deletePlace: vi.fn(),
  subscribePlaces: vi.fn(),
}));

import * as data from "@/features/filing/data/filingData";
import { recordSyncedIds } from "@/utils/syncedIds";
import { useFilingFolders } from "./useFilingFolders";
import { useFilingParties } from "./useFilingParties";
import { useFilingPlaces } from "./useFilingPlaces";

const EMAIL = "a@example.com";
const never = () => new Promise<never>(() => {});
const m = <T,>(f: T) => vi.mocked(f) as unknown as ReturnType<typeof vi.fn>;

type Case = {
  name: string;
  domain: string;
  key: string;
  record: { id: string; name: string };
  fetch: unknown;
  save: unknown;
  del: unknown;
  subscribe: unknown;
  use: () => { list: { id: string }[]; rename: (id: string, name: string) => void; remove: (id: string) => void };
};

const cases: Case[] = [
  {
    name: "folders",
    domain: "filingFolders",
    key: "bookmarkdeck:filing:folders:v1",
    record: { id: "F1", name: "Taxes", homePlaceId: null, currentPlaceId: null, parentId: null, aliases: [], tags: [] } as never,
    fetch: data.fetchFolders,
    save: data.saveFolder,
    del: data.deleteFolder,
    subscribe: data.subscribeFolders,
    use: () => {
      const h = useFilingFolders(EMAIL, true);
      return { list: h.folders, rename: (id, name) => h.updateFolder(id, { name }), remove: h.removeFolder };
    },
  },
  {
    name: "parties",
    domain: "filingParties",
    key: "bookmarkdeck:filing:parties:v1",
    record: { id: "P1", name: "Mom", kind: "person", createdAt: null, updatedAt: null } as never,
    fetch: data.fetchParties,
    save: data.saveParty,
    del: data.deleteParty,
    subscribe: data.subscribeParties,
    use: () => {
      const h = useFilingParties(EMAIL, true);
      return { list: h.parties, rename: (id, name) => h.updateParty(id, { name }), remove: h.removeParty };
    },
  },
  {
    name: "places",
    domain: "filingPlaces",
    key: "bookmarkdeck:filing:places:v1",
    record: { id: "L1", name: "Garage", parentId: null } as never,
    fetch: data.fetchPlaces,
    save: data.savePlace,
    del: data.deletePlace,
    subscribe: data.subscribePlaces,
    use: () => {
      const h = useFilingPlaces(EMAIL, true);
      return { list: h.places, rename: (id, name) => h.updatePlace(id, { name }), remove: h.removePlace };
    },
  },
];

describe.each(cases)("filing $name — signed in, offline, tab closed", (c) => {
  beforeEach(() => {
    window.localStorage.clear();
    recordSyncedIds(c.domain, EMAIL, [c.record.id]);
    window.localStorage.setItem(`${c.key}:${EMAIL}`, JSON.stringify([c.record]));
    m(c.fetch).mockReset().mockResolvedValue([c.record]);
    m(c.subscribe).mockReset().mockReturnValue(() => {});
    m(c.save).mockReset().mockImplementation(never);
    m(c.del).mockReset().mockImplementation(never);
  });

  async function closeAfter(edit: (h: ReturnType<Case["use"]>) => void) {
    const tab = renderHook(c.use);
    await waitFor(() => expect(tab.result.current.list).toHaveLength(1));
    await waitFor(() => expect(c.subscribe).toHaveBeenCalled());
    act(() => edit(tab.result.current));
    tab.unmount();
    m(c.save).mockReset().mockResolvedValue(undefined);
    m(c.del).mockReset().mockResolvedValue(undefined);
    renderHook(c.use);
    await waitFor(() => expect(c.subscribe).toHaveBeenCalledTimes(2));
  }

  it("a rename is sent on the next load", async () => {
    await closeAfter((h) => h.rename(c.record.id, "Renamed"));
    expect(m(c.save).mock.calls.map(([, r]) => r.name)).toEqual(["Renamed"]);
  });

  it("a delete is sent on the next load", async () => {
    await closeAfter((h) => h.remove(c.record.id));
    expect(c.del).toHaveBeenCalledWith(EMAIL, c.record.id);
  });
});

// Another tab renamed a queued record after this one loaded. The replay used to
// send this tab's copy from load time, landing after the rename and undoing it.
describe.each(cases)("filing $name — replays the device's copy, not this tab's", (c) => {
  beforeEach(() => {
    window.localStorage.clear();
    recordSyncedIds(c.domain, EMAIL, [c.record.id]);
    window.localStorage.setItem(`${c.key}:${EMAIL}`, JSON.stringify([c.record]));
    m(c.subscribe).mockReset().mockReturnValue(() => {});
    m(c.save).mockReset().mockResolvedValue(undefined);
    m(c.del).mockReset().mockResolvedValue(undefined);
  });

  it("sends the other tab's later edit", async () => {
    let answer: (v: unknown) => void = () => {};
    m(c.fetch).mockReset().mockImplementation(() => new Promise((res) => (answer = res)));
    const tab = renderHook(c.use);
    await waitFor(() => expect(tab.result.current.list).toHaveLength(1));
    await waitFor(() => expect(c.fetch).toHaveBeenCalled());
    // The other tab: its edit in the shared cache, and queued.
    window.localStorage.setItem(`${c.key}:${EMAIL}`, JSON.stringify([{ ...c.record, name: "Renamed elsewhere" }]));
    window.localStorage.setItem(`bookmarkdeck:pending-up:${c.domain}:${EMAIL}`, JSON.stringify([c.record.id]));
    await act(async () => answer([c.record]));
    await waitFor(() => expect(c.subscribe).toHaveBeenCalled());
    expect(m(c.save).mock.calls.map(([, r]) => r.name)).toEqual(["Renamed elsewhere"]);
  });
});
