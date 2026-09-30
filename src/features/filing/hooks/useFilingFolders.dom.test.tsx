import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/filing/data/filingData", () => ({
  deleteFolder: vi.fn(),
  fetchFolders: vi.fn(async () => []),
  saveFolder: vi.fn(async () => {}),
  subscribeFolders: vi.fn(() => () => {}),
}));

import { deleteFolder, fetchFolders, saveFolder, subscribeFolders } from "@/features/filing/data/filingData";
import type { FilingFolder } from "@/features/filing/lib/types";
import { pendingUpsertIds } from "@/utils/pendingDeletes";
import { recordSyncedIds, syncedIds } from "@/utils/syncedIds";
import { useFilingFolders } from "./useFilingFolders";

// takenAt is a local day (custody's "out N days" counts from it), but it was
// stamped with the UTC date: a check-out on a US evening read "out -1 days".
// CI runs in UTC, where the two agree, so this pins a zone and a clock.
describe("useFilingFolders — check-out day", () => {
  const saved = process.env.TZ;
  beforeEach(() => {
    process.env.TZ = "America/Los_Angeles";
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-01T03:00:00.000Z")); // 8pm, Sep 30
  });
  afterEach(() => {
    vi.useRealTimers();
    process.env.TZ = saved;
  });

  it("stamps takenAt with today's LOCAL date", async () => {
    const { result } = renderHook(() => useFilingFolders("a@example.com"));
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    let id = "";
    act(() => {
      id = result.current.addFolder({ name: "Taxes 2025" })!.id;
    });
    act(() => result.current.checkOut(id, { toPlaceId: null, heldBy: "Accountant" }));
    expect(result.current.folders.find((f) => f.id === id)!.takenAt).toBe("2026-09-30");
  });
});

// On connect, each filing hook uploaded every cached record the cloud lacked.
// A folder deleted on another device is exactly such a record, so a laptop with
// a stale cache recreated it for everyone. And a delete made while disconnected
// was never replayed, so the first snapshot brought it back.
describe("useFilingFolders — deletions stay deleted", () => {
  const EMAIL = "a@example.com";
  const KEY = `bookmarkdeck:filing:folders:v1:${EMAIL}`;
  const f = (id: string) => ({ id, name: id, homePlaceId: null, currentPlaceId: null, parentId: null, aliases: [] }) as unknown as FilingFolder;
  const savedIds = () => vi.mocked(saveFolder).mock.calls.map(([, x]) => x.id).sort();

  beforeEach(() => {
    localStorage.clear();
    vi.mocked(saveFolder).mockClear();
    vi.mocked(deleteFolder).mockReset().mockResolvedValue(undefined as never);
    vi.mocked(subscribeFolders).mockReset().mockReturnValue(() => {});
  });

  function connectWith(cache: FilingFolder[], cloud: FilingFolder[]) {
    localStorage.setItem(KEY, JSON.stringify(cache));
    vi.mocked(fetchFolders).mockResolvedValue(cloud);
    return renderHook(({ on }) => useFilingFolders(EMAIL, on), { initialProps: { on: true } });
  }

  it("doesn't re-upload a folder deleted on another device", async () => {
    recordSyncedIds("filingFolders", EMAIL, ["F1", "F2"]); // the last snapshot had both
    connectWith([f("F1"), f("F2"), f("F3")], [f("F1")]); // F2 since deleted; F3 new here
    await waitFor(() => expect(subscribeFolders).toHaveBeenCalled());
    expect(savedIds()).toEqual(["F3"]);
  });

  // The guarantee: an account that has never synced loses nothing.
  it("uploads everything from a cache that has never synced", async () => {
    connectWith([f("F1"), f("F2")], []);
    await waitFor(() => expect(subscribeFolders).toHaveBeenCalled());
    expect(savedIds()).toEqual(["F1", "F2"]);
  });

  it("remembers what each snapshot held", async () => {
    vi.mocked(subscribeFolders).mockImplementation((_e, cb) => {
      cb([f("F1"), f("F9")]);
      return () => {};
    });
    connectWith([], []);
    await waitFor(() => expect(subscribeFolders).toHaveBeenCalled());
    expect([...syncedIds("filingFolders", EMAIL)].sort()).toEqual(["F1", "F9"]);
  });

  it("replays a delete made while disconnected, before anything else", async () => {
    localStorage.setItem(KEY, JSON.stringify([f("F1")]));
    vi.mocked(fetchFolders).mockResolvedValue([f("F1")]);
    const { result, rerender } = renderHook(({ on }) => useFilingFolders(EMAIL, on), {
      initialProps: { on: false },
    });
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    act(() => result.current.removeFolder("F1"));
    rerender({ on: true });
    await waitFor(() => expect(subscribeFolders).toHaveBeenCalled());
    expect(deleteFolder).toHaveBeenCalledWith(EMAIL, "F1");
    expect(savedIds()).toEqual([]);
  });
});

// An edit made while disconnected to a folder the cloud already held was
// applied here and then undone: the connect-time seed uploads only what the
// cloud never had, and the first snapshot put the cloud copy back.
describe("useFilingFolders — offline edits", () => {
  const EMAIL = "a@example.com";
  const KEY = `bookmarkdeck:filing:folders:v1:${EMAIL}`;
  const f = (id: string) => ({ id, name: id, homePlaceId: null, currentPlaceId: null, parentId: null, aliases: [] }) as unknown as FilingFolder;
  const saves = () => vi.mocked(saveFolder).mock.calls.map(([, x]) => x);

  beforeEach(() => {
    localStorage.clear();
    vi.mocked(saveFolder).mockClear();
    vi.mocked(deleteFolder).mockReset().mockResolvedValue(undefined as never);
    vi.mocked(subscribeFolders).mockReset().mockReturnValue(() => {});
  });

  /** A synced device holding F1, disconnected, about to reconnect to `cloud`. */
  async function offline(cloud: FilingFolder[]) {
    recordSyncedIds("filingFolders", EMAIL, ["F1"]);
    localStorage.setItem(KEY, JSON.stringify([f("F1")]));
    vi.mocked(fetchFolders).mockResolvedValue(cloud);
    const hook = renderHook(({ on }) => useFilingFolders(EMAIL, on), { initialProps: { on: false } });
    await waitFor(() => expect(hook.result.current.folders).toHaveLength(1));
    const reconnect = async () => {
      hook.rerender({ on: true });
      await waitFor(() => expect(subscribeFolders).toHaveBeenCalled());
    };
    return { ...hook, reconnect };
  }

  it("pushes an edit made while disconnected on connect", async () => {
    const { result, reconnect } = await offline([f("F1")]);
    act(() => result.current.updateFolder("F1", { name: "Taxes 2025" }));
    await reconnect();
    expect(saves().map((x) => [x.id, x.name])).toEqual([["F1", "Taxes 2025"]]);
    expect(pendingUpsertIds("filingFolders", EMAIL).size).toBe(0);
  });

  it("lets a delete made on another device win over the edit", async () => {
    const { result, reconnect } = await offline([]);
    act(() => result.current.updateFolder("F1", { name: "Taxes 2025" }));
    await reconnect();
    expect(saveFolder).not.toHaveBeenCalled();
  });

  it("doesn't push back a folder edited and then deleted while disconnected", async () => {
    const { result, reconnect } = await offline([f("F1")]);
    act(() => result.current.updateFolder("F1", { name: "Taxes 2025" }));
    act(() => result.current.removeFolder("F1"));
    await reconnect();
    expect(deleteFolder).toHaveBeenCalledWith(EMAIL, "F1");
    expect(saveFolder).not.toHaveBeenCalled();
  });
});
