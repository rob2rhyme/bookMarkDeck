import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/inventory/data/inventoryData", () => ({
  deleteItem: vi.fn(),
  fetchItems: vi.fn(async () => []),
  saveItem: vi.fn(async () => {}),
  subscribeItems: vi.fn(() => () => {}),
  deleteLocation: vi.fn(async () => {}),
  fetchLocations: vi.fn(async () => []),
  saveLocation: vi.fn(async () => {}),
  subscribeLocations: vi.fn(() => () => {}),
  deleteWishlist: vi.fn(async () => {}),
  fetchWishlist: vi.fn(async () => []),
  saveWishlist: vi.fn(async () => {}),
  subscribeWishlist: vi.fn(() => () => {}),
}));

import {
  deleteItem,
  fetchItems,
  fetchLocations,
  fetchWishlist,
  saveItem,
  saveLocation,
  saveWishlist,
  subscribeItems,
  subscribeLocations,
  subscribeWishlist,
} from "@/features/inventory/data/inventoryData";
import type { InventoryItem, InventoryLocation, WishlistItem } from "@/features/inventory/lib/types";
import { pendingUpsertIds } from "@/utils/pendingDeletes";
import { recordSyncedIds, syncedIds } from "@/utils/syncedIds";
import { useInventory } from "./useInventory";
import { useInventoryLocations } from "./useInventoryLocations";
import { useWishlist } from "./useWishlist";

// On connect the hook uploaded every cached item the cloud lacked. An item
// deleted on another device is exactly such an item — so a stale laptop
// recreated it, pointing at R2 photos the delete had already purged. And a
// delete made while disconnected was never replayed.
const EMAIL = "a@example.com";
const KEY = `bookmarkdeck:inventory:items:v1:${EMAIL}`;
const item = (id: string) => ({ id, name: id, locationId: null }) as InventoryItem;
const savedIds = () => vi.mocked(saveItem).mock.calls.map(([, x]) => x.id).sort();

beforeEach(() => {
  localStorage.clear();
  vi.mocked(saveItem).mockClear();
  vi.mocked(deleteItem).mockReset().mockResolvedValue(undefined as never);
  vi.mocked(subscribeItems).mockReset().mockReturnValue(() => {});
  for (const save of [saveLocation, saveWishlist]) vi.mocked(save).mockReset().mockResolvedValue();
  for (const sub of [subscribeLocations, subscribeWishlist]) vi.mocked(sub).mockReset().mockReturnValue(() => {});
});

function connectWith(cache: InventoryItem[], cloud: InventoryItem[]) {
  localStorage.setItem(KEY, JSON.stringify(cache));
  vi.mocked(fetchItems).mockResolvedValue(cloud);
  return renderHook(() => useInventory(EMAIL, true));
}

describe("useInventory — deletions stay deleted", () => {
  it("doesn't re-upload an item deleted on another device", async () => {
    recordSyncedIds("inventoryItems", EMAIL, ["I1", "I2"]); // the last snapshot had both
    connectWith([item("I1"), item("I2"), item("I3")], [item("I1")]);
    await waitFor(() => expect(subscribeItems).toHaveBeenCalled());
    expect(savedIds()).toEqual(["I3"]);
  });

  it("uploads everything from a cache that has never synced", async () => {
    connectWith([item("I1"), item("I2")], []);
    await waitFor(() => expect(subscribeItems).toHaveBeenCalled());
    expect(savedIds()).toEqual(["I1", "I2"]);
  });

  it("remembers what each snapshot held", async () => {
    vi.mocked(subscribeItems).mockImplementation((_e, cb) => {
      cb([item("I7")], { fromCache: false, hasPendingWrites: false });
      return () => {};
    });
    connectWith([], []);
    await waitFor(() => expect(subscribeItems).toHaveBeenCalled());
    expect([...syncedIds("inventoryItems", EMAIL)]).toEqual(["I7"]);
  });

  it("replays a delete made while disconnected", async () => {
    localStorage.setItem(KEY, JSON.stringify([item("I1")]));
    vi.mocked(fetchItems).mockResolvedValue([item("I1")]);
    const { result, rerender } = renderHook(({ on }) => useInventory(EMAIL, on), {
      initialProps: { on: false },
    });
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    act(() => result.current.removeItem("I1"));
    rerender({ on: true });
    await waitFor(() => expect(subscribeItems).toHaveBeenCalled());
    expect(deleteItem).toHaveBeenCalledWith(EMAIL, "I1");
    expect(savedIds()).toEqual([]);
  });
});

// An edit made while disconnected to a record the cloud already held was
// applied here, then undone by the first snapshot: the connect-time seed
// uploads only what the cloud never had.
describe("offline edits", () => {
  /** Mount `use` disconnected over `cache`, the cloud holding `cloud`, then
   *  run `edit` and reconnect. */
  async function editOffline<R>(
    use: (on: boolean) => R,
    ready: (r: R) => boolean,
    edit: (r: R) => void,
    subscribed: unknown
  ) {
    const { result, rerender } = renderHook(({ on }) => use(on), { initialProps: { on: false } });
    await waitFor(() => expect(ready(result.current)).toBe(true));
    act(() => edit(result.current));
    rerender({ on: true });
    await waitFor(() => expect(subscribed).toHaveBeenCalled());
  }

  it("pushes an item marked used while disconnected", async () => {
    recordSyncedIds("inventoryItems", EMAIL, ["I1"]);
    localStorage.setItem(KEY, JSON.stringify([item("I1")]));
    vi.mocked(fetchItems).mockResolvedValue([item("I1")]);
    await editOffline(
      (on) => useInventory(EMAIL, on),
      (r) => r.items.length === 1,
      (r) => r.markUsed("I1"),
      subscribeItems
    );
    const [[, pushed]] = vi.mocked(saveItem).mock.calls;
    expect(pushed.activity?.map((a) => a.type)).toEqual(["used"]);
    expect(pendingUpsertIds("inventoryItems", EMAIL).size).toBe(0);
  });

  it("lets a delete made on another device win over the edit", async () => {
    recordSyncedIds("inventoryItems", EMAIL, ["I1"]);
    localStorage.setItem(KEY, JSON.stringify([item("I1")]));
    vi.mocked(fetchItems).mockResolvedValue([]);
    await editOffline(
      (on) => useInventory(EMAIL, on),
      (r) => r.items.length === 1,
      (r) => r.markUsed("I1"),
      subscribeItems
    );
    expect(saveItem).not.toHaveBeenCalled();
  });

  it("pushes a location renamed while disconnected", async () => {
    const loc = { id: "L1", name: "Garage", parentId: null } as InventoryLocation;
    recordSyncedIds("inventoryLocations", EMAIL, ["L1"]);
    localStorage.setItem(`bookmarkdeck:inventory:locations:v1:${EMAIL}`, JSON.stringify([loc]));
    vi.mocked(fetchLocations).mockResolvedValue([loc]);
    await editOffline(
      (on) => useInventoryLocations(EMAIL, on),
      (r) => r.locations.length === 1,
      (r) => r.renameLocation("L1", "Shed"),
      subscribeLocations
    );
    expect(vi.mocked(saveLocation).mock.calls.map(([, l]) => l.name)).toEqual(["Shed"]);
  });

  it("pushes a wishlist entry edited while disconnected", async () => {
    const wish = { id: "W1", name: "Drill" } as WishlistItem;
    recordSyncedIds("inventoryWishlist", EMAIL, ["W1"]);
    localStorage.setItem(`bookmarkdeck:inventory:wishlist:v1:${EMAIL}`, JSON.stringify([wish]));
    vi.mocked(fetchWishlist).mockResolvedValue([wish]);
    await editOffline(
      (on) => useWishlist(EMAIL, on),
      (r) => r.items.length === 1,
      (r) => r.upsert({ ...wish, name: "Cordless drill" }),
      subscribeWishlist
    );
    expect(vi.mocked(saveWishlist).mock.calls.map(([, w]) => w.name)).toEqual(["Cordless drill"]);
  });
});

// A live listener fires at once from this device's own unconfirmed write,
// before the server has seen it — recording that id as "the cloud already
// has this" risks never re-uploading it if the write never lands.
describe("syncedIds — pending writes", () => {
  it("doesn't record an item id from a snapshot carrying unacknowledged writes", async () => {
    vi.mocked(subscribeItems).mockImplementation((_e, cb) => {
      cb([item("new")], { fromCache: false, hasPendingWrites: true });
      return () => {};
    });
    renderHook(() => useInventory(EMAIL, true));
    await waitFor(() => expect(subscribeItems).toHaveBeenCalled());
    expect(syncedIds("inventoryItems", EMAIL).has("new")).toBe(false);
  });

  it("doesn't record a location id from a snapshot carrying unacknowledged writes", async () => {
    vi.mocked(subscribeLocations).mockImplementation((_e, cb) => {
      cb([{ id: "new", name: "new", parentId: null } as InventoryLocation], {
        fromCache: false,
        hasPendingWrites: true,
      });
      return () => {};
    });
    renderHook(() => useInventoryLocations(EMAIL, true));
    await waitFor(() => expect(subscribeLocations).toHaveBeenCalled());
    expect(syncedIds("inventoryLocations", EMAIL).has("new")).toBe(false);
  });

  it("doesn't record a wishlist id from a snapshot carrying unacknowledged writes", async () => {
    vi.mocked(subscribeWishlist).mockImplementation((_e, cb) => {
      cb([{ id: "new", name: "new" } as WishlistItem], { fromCache: false, hasPendingWrites: true });
      return () => {};
    });
    renderHook(() => useWishlist(EMAIL, true));
    await waitFor(() => expect(subscribeWishlist).toHaveBeenCalled());
    expect(syncedIds("inventoryWishlist", EMAIL).has("new")).toBe(false);
  });
});

// Signed in but offline, Firestore holds a write in this tab's memory until the
// server has it: the save never settles, and a tab closed meanwhile lost it — the
// next load's snapshot put the old copy back (an edit), or brought it back (a
// delete). Each change is now queued first and sent again on the next load.
describe("signed in, offline, tab closed", () => {
  const never = () => new Promise<never>(() => {});

  /** Mount connected, make `edit` with every write hanging, close the tab, and
   *  load again with the network back. */
  async function closeOffline<R>(
    use: () => R,
    ready: (r: R) => boolean,
    edit: (r: R) => void,
    writes: ReturnType<typeof vi.fn>[],
    subscribed: ReturnType<typeof vi.fn>
  ) {
    writes.forEach((w) => w.mockImplementation(never));
    const tab = renderHook(use);
    await waitFor(() => expect(ready(tab.result.current)).toBe(true));
    await waitFor(() => expect(subscribed).toHaveBeenCalled());
    act(() => edit(tab.result.current));
    tab.unmount();
    writes.forEach((w) => w.mockReset().mockResolvedValue(undefined));
    renderHook(use);
    await waitFor(() => expect(subscribed).toHaveBeenCalledTimes(2));
  }

  it("an item edit and a delete are sent on the next load", async () => {
    const both = [item("I1"), item("I2")];
    recordSyncedIds("inventoryItems", EMAIL, ["I1", "I2"]);
    localStorage.setItem(KEY, JSON.stringify(both));
    vi.mocked(fetchItems).mockResolvedValue(both);
    await closeOffline(
      () => useInventory(EMAIL, true),
      (r) => r.items.length === 2,
      (r) => {
        r.markUsed("I1");
        r.removeItem("I2");
      },
      [vi.mocked(saveItem), vi.mocked(deleteItem)],
      vi.mocked(subscribeItems)
    );
    expect(deleteItem).toHaveBeenCalledWith(EMAIL, "I2");
    const [[, pushed]] = vi.mocked(saveItem).mock.calls;
    expect(pushed).toMatchObject({ id: "I1" });
    expect(pushed.activity?.map((a) => a.type)).toEqual(["used"]);
  });

  it("a location rename is sent on the next load", async () => {
    const loc = { id: "L1", name: "Garage", parentId: null } as InventoryLocation;
    recordSyncedIds("inventoryLocations", EMAIL, ["L1"]);
    localStorage.setItem(`bookmarkdeck:inventory:locations:v1:${EMAIL}`, JSON.stringify([loc]));
    vi.mocked(fetchLocations).mockResolvedValue([loc]);
    await closeOffline(
      () => useInventoryLocations(EMAIL, true),
      (r) => r.locations.length === 1,
      (r) => r.renameLocation("L1", "Shed"),
      [vi.mocked(saveLocation)],
      vi.mocked(subscribeLocations)
    );
    expect(vi.mocked(saveLocation).mock.calls.map(([, l]) => l.name)).toEqual(["Shed"]);
  });

  it("a wishlist edit is sent on the next load", async () => {
    const wish = { id: "W1", name: "Drill" } as WishlistItem;
    recordSyncedIds("inventoryWishlist", EMAIL, ["W1"]);
    localStorage.setItem(`bookmarkdeck:inventory:wishlist:v1:${EMAIL}`, JSON.stringify([wish]));
    vi.mocked(fetchWishlist).mockResolvedValue([wish]);
    await closeOffline(
      () => useWishlist(EMAIL, true),
      (r) => r.items.length === 1,
      (r) => r.upsert({ ...wish, name: "Cordless drill" }),
      [vi.mocked(saveWishlist)],
      vi.mocked(subscribeWishlist)
    );
    expect(vi.mocked(saveWishlist).mock.calls.map(([, w]) => w.name)).toEqual(["Cordless drill"]);
  });
});
